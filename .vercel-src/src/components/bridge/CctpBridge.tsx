'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPublicClient, erc20Abi, formatUnits, http, isAddress } from 'viem'
import { useAccount } from 'wagmi'
import { appStore } from '../../store/appStore'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, ArrowDown, Check, ExternalLink, Loader2 } from 'lucide-react'
import type { AppKit } from '@circle-fin/app-kit'
import { Button } from '../ui/Button'
import {
  createWalletAdapter, getKit, getMainnetBridgeChains, kitErrorMessage, switchWalletChain, toViemChain,
  type EvmChainDef,
} from '../../lib/circleKit'
import { ARC_CHAIN_ID } from '../../chains'
import { fieldClass, fieldLabel, fieldStyle } from '../pay/ShareLinkBox'
import { parseUsdc } from '@/onchain-money'

type Kit = AppKit
type BridgeResult = Awaited<ReturnType<Kit['bridge']>>
type Adapter = Awaited<ReturnType<typeof createWalletAdapter>>['adapter']

interface Quote {
  gas: { label: string; value: string }[]
  fees: { label: string; value: string }[]
}

type StepName = 'approve' | 'burn' | 'fetchAttestation' | 'mint'
const STEP_LABEL: Record<StepName, string> = {
  approve: 'Approve USDC',
  burn: 'Burn on source chain',
  fetchAttestation: 'Wait for Circle attestation',
  mint: 'Mint on destination chain',
}
const STEPS: StepName[] = ['approve', 'burn', 'fetchAttestation', 'mint']
const WARN_ABOVE_RAW = 100_000_000n // 100 USDC

