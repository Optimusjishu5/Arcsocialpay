'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicClient, createWalletClient, custom, decodeFunctionData, erc20Abi, formatUnits, http, isAddress, parseUnits,
  type EIP1193Provider,
} from 'viem'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, ArrowUpDown, Check, Clock, ExternalLink, Layers, Loader2, Rocket, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '../ui/Button'
import { appStore } from '../../store/appStore'
import { kitErrorMessage, switchWalletChain, withAddChainFallback } from '../../lib/circleKit'
import {
  getDeliveryStatus, getRouteQuotes, validateRouteTxs, type DeliveryStatus, type ProviderResult, type RouteQuote, type RouteRequest,
} from '../../lib/routeProviders'
import { getChainUsdc, toViemBridgeChain, txUrl, useBridgeChains, type ChainUsdc } from '../../lib/bridgeChains'
import { ARC_CHAIN_ID } from '../../chains'
import { fieldClass, fieldLabel, fieldStyle } from '../pay/ShareLinkBox'
import { ChainPicker } from './ChainPicker'
import { GradientIcon, type Tone } from '../dashboard/ui'
import { TxReceipt } from '../ui/TxReceipt'

const PROVIDER_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  Across: { icon: Zap, tone: 'teal' },
  Relay: { icon: Rocket, tone: 'violet' },
  'LI.FI': { icon: Layers, tone: 'amber' },
}

const QUOTE_MAX_AGE_MS = 60_000
const WARN_ABOVE_USD = 100
const POLL_MAX_MS = 15 * 60_000

type Phase = 'idle' | 'quoting' | 'sending' | 'tracking'

const fmtEta = (s?: number) => (s === undefined ? 'n/a' : s < 90 ? `~${Math.max(2, Math.round(s))} seconds` : `~${Math.round(s / 60)} min`)

/** LI.FI approvals must go to the same contract that runs the bridge. */
function checkLifiTxs(q: RouteQuote): string | null {
  if (q.provider !== 'LI.FI') return null
  const main = q.txs[q.txs.length - 1]
  for (const tx of q.txs) {
    if (!tx.approval) continue
    try {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: tx.data })
      if ((args as readonly [string, bigint])[0].toLowerCase() !== main.to.toLowerCase()) return 'The LI.FI approval target does not match its bridge contract.'
    } catch {
      return 'LI.FI sent an approval this app cannot read.'
    }
  }
  return null
}

/**
 * One screen for the three open routers: LI.FI, Across and Relay. All three are asked for the same
 * USDC transfer, the best payout is chosen for you, and you can pick another route if you prefer it.
 * Works between every EVM network LI.FI knows; a router that cannot serve a pair shows why.
 */
