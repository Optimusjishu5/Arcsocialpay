'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { useAccount, usePublicClient, useSwitchChain, useWriteContract } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { AlertCircle, Check, ExternalLink } from 'lucide-react'
import { Button } from '../ui/Button'
import { ARC_CHAIN_ID } from '../../chains'
import { appStore } from '../../store/appStore'
import { kitErrorMessage } from '../../lib/circleKit'
import {
  UNISWAP_ARC, UNI_TOKENS, buildSwapCall, feeLabel, minOut, quoteUniswap, type UniQuote, type UniToken,
} from '../../lib/uniswapArc'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { AmountCard, FlipButton, Reveal, SlippagePicker } from './SwapPanel'

/** Short display form of a token amount (display only). */
function shortAmount(raw: bigint, decimals: number): string {
  const [i, f] = formatUnits(raw, decimals).split('.')
  return f ? `${i}.${f.slice(0, 4)}`.replace(/\.$/, '') : i
}

const DEADLINE_SECONDS = 20 * 60

export function UniswapSwap() {
  const { address, isConnected, chainId } = useAccount()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })
  const { switchChainAsync } = useSwitchChain()
  const { writeContractAsync } = useWriteContract()
  const [inSym, setInSym] = useState('USDC')
  const [outSym, setOutSym] = useState('EURC')
  const [amount, setAmount] = useState('')
  const [slippage, setSlippage] = useState<number>(50)
  const [quote, setQuote] = useState<UniQuote | null>(null)
  const [quotedKey, setQuotedKey] = useState('')
  const [busy, setBusy] = useState<'quote' | 'approve' | 'swap' | null>(null)
  const [error, setError] = useState('')
  const [noPool, setNoPool] = useState(false)
  const [doneHash, setDoneHash] = useState('')
  const [balance, setBalance] = useState<bigint | null>(null)
  const requestId = useRef(0)

  const tokenIn = UNI_TOKENS.find((t) => t.symbol === inSym) as UniToken
  const tokenOut = UNI_TOKENS.find((t) => t.symbol === outSym) as UniToken
  const key = `${inSym}|${outSym}|${amount.trim()}|${address ?? ''}`
  const fresh = quote !== null && quotedKey === key

  const amountIn = useMemo(() => {
    const a = amount.trim()
    if (!new RegExp(`^\\d+(\\.\\d{1,${tokenIn.decimals}})?$`).test(a)) return null
    const raw = parseUnits(a, tokenIn.decimals)
    return raw > 0n ? raw : null
  }, [amount, tokenIn])

  useEffect(() => {
    if (!address || !client) return
    let cancelled = false
    client
      .readContract({ address: tokenIn.address, abi: erc20Abi, functionName: 'balanceOf', args: [address] })
      .then((b) => { if (!cancelled) setBalance(b) })
      .catch(() => { if (!cancelled) setBalance(null) })
    return () => { cancelled = true }
  }, [address, client, tokenIn, doneHash])

  // Prices update on their own shortly after you stop typing, no button press needed.
  useEffect(() => {
    const id = ++requestId.current
    if (!client || amountIn === null) return
    const timer = setTimeout(async () => {
      setBusy((b) => (b === 'approve' || b === 'swap' ? b : 'quote'))
      setError(''); setNoPool(false)
      try {
        const q = await quoteUniswap(client, tokenIn, tokenOut, amountIn)
        if (id !== requestId.current) return
        if (!q) { setNoPool(true); setQuote(null); return }
        setQuote(q); setQuotedKey(key)
      } catch (e) {
        if (id === requestId.current) setError(kitErrorMessage(e))
      } finally {
        if (id === requestId.current) setBusy((b) => (b === 'quote' ? null : b))
      }
    }, 450)
    return () => clearTimeout(timer)
  }, [client, amountIn, tokenIn, tokenOut, key])

  const insufficient = balance !== null && amountIn !== null && amountIn > balance
  const quoting = amountIn !== null && !fresh && !noPool && !error

  function pickPair(nextIn: string, nextOut: string) {
    setInSym(nextIn); setOutSym(nextOut); setQuote(null); setDoneHash('')
  }

  async function swap() {
    if (!client || !address || !quote || !fresh) return
    setError('')
    try {
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      // Exact-amount approval, only when the router cannot already spend enough.
      const allowance = await client.readContract({
        address: tokenIn.address, abi: erc20Abi, functionName: 'allowance', args: [address, UNISWAP_ARC.swapRouter02],
      })
      if (allowance < quote.amountIn) {
        setBusy('approve')
        const approveHash = await writeContractAsync({
          address: tokenIn.address, abi: erc20Abi, functionName: 'approve', args: [UNISWAP_ARC.swapRouter02, quote.amountIn], chainId: ARC_CHAIN_ID,
        })
        const r = await client.waitForTransactionReceipt({ hash: approveHash })
        if (r.status !== 'success') throw new Error('Approval failed onchain.')
      }
      setBusy('swap')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
      const call = buildSwapCall(quote, address, slippage, deadline)
      // Simulate first so a failing swap shows a reason instead of burning gas.
      await client.simulateContract({ ...call, account: address })
      const hash = await writeContractAsync({ ...call, chainId: ARC_CHAIN_ID })
      // Appears in History straight away, then flips to confirmed or failed.
      appStore.createPendingTxRecord({
        txHash: hash, chainId: ARC_CHAIN_ID, direction: 'sent', amount: formatUnits(quote.amountIn, tokenIn.decimals),
        fromAddress: address, toAddress: address, kind: 'swap', symbol: tokenIn.symbol,
        summary: `${formatUnits(quote.amountIn, tokenIn.decimals)} ${tokenIn.symbol} for about ${shortAmount(quote.amountOut, tokenOut.decimals)} ${tokenOut.symbol}`,
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
      setBusy(null)
    }
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to swap with Uniswap</p>
        <ConnectKitButton />
      </div>
    )
  }

  const tokenSymbols = UNI_TOKENS.map((t) => t.symbol)
  const buttonLabel =
    busy === 'approve' ? 'Approve in your wallet...'
    : busy === 'swap' ? 'Confirm the swap in your wallet...'
    : amountIn === null ? 'Enter an amount'
    : insufficient ? `Not enough ${inSym}`
    : noPool ? 'No liquidity for this size'
    : !fresh ? 'Finding the best price...'
    : `Swap ${inSym} for ${outSym}`

  return (
    <div className="space-y-4">
      <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
        <span>Swaps USDC, EURC and cirBTC through Uniswap v3 pools on Arc. Mainnet swaps move real funds. Pools can be thin, so check the minimum you will receive.</span>
      </div>

      <div className="rounded-3xl p-4 space-y-4" data-tc="">
        <div>
          <AmountCard
            label="You pay"
            value={amount}
            symbol={inSym}
            tokens={tokenSymbols}
            decimals={tokenIn.decimals}
            invalid={insufficient}
            onChange={(v) => { setAmount(v); setDoneHash('') }}
            onToken={(t) => pickPair(t, t === outSym ? inSym : outSym)}
            balanceText={balance !== null ? `Balance ${shortAmount(balance, tokenIn.decimals)}` : undefined}
            onPct={balance !== null ? (p) => { setAmount(formatUnits((balance * BigInt(p)) / 100n, tokenIn.decimals)); setDoneHash('') } : undefined}
          />
          <FlipButton onFlip={() => pickPair(outSym, inSym)} />
          <AmountCard
            label="You receive (estimated)"
            value={quote ? formatUnits(quote.amountOut, tokenOut.decimals) : ''}
            symbol={outSym}
            tokens={tokenSymbols}
            loading={quoting}
            dim={!!quote && !fresh}
            onToken={(t) => pickPair(t === inSym ? outSym : inSym, t)}
          />
        </div>

        <SlippagePicker value={slippage} onChange={setSlippage} />

        <Reveal show={fresh && !!quote}>
          {quote && (
            <div className="rounded-2xl p-3 space-y-1.5 text-xs" data-tp="">
              <Row label="Minimum received" value={`${formatUnits(minOut(quote.amountOut, slippage), tokenOut.decimals)} ${tokenOut.symbol}`} />
              <Row label="Uniswap pool fee" value={feeLabel(quote.fee)} />
              <Row label="Expires" value="20 minutes after you confirm" />
              <p style={{ color: 'var(--subtle)' }}>Rates can move before the swap runs.</p>
            </div>
          )}
        </Reveal>

        <Reveal show={insufficient}>
          <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient {inSym} balance.</p>
        </Reveal>
        <Reveal show={noPool}>
          <p className="text-sm" style={{ color: 'var(--danger)' }}>
            No Uniswap pool on Arc has enough liquidity for {inSym} to {outSym} at this size. Try a smaller amount or another pair.
          </p>
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

        <Button
          className="w-full"
          size="lg"
          loading={busy === 'approve' || busy === 'swap' || quoting}
          disabled={!fresh || insufficient || busy === 'approve' || busy === 'swap'}
          onClick={() => void swap()}
        >
          {buttonLabel}
        </Button>
      </div>
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