export function CctpBridge() {
  const { address, isConnected, connector } = useAccount()
  const [chains, setChains] = useState<EvmChainDef[]>([])
  const [from, setFrom] = useState('Arc')
  const [to, setTo] = useState('Base')
  const [amount, setAmount] = useState('')
  const [customRecipient, setCustomRecipient] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [reviewedKey, setReviewedKey] = useState('')
  const [busy, setBusy] = useState<'quote' | 'bridge' | 'retry' | null>(null)
  const [done, setDone] = useState<Set<StepName>>(new Set())
  const [result, setResult] = useState<BridgeResult | null>(null)
  const [error, setError] = useState('')
  const adapterRef = useRef<Adapter | null>(null)

  useEffect(() => {
    let cancelled = false
    getMainnetBridgeChains()
      .then((list) => {
        if (cancelled) return
        setChains(list)
        const names = list.map((c) => c.chain as string)
        setFrom((f) => (names.includes(f) ? f : names[0] ?? f))
        setTo((t) => (names.includes(t) && t !== 'Arc' ? t : names.find((n) => n !== 'Arc') ?? t))
      })
      .catch(() => setError('Could not load the list of supported chains.'))
    return () => { cancelled = true }
  }, [])

  const fromDef = chains.find((c) => String(c.chain) === from)
  const toDef = chains.find((c) => String(c.chain) === to)
  const recipient = customRecipient.trim()
  const key = `${from}|${to}|${amount.trim()}|${recipient}|${address ?? ''}`
  const quoteFresh = quote !== null && reviewedKey === key

  // Source-chain USDC balance, read straight from that chain's RPC.
  useEffect(() => {
    if (!fromDef || !address || !fromDef.usdcAddress) return
    let cancelled = false
    const client = createPublicClient({ chain: toViemChain(fromDef), transport: http() })
    client
      .readContract({ address: fromDef.usdcAddress as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((b) => { if (!cancelled) setBalance(b) })
      .catch(() => { if (!cancelled) setBalance(null) })
    return () => { cancelled = true }
  }, [fromDef, address, result])

  const amountRaw = useMemo(() => {
    if (!/^\d+(\.\d{1,6})?$/.test(amount.trim())) return null
    const raw = parseUsdc(amount.trim())
    return raw > 0n ? raw : null
  }, [amount])

  const problem =
    from === to ? 'Pick two different chains.'
    : amount.trim() !== '' && amountRaw === null ? 'Enter a valid amount (max 6 decimals).'
    : amountRaw !== null && balance !== null && amountRaw > balance ? `Insufficient balance. You have ${formatUnits(balance, 6)} USDC on ${from}.`
    : recipient !== '' && !isAddress(recipient) ? 'Recipient is not a valid address.'
    : ''
  const canReview = isConnected && !!connector && !!fromDef && !!toDef && amountRaw !== null && !problem

  async function review() {
    if (!connector || !fromDef || !toDef || amountRaw === null) return
    setError(''); setQuote(null); setBusy('quote')
    try {
      const kit = await getKit()
      const { adapter } = await createWalletAdapter(connector, [toViemChain(fromDef), toViemChain(toDef)])
      const est = await kit.estimateBridge({
        from: { adapter, chain: fromDef },
        to: { adapter, chain: toDef, useForwarder: true, ...(recipient ? { recipientAddress: recipient } : {}) },
        amount: amount.trim(),
      })
      setQuote({
        gas: est.gasFees.map((g) => ({ label: `${g.name} gas (${g.blockchain})`, value: g.fees ? `${g.fees.fee} ${g.token}` : 'unavailable' })),
        fees: (est.fees ?? []).map((f) => ({ label: f.type, value: f.amount ? `${f.amount} ${f.token}` : 'unavailable' })),
      })
      setReviewedKey(key)
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  async function run(mode: 'bridge' | 'retry') {
    if (!connector || !fromDef || !toDef || !quoteFresh) return
    setError(''); setBusy(mode)
    if (mode === 'bridge') { setDone(new Set()); setResult(null) }
    const kit = await getKit()
    const handlers = STEPS.map((name) => {
      const fn = () => setDone((prev) => new Set(prev).add(name))
      kit.on(`bridge.${name}` as 'bridge.burn', fn)
      return [name, fn] as const
    })
    try {
      const chainList = [toViemChain(fromDef), toViemChain(toDef)]
      const { adapter, provider } = await createWalletAdapter(connector, chainList)
      adapterRef.current = adapter
      // Start from the source chain so the burn is signed there.
      await switchWalletChain(provider, chainList[0])
      const res = mode === 'retry' && result
        ? await kit.retryBridge(result, { from: adapter, to: adapter })
        : await kit.bridge({
            from: { adapter, chain: fromDef },
            to: { adapter, chain: toDef, useForwarder: true, ...(recipient ? { recipientAddress: recipient } : {}) },
            amount: amount.trim(),
          })
      setResult(res)
      const burnHash = res.steps.find((st) => st.name === 'burn')?.txHash
      if (burnHash && address) {
        // Recorded as soon as the source transaction exists; confirmed only when the whole transfer succeeds.
        appStore.createPendingTxRecord({
          txHash: burnHash, chainId: fromDef.chainId, direction: 'sent', amount: amount.trim(),
          fromAddress: address, toAddress: address, kind: 'bridge', symbol: 'USDC',
          summary: `${amount.trim()} USDC from ${fromDef.name} to ${toDef.name} via Circle`,
        })
        if (res.state === 'success') appStore.confirmTxRecord(burnHash)
      }
      if (res.state === 'error') {
        const failed = res.steps.find((s) => s.state === 'error')
        setError(`Transfer stopped at "${failed?.name ?? 'a step'}". Nothing is lost: resume it below.`)
      }
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      handlers.forEach(([name, fn]) => kit.off(`bridge.${name}` as 'bridge.burn', fn))
      setBusy(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to bridge USDC</p>
        <ConnectKitButton />
      </div>
    )
  }

  const succeeded = result?.state === 'success'
  const failed = result?.state === 'error'

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Mainnet bridging moves real funds and cannot be undone. Start with a small amount. Circle's transfer service completes the mint on the destination chain for a fee shown before you confirm.</span>
      </div>

      <div className="rounded-2xl p-4 space-y-4" data-tc="">
        <ChainSelect label="From" value={from} chains={chains} onChange={(v) => { setFrom(v); setQuote(null) }} disabled={busy !== null} />
        <div className="flex justify-center -my-1" style={{ color: 'var(--muted)' }}><ArrowDown size={18} /></div>
        <ChainSelect label="To" value={to} chains={chains} onChange={(v) => { setTo(v); setQuote(null) }} disabled={busy !== null} />

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={fieldLabel.replace(' mb-1.5', '')} style={{ color: 'var(--muted)' }}>Amount</label>
            {balance !== null && (
              <button className="text-xs" style={{ color: 'var(--muted)' }} onClick={() => setAmount(formatUnits(balance, 6))}>
                Balance: <span className="tabnum font-medium">{formatUnits(balance, 6)}</span> USDC · Max
              </button>
            )}
          </div>
          <div className="relative">
            <input value={amount} onChange={(e) => { setAmount(e.target.value); setQuote(null) }} inputMode="decimal" placeholder="0.00"
              disabled={busy !== null} className={`${fieldClass} h-14 pr-16 text-xl font-semibold tabnum`} style={fieldStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
        </div>

        <details>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Send to a different address</summary>
          <input value={customRecipient} onChange={(e) => { setCustomRecipient(e.target.value.trim()); setQuote(null) }} placeholder="0x... (defaults to your wallet)"
            className={`${fieldClass} mono mt-2`} style={fieldStyle} />
        </details>

        {problem && <p className="text-xs" style={{ color: 'var(--danger)' }}>{problem}</p>}
        {amountRaw !== null && amountRaw > WARN_ABOVE_RAW && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>This is more than 100 USDC. Double-check the route before you confirm.</p>
        )}

        {quoteFresh && quote && (
          <div className="rounded-xl p-3 space-y-1.5 text-xs" data-tp="">
            <p className="font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Estimated costs</p>
            {[...quote.fees, ...quote.gas].map((r, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span style={{ color: 'var(--ink-2)' }}>{r.label}</span><span className="tabnum" style={{ color: 'var(--ink)' }}>{r.value}</span>
              </div>
            ))}
            <p style={{ color: 'var(--subtle)' }}>Estimates can change before the transfer runs.</p>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
          </div>
        )}

        {failed ? (
          <Button className="w-full" size="lg" loading={busy === 'retry'} onClick={() => void run('retry')}>Resume transfer</Button>
        ) : succeeded ? (
          <Button className="w-full" size="lg" variant="secondary" onClick={() => { setResult(null); setDone(new Set()); setQuote(null); setAmount('') }}>Bridge again</Button>
        ) : quoteFresh ? (
          <Button className="w-full" size="lg" loading={busy === 'bridge'} onClick={() => void run('bridge')}>
            Bridge {amount.trim()} USDC to {to}
          </Button>
        ) : (
          <Button className="w-full" size="lg" loading={busy === 'quote'} disabled={!canReview} onClick={() => void review()}>Review transfer</Button>
        )}
        {fromDef && fromDef.chainId !== ARC_CHAIN_ID && toDef?.chainId !== ARC_CHAIN_ID && (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>Tip: SocialPay payments run on Arc. Bridge to Arc to use your USDC here.</p>
        )}
      </div>

      {(busy === 'bridge' || busy === 'retry' || result) && (
        <div className="rounded-2xl p-4 space-y-3" data-tc="">
          <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Progress</h3>
          {STEPS.map((s) => {
            const step = result?.steps.find((x) => x.name === s)
            const ok = done.has(s) || step?.state === 'success'
            const bad = step?.state === 'error'
            return (
              <div key={s} className="flex items-center gap-3 text-sm">
                <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: ok ? 'var(--success-bg)' : bad ? 'var(--danger-bg)' : 'var(--surface-muted)', color: ok ? 'var(--success)' : bad ? 'var(--danger)' : 'var(--muted)' }}>
                  {ok ? <Check size={14} /> : bad ? <AlertCircle size={14} /> : busy ? <Loader2 size={14} className="animate-spin" /> : null}
                </span>
                <span className="flex-1" style={{ color: 'var(--ink)' }}>{STEP_LABEL[s]}</span>
                {step?.explorerUrl && (
                  <a href={step.explorerUrl} target="_blank" rel="noopener noreferrer" aria-label={`${STEP_LABEL[s]} on explorer`} style={{ color: 'var(--tone-text)' }}>
                    <ExternalLink size={13} />
                  </a>
                )}
              </div>
            )
          })}
          {succeeded && (
            <p className="text-sm" style={{ color: 'var(--success)' }}>Done. The source transaction is confirmed and USDC arrived on {to}.</p>
          )}
        </div>
      )}
    </div>
  )
}

function ChainSelect({ label, value, chains, onChange, disabled }: {
  label: string; value: string; chains: EvmChainDef[]; onChange: (v: string) => void; disabled: boolean
}) {
  return (
    <div>
      <label className={fieldLabel} style={{ color: 'var(--muted)' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
        className={fieldClass} style={fieldStyle}>
        {chains.length === 0 && <option value={value}>{value}</option>}
        {chains.map((c) => <option key={c.chain} value={c.chain}>{c.name}</option>)}
      </select>
    </div>
  )
}
