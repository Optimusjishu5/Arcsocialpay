'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPublicClient, createWalletClient, custom, erc20Abi, formatUnits, http, isAddress, type EIP1193Provider } from 'viem'
import { useAccount } from 'wagmi'
import { appStore } from '../../store/appStore'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, ArrowDown, Check, Clock, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import {
  getMainnetBridgeChains, kitErrorMessage, switchWalletChain, toViemChain, withAddChainFallback, type EvmChainDef,
} from '../../lib/circleKit'
import {
  getDeliveryStatus, getRouteQuotes, validateRouteTxs, type DeliveryStatus, type ProviderResult, type RouteQuote, type RouteRequest,
} from '../../lib/routeProviders'
import { fieldClass, fieldLabel, fieldStyle } from '../pay/ShareLinkBox'
import { parseUsdc } from '@/onchain-money'
import { Zap, Rocket, Layers } from 'lucide-react'
import { GradientIcon, type Tone } from '../dashboard/ui'
import type { LucideIcon } from 'lucide-react'

const PROVIDER_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  Across: { icon: Zap, tone: 'teal' },
  Relay: { icon: Rocket, tone: 'violet' },
  'LI.FI': { icon: Layers, tone: 'amber' },
}


const QUOTE_MAX_AGE_MS = 60_000
const WARN_ABOVE_RAW = 100_000_000n // 100 USDC

type Phase = 'idle' | 'quoting' | 'sending' | 'tracking'

const fmtEta = (s?: number) => (s === undefined ? 'n/a' : s < 5 ? 'about 2 seconds' : s < 90 ? `~${Math.round(s)} seconds` : `~${Math.round(s / 60)} min`)

