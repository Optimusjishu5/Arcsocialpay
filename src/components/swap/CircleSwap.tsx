'use client'

import { useEffect, useRef, useState } from 'react'
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits } from 'viem'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { SwapEstimate } from '@circle-fin/app-kit'
import { Button } from '../ui/Button'
import { createWalletAdapter, getKit, kitErrorMessage } from '../../lib/circleKit'
import { ARC_CHAIN_ID, ARC_RPC_URL, arcMainnet } from '../../chains'
import { UNI_TOKENS } from '../../lib/uniswapArc'
import { appStore } from '../../store/appStore'
import { AmountCard, FlipButton, SlippagePicker } from './SwapPanel'
import { TxReceipt } from '../ui/TxReceipt'

// On Arc, Swap accepts only these tokens. USDC and the native gas token are the
// same asset on Arc, so a USDC <-> NATIVE pair is never offered.
const TOKENS = ['USDC', 'EURC', 'cirBTC'] as const
type Token = (typeof TOKENS)[number]
// SDK token symbols are upper-case aliases.
const sdkToken = (t: Token): 'USDC' | 'EURC' | 'CIRBTC' => (t === 'cirBTC' ? 'CIRBTC' : t)
const META = Object.fromEntries(UNI_TOKENS.map((t) => [t.symbol, t])) as Record<Token, (typeof UNI_TOKENS)[number]>

const REFRESH_MS = 15_000 // the price is asked for again this often while you look at it
const STALE_MS = 45_000 // a price older than this cannot be swapped on
const DEBOUNCE_MS = 450

/** Short display form of a token amount (display only). */
function shortAmount(raw: bigint, decimals: number): string {
  const [i, f] = formatUnits(raw, decimals).split('.')
  return f ? `${i}.${f.slice(0, 4)}`.replace(/\.$/, '') : i
}

// Prices are asked for with a throwaway address that never holds funds or signs anything. That keeps
// the live price independent of the wallet: no pop-ups and no network switch while you type.
type QuoteAdapter = Awaited<ReturnType<typeof import('@circle-fin/adapter-viem-v2')['createViemAdapterFromPrivateKey']>>
let quoteAdapterPromise: Promise<QuoteAdapter> | null = null
function getQuoteAdapter(): Promise<QuoteAdapter> {
  quoteAdapterPromise ??= Promise.all([import('@circle-fin/adapter-viem-v2'), import('viem/accounts')]).then(
    ([m, a]) => m.createViemAdapterFromPrivateKey({ privateKey: a.generatePrivateKey() }),
  )
  return quoteAdapterPromise
}

interface Quote { est: SwapEstimate; key: string; at: number }
interface QuoteProblem { key: string; msg: string; noRoute: boolean }
type Stage = 'idle' | 'switch' | 'wallet' | 'confirming' | 'done' | 'failed'
interface SwapDone { amountOut?: string; explorerUrl?: string; txHash?: string; tokenOut: string; block?: bigint }

