'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicClient, createWalletClient, custom, decodeFunctionData, erc20Abi, formatUnits, http, isAddress, parseUnits,
  type EIP1193Provider,
} from 'viem'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, ArrowDown, Check, Clock, ExternalLink, Loader2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { appStore } from '../../store/appStore'
import { kitErrorMessage, switchWalletChain, withAddChainFallback } from '../../lib/circleKit'
import { getDeliveryStatus, quoteLifi, validateRouteTxs, type DeliveryStatus, type RouteQuote, type RouteRequest } from '../../lib/routeProviders'
import { getChainUsdc, toViemBridgeChain, txUrl, useBridgeChains, type ChainUsdc } from '../../lib/bridgeChains'
import { ARC_CHAIN_ID } from '../../chains'
import { fieldClass, fieldLabel, fieldStyle } from '../pay/ShareLinkBox'
import { ChainPicker } from './ChainPicker'

const QUOTE_MAX_AGE_MS = 60_000
const WARN_ABOVE_USD = 100
const POLL_MS = 10_000 // LI.FI's free request limit is small, so delivery is checked slowly
const POLL_MAX = 60

type Phase = 'idle' | 'quoting' | 'sending' | 'tracking'

const fmtEta = (s?: number) => (s === undefined ? 'n/a' : s < 90 ? `~${Math.max(2, Math.round(s))} seconds` : `~${Math.round(s / 60)} min`)

