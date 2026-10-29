'use client'

import { useEffect, useState } from 'react'
import { createPublicClient, erc20Abi, formatUnits, http, parseUnits } from 'viem'
import { useAccount, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, Check, ExternalLink } from 'lucide-react'
import type { SwapEstimate } from '@circle-fin/app-kit'
import { Button } from '../ui/Button'
import { createWalletAdapter, getKit, getMainnetBridgeChains, kitErrorMessage } from '../../lib/circleKit'
import { ARC_CHAIN_ID, ARC_RPC_URL, arcMainnet } from '../../chains'
import { appStore } from '../../store/appStore'
import { AmountCard, FlipButton, SlippagePicker } from './SwapPanel'

/** Short display form of a 6-decimal token amount (display only). */
function shortAmount(raw: bigint): string {
  const [i, f] = formatUnits(raw, 6).split('.')
  return f ? `${i}.${f.slice(0, 4)}`.replace(/\.$/, '') : i
}

// On Arc, Swap accepts only these tokens. USDC and the native gas token are the
// same asset on Arc, so a USDC <-> NATIVE pair is never offered.
const TOKENS = ['USDC', 'EURC', 'cirBTC'] as const
type Token = (typeof TOKENS)[number]
// SDK token symbols are upper-case aliases.
const sdkToken = (t: Token): 'USDC' | 'EURC' | 'CIRBTC' => (t === 'cirBTC' ? 'CIRBTC' : t)


type SwapResultT = { amountOut?: string; explorerUrl?: string; txHash?: string; progress: { status: string }; tokenOut: string }