export function RouteBridge() {
  const { address, isConnected, connector } = useAccount()
  const { chains, loading: chainsLoading, failed: chainsFailed } = useBridgeChains()
  const [fromKey, setFromKey] = useState('8453')
  const [toKey, setToKey] = useState(String(ARC_CHAIN_ID))
  const [amount, setAmount] = useState('')
  const [customRecipient, setCustomRecipient] = useState('')
  const [fromUsdc, setFromUsdc] = useState<ChainUsdc | null>(null)
  const [toUsdc, setToUsdc] = useState<ChainUsdc | null>(null)
  const [tokenError, setTokenError] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const [gasBalance, setGasBalance] = useState<bigint | null>(null)
  const [results, setResults] = useState<ProviderResult[] | null>(null)
  const [picked, setPicked] = useState<RouteQuote | null>(null)
  const [reqUsed, setReqUsed] = useState<RouteRequest | null>(null)
  const [phase, setPhase] = useState<Phase>('idle')
  const [stepLabel, setStepLabel] = useState('')
  const [sent, setSent] = useState<{ label: string; hash: string; url?: string }[]>([])
  const [delivery, setDelivery] = useState<DeliveryStatus | null>(null)
  const [error, setError] = useState('')
  const stopPoll = useRef(false)

  const fromChain = chains.find((c) => c.key === fromKey)
  const toChain = chains.find((c) => c.key === toKey)
  const recipient = customRecipient.trim()
  const busy = phase === 'quoting' || phase === 'sending'
  const inDec = fromUsdc?.decimals ?? 6
  const outDec = toUsdc?.decimals ?? 6

  useEffect(() => () => { stopPoll.current = true }, [])

  // USDC contract and decimals on each chosen network.
  useEffect(() => {
    let cancelled = false
    if (!fromChain || !toChain) return
    Promise.all([getChainUsdc(fromChain.id), getChainUsdc(toChain.id)])
      .then(([a, b]) => { if (!cancelled) { setFromUsdc(a); setToUsdc(b); setTokenError('') } })
      .catch((e) => { if (!cancelled) { setFromUsdc(null); setToUsdc(null); setTokenError(kitErrorMessage(e)) } })
    return () => { cancelled = true }
  }, [fromChain, toChain])

  // Source-chain USDC and gas balances, read from that chain's own RPC.
  useEffect(() => {
    if (!fromChain || !fromUsdc || !address) return
    let cancelled = false
    const client = createPublicClient({ chain: toViemBridgeChain(fromChain), transport: http(fromChain.rpcUrls[0]) })
    client.readContract({ address: fromUsdc.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((b) => { if (!cancelled) setBalance(b) }).catch(() => { if (!cancelled) setBalance(null) })
    client.getBalance({ address })
      .then((b) => { if (!cancelled) setGasBalance(b) }).catch(() => { if (!cancelled) setGasBalance(null) })
    return () => { cancelled = true }
  }, [fromChain, fromUsdc, address, phase])

  const amountRaw = useMemo(() => {
    if (!new RegExp(`^\\d+(\\.\\d{1,${inDec}})?$`).test(amount.trim())) return null
    const raw = parseUnits(amount.trim(), inDec)
    return raw > 0n ? raw : null
  }, [amount, inDec])

  const problem =
    fromKey === toKey ? 'Pick two different networks.'
    : tokenError ? tokenError
    : amount.trim() !== '' && amountRaw === null ? `Enter a valid amount (max ${inDec} decimals).`
    : amountRaw !== null && balance !== null && amountRaw > balance ? `Insufficient balance. You have ${formatUnits(balance, inDec)} USDC on ${fromChain?.name}.`
    : recipient !== '' && !isAddress(recipient) ? 'Recipient is not a valid address.'
    : ''
  const noGas = !!fromChain && fromChain.id !== ARC_CHAIN_ID && gasBalance === 0n
  const canQuote = isConnected && !!address && !!fromChain && !!toChain && !!fromUsdc && !!toUsdc && amountRaw !== null && !problem && !busy

  function resetResults() { setResults(null); setPicked(null); setReqUsed(null); setError('') }
  function pickFrom(k: string) { if (k === toKey) setToKey(fromKey); setFromKey(k); setBalance(null); resetResults() }
  function pickTo(k: string) { if (k === fromKey) setFromKey(toKey); setToKey(k); setBalance(null); resetResults() }
  function flip() { setFromKey(toKey); setToKey(fromKey); setBalance(null); resetResults() }

  async function compare() {
    if (!address || !fromChain || !toChain || !fromUsdc || !toUsdc || amountRaw === null) return
    setError(''); setResults(null); setPicked(null); setSent([]); setDelivery(null); setPhase('quoting')
    const req: RouteRequest = {
      fromChainId: fromChain.id, toChainId: toChain.id, fromToken: fromUsdc.address, toToken: toUsdc.address,
      amountRaw, user: address, recipient: (recipient || address) as `0x${string}`,
    }
    try {
      const raw = await getRouteQuotes(req)
      // A quote that fails the safety checks is shown as unavailable, never offered.
      const res: ProviderResult[] = raw.map((r) => {
        if (!r.quote) return r
        const bad = validateRouteTxs(r.quote, req) ?? checkLifiTxs(r.quote) ?? (r.quote.amountOut <= 0n ? `${r.provider} returned no output for this route.` : null)
        return bad ? { provider: r.provider, error: bad } : r
      })
      res.sort((a, b) => Number((b.quote?.amountOut ?? -1n) - (a.quote?.amountOut ?? -1n)))
      setReqUsed(req); setResults(res)
      const best = res.find((r) => r.quote)?.quote ?? null
      setPicked(best)
      if (!best) setError('None of LI.FI, Across or Relay can serve this route right now. Try another pair or amount.')
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setPhase('idle')
    }
  }

  async function execute() {
    if (!picked || !reqUsed || !fromChain || !toChain || !connector) return
    setError('')
    if (Date.now() - picked.fetchedAt > QUOTE_MAX_AGE_MS) return setError('This quote is more than a minute old. Refresh the quotes for a fresh price.')
    const bad = validateRouteTxs(picked, reqUsed) ?? checkLifiTxs(picked)
    if (bad) return setError(bad)
    setPhase('sending'); setSent([])
    try {
      const chain = toViemBridgeChain(fromChain)
      const raw = (await connector.getProvider()) as EIP1193Provider
      const provider = withAddChainFallback(raw, [chain])
      await switchWalletChain(provider, chain)
      const wallet = createWalletClient({ account: reqUsed.user, chain, transport: custom(provider) })
      // Receipts come through your wallet's own connection to the network.
      const reader = createPublicClient({ chain, transport: custom(provider) })
      // The contract that receives the funds must exist on the source chain.
      const code = await reader.getCode({ address: picked.txs[picked.txs.length - 1].to })
      if (!code || code === '0x') throw new Error('The bridge address has no contract on this network. Cancelled for your safety.')
      let lastHash = ''
      for (const tx of picked.txs) {
        setStepLabel(tx.label)
        const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
        setSent((p) => [...p, { label: tx.label, hash, url: txUrl(fromChain, hash) }])
        const receipt = await reader.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error(`${tx.label} failed onchain. Nothing further was sent.`)
        lastHash = hash
      }
      appStore.createPendingTxRecord({
        txHash: lastHash, chainId: fromChain.id, direction: 'sent', amount: amount.trim(),
        fromAddress: reqUsed.user, toAddress: reqUsed.recipient, kind: 'bridge', symbol: 'USDC',
        summary: `${amount.trim()} USDC from ${fromChain.name} to ${toChain.name} via ${picked.provider}`,
      })
      // The source leg is confirmed; the transfer is "Processing" until the destination leg is delivered.
      appStore.updateTxRecord(lastHash, { status: 'processing' })
      setPhase('tracking'); setDelivery('pending'); stopPoll.current = false
      // LI.FI's free request limit is small, so it is checked less often than the others.
      const every = picked.provider === 'LI.FI' ? 10_000 : 4_000
      const started = Date.now()
      while (!stopPoll.current && Date.now() - started < POLL_MAX_MS) {
        const s = await getDeliveryStatus(picked, reqUsed, lastHash)
        setDelivery(s)
        if (s === 'done') appStore.confirmTxRecord(lastHash)
        if (s === 'failed') appStore.failTxRecord(lastHash)
        if (s !== 'pending') break
        await new Promise((r) => setTimeout(r, every))
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
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to bridge USDC</p>
        <ConnectKitButton />
      </div>
    )
  }

  const best = results?.find((r) => r.quote)?.quote
  const nativeValue = picked?.txs.reduce((sum, t) => sum + t.value, 0n) ?? 0n
  const overWarn = amountRaw !== null && Number(formatUnits(amountRaw, inDec)) > WARN_ABOVE_USD

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Asks LI.FI, Across and Relay for the same USDC transfer and picks the best payout, between {chains.length || 'many'} EVM networks. Each router runs its own contracts and you are subject to its terms. Mainnet transfers move real funds and cannot be undone.</span>
      </div>

      <div className="rounded-2xl p-4 space-y-4" data-tc="">
        <ChainPicker label="From" value={fromKey} options={chains} loading={chainsLoading} disabled={busy} onChange={pickFrom} />
        <div className="flex justify-center -my-1">
          <button
            type="button" onClick={flip} disabled={busy} aria-label="Swap From and To networks" title="Swap networks"
            className="flex h-11 w-11 items-center justify-center rounded-full transition-transform active:scale-90 hover:rotate-180 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--tone-text, var(--ink))', transitionDuration: '250ms' }}
          >
            <ArrowUpDown size={18} aria-hidden />
          </button>
        </div>
        <ChainPicker label="To" value={toKey} options={chains} loading={chainsLoading} disabled={busy} onChange={pickTo} />
        {chainsFailed && <p className="text-xs" style={{ color: 'var(--danger)' }}>Could not load the full network list. Showing Arc only; reload to retry.</p>}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={fieldLabel.replace(' mb-1.5', '')} style={{ color: 'var(--muted)' }}>Amount</label>
            {balance !== null && (
              <button type="button" className="text-xs" style={{ color: 'var(--muted)' }} onClick={() => { setAmount(formatUnits(balance, inDec)); resetResults() }}>
                Balance: <span className="tabnum font-medium">{formatUnits(balance, inDec)}</span> USDC · Max
              </button>
            )}
          </div>
          <div className="relative">
            <input value={amount} onChange={(e) => { setAmount(e.target.value.replace(',', '.')); resetResults() }} inputMode="decimal" placeholder="0.00" disabled={busy}
              aria-label="Amount of USDC to bridge" className={`${fieldClass} h-14 pr-16 text-xl font-semibold tabnum`} style={fieldStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
        </div>

        <details>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Send to a different address</summary>
          <input value={customRecipient} onChange={(e) => { setCustomRecipient(e.target.value.trim()); resetResults() }} placeholder="0x... (defaults to your wallet)"
            className={`${fieldClass} mono mt-2`} style={fieldStyle} />
        </details>

        {problem && <p className="text-xs" style={{ color: 'var(--danger)' }}>{problem}</p>}
        {noGas && <p className="text-xs" style={{ color: 'var(--danger)' }}>You have no {fromChain?.nativeSymbol} on {fromChain?.name} to pay network fees.</p>}
        {overWarn && <p className="text-xs" style={{ color: 'var(--danger)' }}>This is more than 100 USDC. Double-check the route before you confirm.</p>}

        <Button className="w-full" size="lg" variant={results ? 'secondary' : 'primary'} loading={phase === 'quoting'} disabled={!canQuote} onClick={() => void compare()}>
          {results ? 'Refresh quotes' : amountRaw === null ? 'Enter an amount' : 'Find best route'}
        </Button>
      </div>

      {results && (
        <div className="space-y-2">
          {results.map((r) => {
            const q = r.quote
            const isPicked = !!q && picked?.provider === q.provider
            const style = PROVIDER_STYLE[r.provider]
            return (
              <button key={r.provider} type="button" disabled={!q || busy} onClick={() => q && setPicked(q)} aria-pressed={isPicked}
                className="w-full text-left rounded-2xl p-4 transition-all disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                style={{ background: 'var(--surface)', border: `1.5px solid ${isPicked ? 'var(--tone-to)' : 'var(--border)'}`, opacity: q ? 1 : 0.6 }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-sm flex items-center gap-2.5 min-w-0" style={{ color: 'var(--ink)' }}>
                    <GradientIcon icon={style.icon} tone={style.tone} size={32} />
                    {r.provider}
                    {q && best && q.provider === best.provider && (
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Best rate</span>
                    )}
                  </span>
                  {q ? (
                    <span className="tabnum font-semibold flex-shrink-0" style={{ color: 'var(--ink)' }}>{formatUnits(q.amountOut, outDec)} USDC</span>
                  ) : (
                    <span className="text-xs flex-shrink-0" style={{ color: 'var(--muted)' }}>Unavailable</span>
                  )}
                </div>
                {q ? (
                  <p className="text-xs mt-1 flex flex-wrap items-center gap-x-1.5" style={{ color: 'var(--muted)' }}>
                    <Clock size={12} /> {fmtEta(q.etaSeconds)}
                    {q.minOut ? ` · minimum ${formatUnits(q.minOut, outDec)}` : ''}
                    {amountRaw !== null && inDec === outDec && q.amountOut <= amountRaw ? ` · cost ${formatUnits(amountRaw - q.amountOut, outDec)} USDC` : ''}
                  </p>
                ) : (
                  <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{r.error}</p>
                )}
              </button>
            )
          })}
          {picked && nativeValue > 0n && (
            <p className="text-xs" style={{ color: 'var(--danger)' }}>
              This route also sends {formatUnits(nativeValue, fromChain?.nativeDecimals ?? 18)} {fromChain?.nativeSymbol} with the transaction.
            </p>
          )}
          {picked && (
            <Button className="w-full" size="lg" loading={phase === 'sending'} disabled={busy || phase === 'tracking'} onClick={() => void execute()}>
              {phase === 'sending' ? stepLabel || 'Confirm in your wallet...' : `Bridge ${amount.trim()} USDC with ${picked.provider}`}
            </Button>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
        </div>
      )}

      {(sent.length > 0 || delivery) && (
        <div className="rounded-2xl p-4 space-y-3" data-tc="">
          <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Progress</h3>
          {sent.map((h) => (
            <Line key={h.hash} state="done" label={`${h.label} confirmed`}>
              {h.url && <a href={h.url} target="_blank" rel="noopener noreferrer" aria-label="View on explorer" style={{ color: 'var(--tone-text)' }}><ExternalLink size={13} /></a>}
            </Line>
          ))}
          {delivery === 'done' && sent.map((h) => (
            <TxReceipt key={`r-${h.hash}`} hash={h.hash} chainId={fromChain?.id} label={`${h.label} (${fromChain?.name ?? 'source chain'})`} explorerUrl={h.url} />
          ))}
          {delivery && (
            <Line state={delivery === 'done' ? 'done' : delivery === 'failed' ? 'bad' : 'wait'}
              label={delivery === 'done' ? `Delivered on ${toChain?.name}` : delivery === 'failed' ? 'The router reported a failure or refund. Check its status page.' : `Waiting for ${toChain?.name} to receive the funds...`} />
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
