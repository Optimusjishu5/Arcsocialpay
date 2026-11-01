'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, Check, ExternalLink } from 'lucide-react'
import { Button } from '../ui/Button'
import { ARC_CHAIN_ID } from '../../chains'
import { appStore } from '../../store/appStore'
import { kitErrorMessage } from '../../lib/circleKit'
import { buildTxExplorerUrl } from '@/onchain-facts'
import {
  EURC_TOKEN, GAS_RESERVE_RAW, USDC_TOKEN, formatTokenAmount, readBalances, useArcTokens, type ArcToken,
} from '../../lib/arcTokens'
import { SWAP_PROVIDERS, validateSwapQuote, type SwapProviderId, type SwapQuote } from '../../lib/swapProviders'
import { AmountCard, FlipButton, Reveal, SlippagePicker } from './SwapPanel'
import { TokenPicker } from './TokenPicker'

const STALE_MS = 25_000
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/**
 * One swap screen for any route provider: pick tokens with logos, get a price,
 * approve the exact amount, then sign the swap in your own wallet.
 */
export function ProviderSwap({ providerId }: { providerId: SwapProviderId }) {
  const provider = SWAP_PROVIDERS[providerId]
  const { address, isConnected, chainId } = useAccount()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()
  const { tokens: allTokens, loading: tokensLoading } = useArcTokens()

  const [tokenIn, setTokenIn] = useState<ArcToken>(USDC_TOKEN)
  const [tokenOut, setTokenOut] = useState<ArcToken>(EURC_TOKEN)
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<number>(50)
  const [quote, setQuote] = useState<SwapQuote | null>(null)
  const [quotedKey, setQuotedKey] = useState('')
  const [busy, setBusy] = useState<'quote' | 'approve' | 'swap' | null>(null)
  const [error, setError] = useState('')
  const [doneHash, setDoneHash] = useState('')
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const [picker, setPicker] = useState<'in' | 'out' | null>(null)
  const requestId = useRef(0)

  // Tokens this route can handle (Uniswap can try any pool).
  const tokens = useMemo(
    () => (provider.id === 'uniswap' ? allTokens : allTokens.filter((t) => t.sources.includes(provider.source))),
    [allTokens, provider],
  )

  const key = `${tokenIn.address}|${tokenOut.address}|${amount.trim()}|${slippage}|${address ?? ''}`
  const fresh = quote !== null && quotedKey === key

  const amountIn = useMemo(() => {
    const a = amount.trim()
    if (!new RegExp(`^\\d+(\\.\\d{1,${tokenIn.decimals}})?$`).test(a)) return null
    const raw = parseUnits(a, tokenIn.decimals)
    return raw > 0n ? raw : null
  }, [amount, tokenIn.decimals])

  useEffect(() => {
    if (!address || !client) return
    let cancelled = false
    readBalances(client, address, tokens)
      .then((b) => { if (!cancelled) setBalances(b) })
      .catch(() => undefined) // balances simply stay hidden
    return () => { cancelled = true }
  }, [address, client, tokens, doneHash])

  const fetchQuote = useCallback(async (): Promise<SwapQuote | null> => {
    if (!client || !address || amountIn === null) return null
    const id = ++requestId.current
    setBusy((b) => (b === 'approve' || b === 'swap' ? b : 'quote'))
    setError('')
    try {
      const q = await provider.quote({ client, user: address, tokenIn, tokenOut, amountIn, slippageBps: slippage })
      if (id !== requestId.current) return null
      const bad = validateSwapQuote(q)
      if (bad) throw new Error(bad)
      setQuote(q); setQuotedKey(key)
      return q
    } catch (e) {
      if (id === requestId.current) { setQuote(null); setError(kitErrorMessage(e)) }
      return null
    } finally {
      if (id === requestId.current) setBusy((b) => (b === 'quote' ? null : b))
    }
  }, [client, address, amountIn, provider, tokenIn, tokenOut, slippage, key])

  // Auto routes refresh a moment after you stop typing.
  useEffect(() => {
    if (!provider.auto || amountIn === null || !address) return
    const timer = setTimeout(() => { void fetchQuote() }, 500)
    return () => clearTimeout(timer)
  }, [provider.auto, amountIn, address, fetchQuote])

  const balIn = balances[tokenIn.address.toLowerCase()]
  const insufficient = balIn !== undefined && amountIn !== null && amountIn > balIn
  const isUsdcIn = same(tokenIn.address, USDC_TOKEN.address)
  const noGas = !insufficient && isUsdcIn && balIn !== undefined && amountIn !== null && balIn - amountIn < GAS_RESERVE_RAW
  const quoting = busy === 'quote'

  function pick(side: 'in' | 'out', t: ArcToken) {
    setQuote(null); setDoneHash(''); setError('')
    if (side === 'in') { if (same(t.address, tokenOut.address)) setTokenOut(tokenIn); setTokenIn(t) }
    else { if (same(t.address, tokenIn.address)) setTokenIn(tokenOut); setTokenOut(t) }
  }
  function flip() { setTokenIn(tokenOut); setTokenOut(tokenIn); setQuote(null); setDoneHash('') }

  function fillPercent(p: number) {
    if (balIn === undefined) return
    let raw = (balIn * BigInt(p)) / 100n
    if (isUsdcIn && p === 100) raw = balIn > GAS_RESERVE_RAW ? balIn - GAS_RESERVE_RAW : 0n
    setAmount(formatUnits(raw, tokenIn.decimals)); setQuote(null); setDoneHash('')
  }

  async function swap() {
    if (!client || !address || !quote || !fresh || amountIn === null) return
    setError('')
    try {
      // A price older than a few seconds is replaced, and you confirm the new one.
      if (Date.now() - quote.fetchedAt > STALE_MS) {
        const next = await fetchQuote()
        if (next) setError('The price was refreshed. Review it and confirm again.')
        return
      }
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })

      // Exact-amount approval, only when the router cannot already spend enough.
      if (quote.spender) {
        const allowance = await client.readContract({ address: tokenIn.address, abi: erc20Abi, functionName: 'allowance', args: [address, quote.spender] })
        if (allowance < quote.amountIn) {
          setBusy('approve')
          const approveHash = await writeContractAsync({
            address: tokenIn.address, abi: erc20Abi, functionName: 'approve', args: [quote.spender, quote.amountIn], chainId: ARC_CHAIN_ID,
          })
          const r = await client.waitForTransactionReceipt({ hash: approveHash })
          if (r.status !== 'success') throw new Error('Approval failed onchain.')
        }
      }

      setBusy('swap')
      // Dry run first so a failing swap shows a reason instead of burning gas.
      await client.call({ account: address, to: quote.tx.to, data: quote.tx.data, value: quote.tx.value })
      const hash = await sendTransactionAsync({ to: quote.tx.to, data: quote.tx.data, value: quote.tx.value, chainId: ARC_CHAIN_ID })
      const paid = formatTokenAmount(quote.amountIn, tokenIn.decimals, 8)
      appStore.createPendingTxRecord({
        txHash: hash, chainId: ARC_CHAIN_ID, direction: 'sent', amount: paid,
        fromAddress: address, toAddress: address, kind: 'swap', symbol: tokenIn.symbol,
        summary: `${paid} ${tokenIn.symbol} for about ${formatTokenAmount(quote.amountOut, tokenOut.decimals, 4)} ${tokenOut.symbol} via ${provider.name}`,
      })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        appStore.failTxRecord(hash, Number(receipt.blockNumber))
        throw new Error('Swap reverted onchain. Nothing was exchanged.')
      }
      appStore.confirmTxRecord(hash, Number(receipt.blockNumber))
      setDoneHash(hash); setQuote(null); setAmount('')
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setBusy((b) => (b === 'quote' ? b : null))
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to swap with {provider.name}</p>
        <ConnectKitButton />
      </div>
    )
  }

  const working = busy === 'approve' || busy === 'swap'
  const buttonLabel =
    busy === 'approve' ? 'Approve in your wallet...'
    : busy === 'swap' ? 'Confirm the swap in your wallet...'
    : amountIn === null ? 'Enter an amount'
    : insufficient ? `Not enough ${tokenIn.symbol}`
    : noGas ? 'Keep 0.05 USDC for gas'
    : fresh ? `Swap ${tokenIn.symbol} for ${tokenOut.symbol}`
    : provider.auto ? 'Finding the best price...'
    : 'Get a price'
  const onPrimary = fresh ? () => void swap() : () => void fetchQuote()
  const primaryDisabled = amountIn === null || insufficient || noGas || working || (provider.auto && !fresh)

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>{provider.notice}</span>
      </div>

      <div className="rounded-3xl p-4 space-y-4" data-tc="">
        <div>
          <AmountCard
            label="You pay"
            value={amount}
            symbol={tokenIn.symbol}
            token={tokenIn}
            tokens={[]}
            onOpenPicker={() => setPicker('in')}
            onToken={() => undefined}
            decimals={tokenIn.decimals}
            invalid={insufficient || noGas}
            onChange={(v) => { setAmount(v); setQuote(null); setDoneHash('') }}
            balanceText={balIn !== undefined ? `Balance ${formatTokenAmount(balIn, tokenIn.decimals, 4)}` : undefined}
            onPct={balIn !== undefined ? fillPercent : undefined}
          />
          <FlipButton onFlip={flip} />
          <AmountCard
            label="You receive (estimated)"
            value={fresh && quote ? formatTokenAmount(quote.amountOut, tokenOut.decimals, 8) : ''}
            symbol={tokenOut.symbol}
            token={tokenOut}
            tokens={[]}
            onOpenPicker={() => setPicker('out')}
            onToken={() => undefined}
            loading={quoting}
            dim={!!quote && !fresh}
          />
        </div>

        <SlippagePicker value={slippage} onChange={(bps) => { setSlippage(bps); setQuote(null) }} />

        <Reveal show={fresh && !!quote}>
          {quote && (
            <div className="rounded-2xl p-3 space-y-1.5 text-xs" data-tp="">
              <Row label="Minimum received" value={`${formatTokenAmount(quote.minOut, tokenOut.decimals, 8)} ${tokenOut.symbol}`} />
              {quote.details.map((d) => <Row key={d.label} label={d.label} value={d.value} />)}
              <p style={{ color: 'var(--subtle)' }}>Rates can move before the swap runs.</p>
            </div>
          )}
        </Reveal>

        <Reveal show={insufficient}>
          <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient {tokenIn.symbol} balance.</p>
        </Reveal>
        <Reveal show={noGas}>
          <p className="text-xs" style={{ color: 'var(--danger)' }}>Arc fees are paid in USDC. Leave at least 0.05 USDC in your wallet for gas.</p>
        </Reveal>
        <Reveal show={!!error}>
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
          </div>
        </Reveal>
        <Reveal show={!!doneHash}>
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
            <Check size={16} className="flex-shrink-0 mt-0.5" />
            <span>
              Swap confirmed.{' '}
              <a href={buildTxExplorerUrl(ARC_CHAIN_ID, doneHash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
                Explorer <ExternalLink size={12} />
              </a>
            </span>
          </div>
        </Reveal>

        <Button className="w-full" size="lg" loading={working || quoting} disabled={primaryDisabled} onClick={onPrimary}>
          {buttonLabel}
        </Button>
      </div>

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        tokens={tokens}
        balances={balances}
        loading={tokensLoading}
        selected={picker === 'out' ? tokenOut.address : tokenIn.address}
        allowCustom={provider.allowCustom}
        title={picker === 'out' ? 'You receive' : 'You pay'}
        onSelect={(t) => pick(picker === 'out' ? 'out' : 'in', t)}
      />
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