/** Bridges USDC between any two EVM networks LI.FI supports, signed in your own wallet. */
export function LifiBridge() {
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
  const [quote, setQuote] = useState<RouteQuote | null>(null)
  const [req, setReq] = useState<RouteRequest | null>(null)
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
    const dec = fromUsdc?.decimals ?? 6
    if (!new RegExp(`^\\d+(\\.\\d{1,${dec}})?$`).test(amount.trim())) return null
    const raw = parseUnits(amount.trim(), dec)
    return raw > 0n ? raw : null
  }, [amount, fromUsdc])

  const problem =
    fromKey === toKey ? 'Pick two different networks.'
    : tokenError ? tokenError
    : amount.trim() !== '' && amountRaw === null ? `Enter a valid amount (max ${fromUsdc?.decimals ?? 6} decimals).`
    : amountRaw !== null && balance !== null && amountRaw > balance ? `Insufficient balance. You have ${formatUnits(balance, fromUsdc?.decimals ?? 6)} USDC on ${fromChain?.name}.`
    : recipient !== '' && !isAddress(recipient) ? 'Recipient is not a valid address.'
    : ''
  const noGas = !!fromChain && fromChain.id !== ARC_CHAIN_ID && gasBalance === 0n
  const canQuote = isConnected && !!address && !!fromChain && !!toChain && !!fromUsdc && !!toUsdc && amountRaw !== null && !problem && !busy

  function reset() { setQuote(null); setReq(null); setError('') }

  async function getQuote() {
    if (!address || !fromChain || !toChain || !fromUsdc || !toUsdc || amountRaw === null) return
    setError(''); setQuote(null); setSent([]); setDelivery(null); setPhase('quoting')
    const r: RouteRequest = {
      fromChainId: fromChain.id, toChainId: toChain.id, fromToken: fromUsdc.address, toToken: toUsdc.address,
      amountRaw, user: address, recipient: (recipient || address) as `0x${string}`,
    }
    try {
      const q = await quoteLifi(r)
      const bad = validateRouteTxs(q, r) ?? checkLifiTxs(q)
      if (bad) throw new Error(bad)
      if (q.amountOut <= 0n) throw new Error('LI.FI returned no output for this route.')
      setReq(r); setQuote(q)
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setPhase('idle')
    }
  }

  async function execute() {
    if (!quote || !req || !fromChain || !toChain || !connector) return
    setError('')
    if (Date.now() - quote.fetchedAt > QUOTE_MAX_AGE_MS) return setError('This quote is more than a minute old. Get a fresh quote first.')
    const bad = validateRouteTxs(quote, req) ?? checkLifiTxs(quote)
    if (bad) return setError(bad)
    setPhase('sending'); setSent([])
    try {
      const chain = toViemBridgeChain(fromChain)
      const raw = (await connector.getProvider()) as EIP1193Provider
      const provider = withAddChainFallback(raw, [chain])
      await switchWalletChain(provider, chain)
      const wallet = createWalletClient({ account: req.user, chain, transport: custom(provider) })
      // Receipts come through your wallet's own connection to the network.
      const reader = createPublicClient({ chain, transport: custom(provider) })
      // The bridge contract must be deployed on the source chain.
      const code = await reader.getCode({ address: quote.txs[quote.txs.length - 1].to })
      if (!code || code === '0x') throw new Error('The bridge address has no contract on this network. Cancelled for your safety.')
      let lastHash = ''
      for (const tx of quote.txs) {
        setStepLabel(tx.label)
        const hash = await wallet.sendTransaction({ to: tx.to, data: tx.data, value: tx.value })
        setSent((p) => [...p, { label: tx.label, hash, url: txUrl(fromChain, hash) }])
        const receipt = await reader.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error(`${tx.label} failed onchain. Nothing further was sent.`)
        lastHash = hash
      }
      appStore.createPendingTxRecord({
        txHash: lastHash, chainId: fromChain.id, direction: 'sent', amount: amount.trim(),
        fromAddress: req.user, toAddress: req.recipient, kind: 'bridge', symbol: 'USDC',
        summary: `${amount.trim()} USDC from ${fromChain.name} to ${toChain.name} via LI.FI`,
      })
      // The source leg is confirmed; the transfer is "Processing" until the destination leg is delivered.
      appStore.updateTxRecord(lastHash, { status: 'processing' })
      setPhase('tracking'); setDelivery('pending'); stopPoll.current = false
      for (let i = 0; i < POLL_MAX && !stopPoll.current; i++) {
        const s = await getDeliveryStatus(quote, req, lastHash)
        setDelivery(s)
        if (s === 'done') appStore.confirmTxRecord(lastHash)
        if (s === 'failed') appStore.failTxRecord(lastHash)
        if (s !== 'pending') break
        await new Promise((res) => setTimeout(res, POLL_MS))
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
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to bridge with LI.FI</p>
        <ConnectKitButton />
      </div>
    )
  }

  const nativeValue = quote?.txs.reduce((s, t) => s + t.value, 0n) ?? 0n
  const outDec = toUsdc?.decimals ?? 6
  const inDec = fromUsdc?.decimals ?? 6
  const cost = quote && amountRaw !== null
    ? Number(formatUnits(amountRaw, inDec)) - Number(formatUnits(quote.amountOut, outDec))
    : null
  const overWarn = amountRaw !== null && Number(formatUnits(amountRaw, inDec)) > WARN_ABOVE_USD

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Bridges USDC between {chains.length || 'many'} networks through LI.FI. LI.FI runs its own contracts and you are subject to its terms. Mainnet transfers move real funds and cannot be undone. Quotes load on a button press to stay within LI.FI's free request limit.</span>
      </div>

      <div className="rounded-2xl p-4 space-y-4" data-tc="">
        <ChainPicker label="From" value={fromKey} options={chains} loading={chainsLoading} disabled={busy}
          onChange={(k) => { setFromKey(k); if (k === toKey) setToKey(fromKey); reset() }} />
        <div className="flex justify-center -my-1" style={{ color: 'var(--muted)' }}><ArrowDown size={18} /></div>
        <ChainPicker label="To" value={toKey} options={chains} loading={chainsLoading} disabled={busy}
          onChange={(k) => { setToKey(k); if (k === fromKey) setFromKey(toKey); reset() }} />
        {chainsFailed && <p className="text-xs" style={{ color: 'var(--danger)' }}>Could not load the full network list. Showing Arc only; reload to retry.</p>}

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={fieldLabel.replace(' mb-1.5', '')} style={{ color: 'var(--muted)' }}>Amount</label>
            {balance !== null && (
              <button className="text-xs" style={{ color: 'var(--muted)' }} onClick={() => { setAmount(formatUnits(balance, inDec)); reset() }}>
                Balance: <span className="tabnum font-medium">{formatUnits(balance, inDec)}</span> USDC · Max
              </button>
            )}
          </div>
          <div className="relative">
            <input value={amount} onChange={(e) => { setAmount(e.target.value.replace(',', '.')); reset() }} inputMode="decimal" placeholder="0.00" disabled={busy}
              aria-label="Amount of USDC to bridge" className={`${fieldClass} h-14 pr-16 text-xl font-semibold tabnum`} style={fieldStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
        </div>

        <details>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Send to a different address</summary>
          <input value={customRecipient} onChange={(e) => { setCustomRecipient(e.target.value.trim()); reset() }} placeholder="0x... (defaults to your wallet)"
            className={`${fieldClass} mono mt-2`} style={fieldStyle} />
        </details>

        {problem && <p className="text-xs" style={{ color: 'var(--danger)' }}>{problem}</p>}
        {noGas && <p className="text-xs" style={{ color: 'var(--danger)' }}>You have no {fromChain?.nativeSymbol} on {fromChain?.name} to pay network fees.</p>}
        {overWarn && <p className="text-xs" style={{ color: 'var(--danger)' }}>This is more than 100 USDC. Double-check the route before you confirm.</p>}

        <Button className="w-full" size="lg" variant={quote ? 'secondary' : 'primary'} loading={phase === 'quoting'} disabled={!canQuote} onClick={() => void getQuote()}>
          {quote ? 'Refresh quote' : amountRaw === null ? 'Enter an amount' : 'Get a quote'}
        </Button>
      </div>

      {quote && req && (
        <div className="rounded-2xl p-4 space-y-3" data-tc="">
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>You receive on {toChain?.name}</span>
            <span className="tabnum text-lg font-semibold" style={{ color: 'var(--ink)' }}>{formatUnits(quote.amountOut, outDec)} USDC</span>
          </div>
          <div className="text-xs space-y-1" style={{ color: 'var(--muted)' }}>
            <p className="flex items-center gap-1.5"><Clock size={12} /> {fmtEta(quote.etaSeconds)}{quote.minOut ? ` · minimum ${formatUnits(quote.minOut, outDec)} USDC` : ''}</p>
            {cost !== null && cost > 0 && <p>Total cost about {cost.toFixed(4)} USDC</p>}
            {nativeValue > 0n && (
              <p style={{ color: 'var(--danger)' }}>This route also sends {formatUnits(nativeValue, fromChain?.nativeDecimals ?? 18)} {fromChain?.nativeSymbol} with the transaction.</p>
            )}
          </div>
          <Button className="w-full" size="lg" loading={phase === 'sending'} disabled={busy || phase === 'tracking'} onClick={() => void execute()}>
            {phase === 'sending' ? stepLabel || 'Confirm in your wallet...' : `Bridge ${amount.trim()} USDC to ${toChain?.name}`}
          </Button>
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
          {delivery && (
            <Line state={delivery === 'done' ? 'done' : delivery === 'failed' ? 'bad' : 'wait'}
              label={delivery === 'done' ? `Delivered on ${toChain?.name}` : delivery === 'failed' ? 'LI.FI reported a failure or refund. Check its status page.' : `Waiting for ${toChain?.name} to receive the funds...`} />
          )}
        </div>
      )}
    </div>
  )
}

/** LI.FI approvals must go to the same contract that runs the bridge. */
function checkLifiTxs(q: RouteQuote): string | null {
  const main = q.txs[q.txs.length - 1]
  for (const tx of q.txs) {
    if (!tx.approval) continue
    try {
      const { args } = decodeFunctionData({ abi: erc20Abi, data: tx.data })
      if ((args as readonly [string, bigint])[0].toLowerCase() !== main.to.toLowerCase()) return 'The approval target does not match the bridge contract. Cancelled for your safety.'
    } catch {
      return 'LI.FI sent an approval this app cannot read.'
    }
  }
  return null
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