export function CircleSwap() {
  const { address, isConnected, connector, chainId } = useAccount()
  const { switchChainAsync } = useSwitchChain()
  const [tokenIn, setTokenIn] = useState<Token>('USDC')
  const [tokenOut, setTokenOut] = useState<Token>('EURC')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<number>(50)
  const [estimate, setEstimate] = useState<SwapEstimate | null>(null)
  const [reviewed, setReviewed] = useState('')
  const [busy, setBusy] = useState<'quote' | 'swap' | null>(null)
  const [error, setError] = useState('')
  const [noRoute, setNoRoute] = useState(false)
  const [result, setResult] = useState<SwapResultT | null>(null)
  const [balances, setBalances] = useState<Partial<Record<Token, bigint>>>({})
  const [arcTokens, setArcTokens] = useState<{ USDC?: string; EURC?: string }>({})

  const key = `${tokenIn}|${tokenOut}|${amount.trim()}|${slippage}|${address ?? ''}`
  const fresh = estimate !== null && reviewed === key
  const amountOk = /^\d+(\.\d{1,18})?$/.test(amount.trim()) && /[1-9]/.test(amount)

  // Token contract addresses come from the SDK's Arc chain definition.
  useEffect(() => {
    let cancelled = false
    getMainnetBridgeChains().then((list) => {
      const arc = list.find((c) => c.chainId === ARC_CHAIN_ID)
      if (!cancelled && arc) setArcTokens({ USDC: arc.usdcAddress ?? undefined, EURC: arc.eurcAddress ?? undefined })
    }).catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (!address) return
    let cancelled = false
    const client = createPublicClient({ chain: arcMainnet, transport: http(ARC_RPC_URL) })
    const read = async (t: 'USDC' | 'EURC') => {
      const addr = arcTokens[t]
      if (!addr) return
      const b = await client.readContract({ address: addr as `0x${string}`, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      if (!cancelled) setBalances((p) => ({ ...p, [t]: b }))
    }
    read('USDC').catch(() => undefined)
    read('EURC').catch(() => undefined)
    return () => { cancelled = true }
  }, [address, arcTokens, result])

  function flip() {
    setTokenIn(tokenOut); setTokenOut(tokenIn); setEstimate(null)
  }

  async function ensureArc() {
    if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
  }

  async function review() {
    if (!connector) return
    setError(''); setNoRoute(false); setEstimate(null); setResult(null); setBusy('quote')
    try {
      await ensureArc()
      const kit = await getKit()
      const { adapter } = await createWalletAdapter(connector, [arcMainnet])
      const est = await kit.estimateSwap({
        from: { adapter, chain: 'Arc' },
        tokenIn: sdkToken(tokenIn), tokenOut: sdkToken(tokenOut), amountIn: amount.trim(),
        config: { slippageBps: slippage },
      })
      setEstimate(est)
      setReviewed(key)
    } catch (e) {
      const msg = kitErrorMessage(e)
      setError(msg)
      setNoRoute(/route|liquidity|unsupported|not supported/i.test(msg))
    } finally {
      setBusy(null)
    }
  }

  async function swap() {
    if (!connector || !fresh) return
    setError(''); setBusy('swap')
    try {
      await ensureArc()
      const kit = await getKit()
      const { adapter } = await createWalletAdapter(connector, [arcMainnet])
      const params = {
        from: { adapter, chain: 'Arc' as const },
        tokenIn: sdkToken(tokenIn), tokenOut: sdkToken(tokenOut), amountIn: amount.trim(),
        config: { slippageBps: slippage },
      }
      const res = await kit.swap(params)
      let progress = res.progress
      if (progress.status === 'PENDING') progress = (await kit.waitForSwap({ result: res })).progress
      if (res.txHash) {
        appStore.createPendingTxRecord({
          txHash: res.txHash, chainId: ARC_CHAIN_ID, direction: 'sent', amount: amount.trim(),
          fromAddress: address ?? '', toAddress: address ?? '', kind: 'swap', symbol: tokenIn,
          summary: `${amount.trim()} ${tokenIn} for ${res.amountOut ?? 'about'} ${tokenOut}`,
        })
        if (progress.status === 'DONE') appStore.confirmTxRecord(res.txHash)
        else if (progress.status === 'FAILED') appStore.failTxRecord(res.txHash)
      }
      setResult({ amountOut: res.amountOut, explorerUrl: res.explorerUrl, txHash: res.txHash, tokenOut: String(res.tokenOut), progress: { status: String(progress.status) } })
      setEstimate(null)
      if (progress.status !== 'DONE') setError(`Swap ended with status ${progress.status}. Check the explorer before trying again.`)
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setBusy(null)
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

  const balIn = tokenIn === 'cirBTC' ? undefined : balances[tokenIn]
  // Exact bigint comparison (USDC and EURC both use 6 decimals).
  const amountRaw = (() => { try { return amountOk ? parseUnits(amount.trim(), 6) : null } catch { return null } })()
  const insufficient = balIn !== undefined && amountRaw !== null && amountRaw > balIn

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
            decimals={tokenIn === 'cirBTC' ? 8 : 6}
            invalid={!!insufficient}
            onChange={(v) => { setAmount(v); setEstimate(null) }}
            onToken={(t) => { const next = t as Token; if (next === tokenOut) setTokenOut(tokenIn); setTokenIn(next); setEstimate(null) }}
            balanceText={balIn !== undefined ? `Balance ${shortAmount(balIn)}` : undefined}
            onPct={balIn !== undefined ? (p) => { setAmount(formatUnits((balIn * BigInt(p)) / 100n, 6)); setEstimate(null) } : undefined}
          />
          <FlipButton onFlip={flip} />
          <AmountCard
            label="You receive (estimated)"
            value={fresh && estimate ? estimate.estimatedOutput.amount : ''}
            symbol={tokenOut}
            tokens={TOKENS}
            loading={busy === 'quote'}
            onToken={(t) => { const next = t as Token; if (next === tokenIn) setTokenIn(tokenOut); setTokenOut(next); setEstimate(null) }}
          />
        </div>

        <SlippagePicker value={slippage} onChange={(bps) => { setSlippage(bps); setEstimate(null) }} />

        {fresh && estimate && (
          <div className="rounded-xl p-3 space-y-1.5 text-xs" data-tp="">
            <Row label="Minimum received" value={`${estimate.stopLimit.amount} ${estimate.stopLimit.token}`} />
            {(estimate.fees ?? []).map((f, i) => <Row key={i} label={`Fee (${f.type})`} value={`${f.amount} ${f.token}`} />)}
            <p style={{ color: 'var(--subtle)' }}>Rates can move before the swap runs.</p>
          </div>
        )}

        {insufficient && <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient {tokenIn} balance.</p>}

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">
              {noRoute ? `No swap route is available for ${tokenIn} to ${tokenOut} on Arc right now. Try another pair, or bridge USDC from another chain. ` : ''}
              {error}
            </span>
          </div>
        )}

        {result?.progress.status === 'DONE' && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Check size={16} className="flex-shrink-0 mt-0.5" />
            <span>
              Swapped. You received {result.amountOut ?? 'your tokens'} {result.tokenOut}.{' '}
              {result.explorerUrl && (
                <a href={result.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                  Explorer <ExternalLink size={12} />
                </a>
              )}
            </span>
          </div>
        )}

        {fresh ? (
          <Button className="w-full" size="lg" loading={busy === 'swap'} disabled={!!insufficient} onClick={() => void swap()}>
            {busy === 'swap' ? 'Confirm the swap in your wallet...' : `Swap ${tokenIn} for ${tokenOut}`}
          </Button>
        ) : (
          <Button className="w-full" size="lg" loading={busy === 'quote'} disabled={!amountOk || tokenIn === tokenOut || !!insufficient} onClick={() => void review()}>
            {amountOk ? 'Get a price' : 'Enter an amount'}
          </Button>
        )}
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
      <span style={{ color: 'var(--ink-2)' }}>{label}</span><span className="tabnum" style={{ color: 'var(--ink)' }}>{value}</span>
    </div>
  )
}