export function RouteBridge() {
  const { address, isConnected, connector } = useAccount()
  const [chains, setChains] = useState<EvmChainDef[]>([])
  const [from, setFrom] = useState('Base')
  const [to, setTo] = useState('Arc')
  const [amount, setAmount] = useState('')
  const [customRecipient, setCustomRecipient] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [results, setResults] = useState<ProviderResult[] | null>(null)
  const [picked, setPicked] = useState<RouteQuote | null>(null)
  const [reqUsed, setReqUsed] = useState<RouteRequest | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepLabel, setStepLabel] = useState('')
  const [sentHashes, setSentHashes] = useState<{ label: string; hash: string; url: string }[]>([])
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null)
  const [error, setError] = useState('')
  const stopPoll = useRef(false)

  useEffect(() => {
    let cancelled = false
    getMainnetBridgeChains()
      .then((list) => {
        if (cancelled) return
        setChains(list)
        const names = list.map((c) => c.chain as string)
        setFrom((f) => (names.includes(f) ? f : names[0] ?? f))
        setTo((t) => (names.includes(t) ? t : names[0] ?? t))
      })
      .catch(() => setError('Could not load the list of supported chains.'))
    return () => { cancelled = true }
  }, [])
  useEffect(() => () => { stopPoll.current = true }, [])

  const fromDef = chains.find((c) => String(c.chain) === from)
  const toDef = chains.find((c) => String(c.chain) === to)
  const recipient = customRecipient.trim()

  useEffect(() => {
    if (!fromDef?.usdcAddress || !address) return
    let cancelled = false
    createPublicClient({ chain: toViemChain(fromDef), transport: http() })
      .readContract({ address: fromDef.usdcAddress as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((b) => { if (!cancelled) setBalance(b) })
      .catch(() => { if (!cancelled) setBalance(null) })
    return () => { cancelled = true }
  }, [fromDef, address, phase])

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
  const busy = phase === 'quoting' || phase === 'sending'
  const canQuote = isConnected && !!address && !!fromDef?.usdcAddress && !!toDef?.usdcAddress && amountRaw !== null && !problem && !busy

  function resetResults() { setResults(null); setPicked(null) }

  async function compare() {
    if (!address || !fromDef || !toDef || amountRaw === null) return
    setError(''); resetResults(); setSentHashes([]); setDelivery(null); setPhase('quoting')
    const req: RouteRequest = {
      fromChainId: fromDef.chainId, toChainId: toDef.chainId,
      fromToken: fromDef.usdcAddress as `0x${string}`, toToken: toDef.usdcAddress as `0x${string}`,
      amountRaw, user: address, recipient: (recipient || address) as `0x${string}`,
    }
    try {
      const res = await getRouteQuotes(req)
      res.sort((a, b) => Number((b.quote?.amountOut ?? -1n) - (a.quote?.amountOut ?? -1n)))
      setReqUsed(req); setResults(res)
      const best = res.find((r) => r.quote)?.quote ?? null
      setPicked(best)
      if (!best) setError('None of the providers could serve this route right now. Try another pair or amount.')
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setPhase('idle')
    }
  }

  async function execute() {
    if (!picked || !reqUsed || !fromDef || !connector) return
    setError('')
    if (Date.now() - picked.fetchedAt > QUOTE_MAX_AGE_MS) return setError('This quote is more than a minute old. Compare routes again for a fresh price.')
    const bad = validateRouteTxs(picked, reqUsed)
    if (bad) return setError(bad)
    setPhase('sending'); setSentHashes([])
    try {
      const chain = toViemChain(fromDef)
      const raw = (await connector.getProvider()) as EIP1193Provider
      const provider = withAddChainFallback(raw, [chain])
      await switchWalletChain(provider, chain)
      const wallet = createWalletClient({ account: reqUsed.user, chain, transport: custom(provider) })
      const reader = createPublicClient({ chain, transport: http() })
      let lastHash = ''
      for (const tx of picked.txs) {
        setStepLabel(tx.label)
        const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
        const url = fromDef.explorerUrl.replace('{hash}', hash)
        setSentHashes((p) => [...p, { label: tx.label, hash, url }])
        const receipt = await reader.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error(`${tx.label} failed onchain. Nothing further was sent.`)
        lastHash = hash
      }
      const summary = `${amount.trim()} USDC from ${from} to ${to} via ${picked.provider}`
      appStore.createPendingTxRecord({
        txHash: lastHash, chainId: fromDef.chainId, direction: 'sent', amount: amount.trim(),
        fromAddress: reqUsed.user, toAddress: reqUsed.user, kind: 'bridge', symbol: 'USDC', summary,
      })
      setPhase('tracking'); setDelivery('pending'); stopPoll.current = false
      // Source transaction is confirmed; wait for the provider to report delivery.
      for (let i = 0; i < 150 && !stopPoll.current; i++) {
        const s = await getDeliveryStatus(picked, reqUsed, lastHash)
        setDelivery(s)
        if (s === 'done') appStore.confirmTxRecord(lastHash)
        if (s === 'failed') appStore.failTxRecord(lastHash)
        if (s !== 'pending') break
        await new Promise((r) => setTimeout(r, 4000))
      }
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setPhase('idle')
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to compare routes</p>
        <ConnectKitButton />
      </div>
    )
  }

  const best = results?.find((r) => r.quote)?.quote
  const nativeValue = picked?.txs.reduce((sum, t) => sum + t.value, 0n) ?? 0n

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Compares Across, Relay and LI.FI for USDC. Each provider runs its own contracts and you are subject to its terms. Mainnet transfers move real funds and cannot be undone.</span>
      </div>

      <div className="rounded-2xl p-4 space-y-4" data-tc="">
        <Select label="From" value={from} chains={chains} onChange={(v) => { setFrom(v); resetResults() }} disabled={busy} />
        <div className="flex justify-center -my-1" style={{ color: 'var(--muted)' }}><ArrowDown size={18} /></div>
        <Select label="To" value={to} chains={chains} onChange={(v) => { setTo(v); resetResults() }} disabled={busy} />
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={fieldLabel.replace(' mb-1.5', '')} style={{ color: 'var(--muted)' }}>Amount</label>
            {balance !== null && (
              <button className="text-xs" style={{ color: 'var(--muted)' }} onClick={() => { setAmount(formatUnits(balance, 6)); resetResults() }}>
                Balance: <span className="tabnum font-medium">{formatUnits(balance, 6)}</span> USDC · Max
              </button>
            )}
          </div>
          <div className="relative">
            <input value={amount} onChange={(e) => { setAmount(e.target.value); resetResults() }} inputMode="decimal" placeholder="0.00" disabled={busy}
              className={`${fieldClass} h-14 pr-16 text-xl font-semibold tabnum`} style={fieldStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
        </div>
        <details>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Send to a different address</summary>
          <input value={customRecipient} onChange={(e) => { setCustomRecipient(e.target.value.trim()); resetResults() }} placeholder="0x... (defaults to your wallet)"
            className={`${fieldClass} mono mt-2`} style={fieldStyle} />
        </details>
        {problem && <p className="text-xs" style={{ color: 'var(--danger)' }}>{problem}</p>}
        {amountRaw !== null && amountRaw > WARN_ABOVE_RAW && <p className="text-xs" style={{ color: 'var(--danger)' }}>This is more than 100 USDC. Double-check the route before you confirm.</p>}
        <Button className="w-full" size="lg" variant={results ? 'secondary' : 'primary'} loading={phase === 'quoting'} disabled={!canQuote} onClick={() => void compare()}>
          {results ? 'Refresh quotes' : 'Compare routes'}
        </Button>
      </div>

      {results && (
        <div className="space-y-2">
          {results.map((r) => {
            const q = r.quote
            const isPicked = q && picked?.provider === q.provider
            return (
              <button key={r.provider} disabled={!q || busy} onClick={() => q && setPicked(q)}
                className="w-full text-left rounded-2xl p-4 transition-all disabled:cursor-default"
                style={{
                  background: 'var(--surface)',
                  border: `1.5px solid ${isPicked ? 'var(--tone-to)' : 'var(--border)'}`,
                  opacity: q ? 1 : 0.6,
                }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-sm flex items-center gap-2.5" style={{ color: 'var(--ink)' }}>
                    <GradientIcon icon={PROVIDER_STYLE[r.provider].icon} tone={PROVIDER_STYLE[r.provider].tone} size={32} />
                    {r.provider}
                    {q && best && q.provider === best.provider && (
                      <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Best rate</span>
                    )}
                  </span>
                  {q ? (
                    <span className="tabnum font-semibold" style={{ color: 'var(--ink)' }}>{formatUnits(q.amountOut, 6)} USDC</span>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>Unavailable</span>
                  )}
                </div>
                {q ? (
                  <p className="text-xs mt-1 flex items-center gap-1.5" style={{ color: 'var(--muted)' }}>
                    <Clock size={12} /> {fmtEta(q.etaSeconds)}
                    {q.minOut ? ` · minimum ${formatUnits(q.minOut, 6)}` : ''}
                    {amountRaw !== null && q.amountOut <= amountRaw ? ` · cost ${formatUnits(amountRaw - q.amountOut, 6)} USDC` : ''}
                  </p>
                ) : (
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{r.error}</p>
                )}
              </button>
            )
          })}
          {picked && nativeValue > 0n && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              This route also sends {formatUnits(nativeValue, fromDef?.nativeCurrency.decimals ?? 18)} {fromDef?.nativeCurrency.symbol} with the transaction.
            </p>
          )}
          {picked && (
            <Button className="w-full" size="lg" loading={phase === 'sending'} disabled={busy || phase === 'tracking'} onClick={() => void execute()}>
              {phase === 'sending' ? stepLabel || 'Confirm in wallet...' : `Bridge ${amount.trim()} USDC with ${picked.provider}`}
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
        </div>
      )}

      {(sentHashes.length > 0 || delivery) && (
        <div className="rounded-2xl p-4 space-y-3" data-tc="">
          <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Progress</h3>
          {sentHashes.map((h) => (
            <Line key={h.hash} state="done" label={`${h.label} confirmed`}>
              <a href={h.url} target="_blank" rel="noopener noreferrer" aria-label="View on explorer" style={{ color: 'var(--tone-text)' }}><ExternalLink size={13} /></a>
            </Line>
          ))}
          {delivery && (
            <Line state={delivery === 'done' ? 'done' : delivery === 'failed' ? 'bad' : 'wait'}
              label={delivery === 'done' ? `Delivered on ${to}` : delivery === 'failed' ? 'The provider reported a failure or refund. Check its status page.' : `Waiting for ${to} to receive the funds...`} />
          )}
        </div>
      )}
    </div>
  )
}

function Line({ state, label, children }: { state: 'done' | 'wait' | 'bad'; label: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: state === 'done' ? 'var(--success-bg)' : state === 'bad' ? 'var(--danger-bg)' : 'var(--surface-muted)', color: state === 'done' ? 'var(--success)' : state === 'bad' ? 'var(--danger)' : 'var(--muted)' }}>
        {state === 'done' ? <Check size={14} /> : state === 'bad' ? <AlertCircle size={14} /> : <Loader2 size={14} className="animate-spin" />}
      </span>
      <span className="flex-1" style={{ color: 'var(--ink)' }}>{label}</span>
      {children}
    </div>
  )
}

function Select({ label, value, chains, onChange, disabled }: {
  label: string; value: string; chains: EvmChainDef[]; onChange: (v: string) => void; disabled: boolean
}) {
  return (
    <div>
      <label className={fieldLabel} style={{ color: 'var(--muted)' }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={fieldClass} style={fieldStyle}>
        {chains.length === 0 && <option value={value}>{value}</option>}
        {chains.map((c) => <option key={c.chain} value={c.chain}>{c.name}</option>)}
      </select>
    </div>
  )
}