export function CircleSwap() {
  const { address, isConnected, connector, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const [tokenIn, setTokenIn] = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>('EURC')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<number>(50)
  const [quote, setQuote] = useState<Quote | null>(null)
  const [problem, setProblem] = useState<QuoteProblem | null>(null)
  const [loadingKey, setLoadingKey] = useState('')
  const [now, setNow] = useState(() => Date.now())
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState('')
  const [done, setDone] = useState<SwapDone | null>(null)
  const [balances, setBalances] = useState<Partial<Record<Token, bigint>>>({})
  const [refreshTick, setRefreshTick] = useState(0)
  const swapping = useRef(false)

  const amountOk = /^\d+(\.\d{1,18})?$/.test(amount.trim()) && /[1-9]/.test(amount)
  const canQuote = isConnected && amountOk && tokenIn !== tokenOut
  const key = `${tokenIn}|${tokenOut}|${amount.trim()}|${slippage}`
  const live = canQuote && quote?.key === key ? quote : null
  const ageMs = live ? now - live.at : 0
  const stale = !!live && ageMs > STALE_MS
  const loadingQuote = canQuote && !live && problem?.key !== key
  const shownProblem = canQuote && problem?.key === key ? problem : null
  const busy = stage === 'switch' || stage === 'wallet' || stage === 'confirming'

  // A ticking clock, so "updated 3s ago" stays true.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  // Live price: asked for shortly after you stop typing, and again every few seconds.
  useEffect(() => {
    if (!canQuote) return
    let cancelled = false
    const run = async (silent: boolean) => {
      if (!silent) setLoadingKey(key)
      try {
        const [kit, adapter] = await Promise.all([getKit(), getQuoteAdapter()])
        const est = await kit.estimateSwap({
          from: { adapter, chain: 'Arc' },
          tokenIn: sdkToken(tokenIn), tokenOut: sdkToken(tokenOut), amountIn: amount.trim(),
          config: { slippageBps: slippage },
        })
        if (cancelled) return
        setQuote({ est, key, at: Date.now() })
        setProblem(null)
      } catch (e) {
        if (cancelled) return
        const msg = kitErrorMessage(e)
        // A failed background refresh keeps the last price on screen; it simply ages until it is too old.
        if (!silent) setProblem({ key, msg, noRoute: /route|liquidity|unsupported|not supported/i.test(msg) })
      } finally {
        if (!cancelled) setLoadingKey('')
      }
    }
    const first = setTimeout(() => void run(false), DEBOUNCE_MS)
    const again = setInterval(() => {
      if (document.visibilityState === 'visible' && !swapping.current) void run(true)
    }, REFRESH_MS)
    return () => { cancelled = true; clearTimeout(first); clearInterval(again) }
  }, [canQuote, key, tokenIn, tokenOut, amount, slippage])

  // Your balances on Arc, read straight from the chain.
  useEffect(() => {
    if (!address) return
    let cancelled = false
    const client = createPublicClient({ chain: arcMainnet, transport: http(ARC_RPC_URL) })
    for (const t of TOKENS) {
      client.readContract({ address: META[t].address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
        .then((b) => { if (!cancelled) setBalances((p) => ({ ...p, [t]: b })) })
        .catch(() => undefined)
    }
    return () => { cancelled = true }
  }, [address, refreshTick])

  function flip() { setTokenIn(tokenOut); setTokenOut(tokenIn) }

  async function swap() {
    if (!connector || !live || stale || busy) return
    setError(''); setDone(null); swapping.current = true
    try {
      if (chainId !== ARC_CHAIN_ID) { setStage('switch'); await switchChainAsync({ chainId: ARC_CHAIN_ID }) }
      setStage('wallet')
      const kit = await getKit()
      const { adapter } = await createWalletAdapter(connector, [arcMainnet])
      const res = await kit.swap({
        from: { adapter, chain: 'Arc' },
        tokenIn: sdkToken(tokenIn), tokenOut: sdkToken(tokenOut), amountIn: amount.trim(),
        config: { slippageBps: slippage },
      })
      setStage('confirming')
      let status = String(res.progress.status)
      if (res.progress.status === 'PENDING') status = String((await kit.waitForSwap({ result: res })).progress.status)
      // Confirm it onchain ourselves too, so the screen shows the real block.
      let block: bigint | undefined
      let reverted = false
      if (res.txHash) {
        appStore.createPendingTxRecord({
          txHash: res.txHash, chainId: ARC_CHAIN_ID, direction: 'sent', amount: amount.trim(),
          fromAddress: address ?? '', toAddress: address ?? '', kind: 'swap', symbol: tokenIn,
          summary: `${amount.trim()} ${tokenIn} for ${res.amountOut ?? 'about'} ${tokenOut}`,
        })
        try {
          const client = createPublicClient({ chain: arcMainnet, transport: http(ARC_RPC_URL) })
          const receipt = await client.waitForTransactionReceipt({ hash: res.txHash as `0x${string}`, timeout: 45_000 })
          block = receipt.blockNumber
          reverted = receipt.status !== 'success'
        } catch { /* the receipt is only a second check; the swap status above still decides */ }
        if (status === 'DONE' && !reverted) appStore.confirmTxRecord(res.txHash)
        else if (status === 'FAILED' || reverted) appStore.failTxRecord(res.txHash)
      }
      setDone({ amountOut: res.amountOut, explorerUrl: res.explorerUrl, txHash: res.txHash, tokenOut: String(res.tokenOut), block })
      if (status === 'DONE' && !reverted) {
        setStage('done')
        setAmount('')
        setQuote(null)
      } else {
        setStage('failed')
        setError(`The swap ended with status ${reverted ? 'FAILED' : status}. Check the explorer before trying again.`)
      }
      // Balances move a moment after the block; read them now and again shortly after.
      setRefreshTick((n) => n + 1)
      setTimeout(() => setRefreshTick((n) => n + 1), 4000)
    } catch (e) {
      setStage('failed')
      setError(kitErrorMessage(e))
    } finally {
      swapping.current = false
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to swap on Arc</p>
        <ConnectKitButton />
      </div>
    )
  }

  const decIn = META[tokenIn].decimals
  const balIn = balances[tokenIn]
  const balOut = balances[tokenOut]
  const amountRaw = (() => { try { return amountOk ? parseUnits(amount.trim(), decIn) : null } catch { return null } })()
  const insufficient = balIn !== undefined && amountRaw !== null && amountRaw > balIn
  const est = live?.est
  const outAmount = est?.estimatedOutput.amount ?? ''
  const rate = est && Number(amount) > 0 ? Number(est.estimatedOutput.amount) / Number(amount) : null
  const gasFee = est?.fees?.find((f) => f.type === 'gas')
  const otherFees = (est?.fees ?? []).filter((f) => f.type !== 'gas')
  const showSteps = stage !== 'idle'
  const ready = !!live && !stale && !insufficient && !busy

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Mainnet swaps move real funds. Routes are provided by a swap service provider (a third-party aggregator or Circle) that can change by route, and you are subject to its terms of service.</span>
      </div>

      <div className="rounded-3xl p-4 space-y-4" data-tc="">
        <div>
          <AmountCard
            label="You pay"
            value={amount}
            symbol={tokenIn}
            tokens={TOKENS}
            decimals={decIn}
            invalid={!!insufficient}
            onChange={(v) => { setAmount(v); setStage((s) => (s === 'done' || s === 'failed' ? 'idle' : s)); setError('') }}
            onToken={(t) => { const next = t as Token; if (next === tokenOut) setTokenOut(tokenIn); setTokenIn(next) }}
            balanceText={balIn !== undefined ? `Balance ${shortAmount(balIn, decIn)}` : undefined}
            onPct={balIn !== undefined ? (p) => setAmount(formatUnits((balIn * BigInt(p)) / 100n, decIn)) : undefined}
          />
          <FlipButton onFlip={flip} />
          <AmountCard
            label="You receive (estimated)"
            value={outAmount}
            symbol={tokenOut}
            tokens={TOKENS}
            loading={loadingQuote}
            dim={stale}
            onToken={(t) => { const next = t as Token; if (next === tokenIn) setTokenIn(tokenOut); setTokenOut(next) }}
            balanceText={balOut !== undefined ? `Balance ${shortAmount(balOut, META[tokenOut].decimals)}` : undefined}
          />
        </div>

        <SlippagePicker value={slippage} onChange={setSlippage} />

        {canQuote && (
          <div className="rounded-xl p-3 space-y-1.5 text-xs" data-tp="" aria-live="polite">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 font-semibold" style={{ color: stale ? 'var(--danger)' : 'var(--success)' }}>
                <span className={`h-2 w-2 rounded-full ${stale || shownProblem ? '' : 'animate-pulse'}`} style={{ background: 'currentColor' }} />
                {stale ? 'Price is out of date' : shownProblem ? 'No price' : loadingQuote || loadingKey === key ? 'Getting the price...' : 'Live price'}
              </span>
              {live && <span style={{ color: 'var(--subtle)' }}>{stale ? 'refreshing...' : `updated ${Math.max(0, Math.round(ageMs / 1000))}s ago`}</span>}
            </div>
            {est && (
              <>
                {rate !== null && <Row label="Rate" value={`1 ${tokenIn} ≈ ${rate.toPrecision(6)} ${tokenOut}`} />}
                <Row label="Minimum received" value={`${est.stopLimit.amount} ${est.stopLimit.token}`} />
                {otherFees.map((f, i) => <Row key={i} label={`Fee (${f.type})`} value={`${f.amount} ${f.token}`} />)}
                {gasFee && <Row label="Network fee (est.)" value={`${gasFee.amount} ${gasFee.token}`} />}
                {est.route?.provider && <Row label="Route" value={String(est.route.provider)} />}
                <p style={{ color: 'var(--subtle)' }}>The price refreshes by itself every {REFRESH_MS / 1000} seconds. The minimum is what you get at your slippage.</p>
              </>
            )}
          </div>
        )}

        {insufficient && <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient {tokenIn} balance.</p>}

        {(shownProblem || error) && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">
              {shownProblem?.noRoute ? `No swap route is available for ${tokenIn} to ${tokenOut} on Arc right now. Try another pair or amount. ` : ''}
              {error || shownProblem?.msg}
            </span>
          </div>
        )}

        {showSteps && (
          <div className="rounded-xl p-3 space-y-2.5" data-tp="" aria-live="polite">
            <Step state={stage === 'switch' ? 'active' : 'done'} label="Wallet on Arc" />
            <Step state={stage === 'wallet' ? 'active' : stage === 'switch' ? 'wait' : stage === 'failed' && !done ? 'bad' : 'done'} label="Confirm the swap in your wallet" />
            <Step state={stage === 'confirming' ? 'active' : stage === 'done' ? 'done' : stage === 'failed' && done ? 'bad' : 'wait'}
              label={stage === 'done' && done?.block ? `Confirmed on Arc, block ${done.block.toString()}` : stage === 'done' ? 'Confirmed on Arc' : 'Confirming on Arc'} />
          </div>
        )}

        {stage === 'done' && done && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
              <Check size={16} className="flex-shrink-0 mt-0.5" />
              <span><strong>Swap successful.</strong> You received {done.amountOut ?? 'your tokens'} {done.tokenOut}.</span>
            </div>
            <TxReceipt hash={done.txHash} label="Swap" explorerUrl={done.explorerUrl} />
          </div>
        )}

        <Button className="w-full" size="lg" loading={busy} disabled={!ready} onClick={() => void swap()}>
          {stage === 'switch' ? 'Switching to Arc...'
            : stage === 'wallet' ? 'Confirm the swap in your wallet...'
            : stage === 'confirming' ? 'Confirming on Arc...'
            : !amountOk ? 'Enter an amount'
            : tokenIn === tokenOut ? 'Pick two different tokens'
            : insufficient ? `Not enough ${tokenIn}`
            : !live ? (shownProblem ? 'No price available' : 'Getting the price...')
            : stale ? 'Refreshing the price...'
            : `Swap ${tokenIn} for ${tokenOut}`}
        </Button>
      </div>
      <p className="text-xs" style={{ color: 'var(--subtle)' }}>
        Arc supports swaps between USDC, EURC and cirBTC. USDC is also Arc's gas token, so there is no USDC to gas-token swap.
      </p>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: 'var(--ink-2)' }}>{label}</span><span className="tabnum text-right" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}

function Step({ state, label }: { state: 'wait' | 'active' | 'done' | 'bad'; label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
        style={{
          background: state === 'done' ? 'var(--success-bg)' : state === 'bad' ? 'var(--danger-bg)' : 'var(--surface-muted)',
          color: state === 'done' ? 'var(--success)' : state === 'bad' ? 'var(--danger)' : 'var(--muted)',
        }}>
        {state === 'done' ? <Check size={14} /> : state === 'bad' ? <AlertCircle size={14} /> : state === 'active' ? <Loader2 size={14} className="animate-spin" /> : null}
      </span>
      <span style={{ color: state === 'wait' ? 'var(--subtle)' : 'var(--ink)' }}>{label}</span>
    </div>
  )
}
