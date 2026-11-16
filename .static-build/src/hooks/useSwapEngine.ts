'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { erc20Abi, formatUnits, parseUnits } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useSwitchChain, useWriteContract } from 'wagmi'
import { ARC_CHAIN_ID } from '../chains'
import { appStore } from '../store/appStore'
import { kitErrorMessage } from '../lib/circleKit'
import {
  EURC_TOKEN, GAS_RESERVE_RAW, USDC_TOKEN, formatTokenAmount, readBalances, useArcTokens, type ArcToken,
} from '../lib/arcTokens'
import { SWAP_PROVIDERS, validateSwapQuote, type SwapProviderId, type SwapQuote } from '../lib/swapProviders'

const STALE_MS = 45_000
const AUTO_REFRESH_MS = 15_000
const LIFI_MIN_GAP_MS = 6_000
const LIFI_COOLDOWN_MS = 90_000
const LIFI_SESSION_BUDGET = 50
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// LI.FI's free tier allows few requests, so calls are spaced out, paused after a
// rate-limit reply, and capped per page load.
const lifi = { last: 0, pausedUntil: 0, used: 0 }

export interface RouteResult { id: SwapProviderId; quote?: SwapQuote; error?: string }

export interface SwapEngineOptions {
  /** Routes asked for a price. */
  routes: readonly SwapProviderId[]
  /** Which tokens can be picked. */
  tokenFilter?: (t: ArcToken) => boolean
}

/** Shared logic for the swap screens: tokens, balances, prices from several routes, approval and sending. */
export function useSwapEngine({ routes, tokenFilter }: SwapEngineOptions) {
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
  const [results, setResults] = useState<RouteResult[] | null>(null)
  const [resultsKey, setResultsKey] = useState('')
  const [choice, setChoice] = useState<'auto' | SwapProviderId>('auto')
  const [quoting, setQuoting] = useState(false)
  const [busy, setBusy] = useState<'approve' | 'swap' | null>(null)
  const [error, setError] = useState('')
  const [doneHash, setDoneHash] = useState('')
  const [balances, setBalances] = useState<Record<string, bigint>>({})
  const requestId = useRef(0)

  const tokens = useMemo(() => (tokenFilter ? allTokens.filter(tokenFilter) : allTokens), [allTokens, tokenFilter])
  const routeKey = routes.join(',')
  const key = `${tokenIn.address}|${tokenOut.address}|${amount.trim()}|${slippage}|${address ?? ''}|${routeKey}`

  const amountIn = useMemo(() => {
    const a = amount.trim()
    if (!new RegExp(`^\\d+(\\.\\d{1,${tokenIn.decimals}})?$`).test(a)) return null
    const raw = parseUnits(a, tokenIn.decimals)
    return raw > 0n ? raw : null
  }, [amount, tokenIn.decimals])

  // Balances for every listed token in one request.
  useEffect(() => {
    if (!address || !client) return
    let cancelled = false
    readBalances(client, address, allTokens)
      .then((b) => { if (!cancelled) setBalances(b) })
      .catch(() => undefined) // balances simply stay hidden
    return () => { cancelled = true }
  }, [address, client, allTokens, doneHash])

  /**
   * Asks every route for a price. Each route's answer shows up the moment it
   * arrives, so a fast route is usable while a slower one is still loading.
   * A silent refresh re-asks everything except LI.FI (small free limit) and
   * swaps the new prices in without clearing the screen.
   */
  const fetchQuotes = useCallback(async (silent = false) => {
    if (!client || !address || amountIn === null) return
    const id = ++requestId.current
    const current = () => id === requestId.current
    const asked = silent ? routes.filter((r) => r !== 'lifi') : routes
    if (asked.length === 0) return
    if (!silent) { setQuoting(true); setError('') }
    const base = { client, user: address, tokenIn, tokenOut, amountIn, slippageBps: slippage }
    const ask = async (route: SwapProviderId): Promise<SwapQuote> => {
      if (route === 'lifi') {
        if (Date.now() < lifi.pausedUntil) throw new Error('LI.FI is rate limited right now. Try again in a minute.')
        if (lifi.used >= LIFI_SESSION_BUDGET) throw new Error('LI.FI free request limit reached for this session. Reload the page to reset it.')
        const wait = lifi.last + LIFI_MIN_GAP_MS - Date.now()
        if (wait > 0) await sleep(wait)
        if (!current()) throw new Error('Superseded')
        lifi.last = Date.now(); lifi.used += 1
      }
      try {
        const q = await SWAP_PROVIDERS[route].quote(base)
        const bad = validateSwapQuote(q)
        if (bad) throw new Error(bad)
        return q
      } catch (e) {
        if (route === 'lifi' && /rate limited/i.test(e instanceof Error ? e.message : '')) lifi.pausedUntil = Date.now() + LIFI_COOLDOWN_MS
        throw e
      }
    }
    const answered: RouteResult[] = []
    await Promise.all(asked.map(async (route) => {
      let result: RouteResult
      try { result = { id: route, quote: await ask(route) } } catch (e) { result = { id: route, error: kitErrorMessage(e) } }
      if (!current()) return
      answered.push(result)
      // Silent refreshes wait for every route so the numbers do not jump around.
      if (silent && answered.length < asked.length) return
      setResults((prev) => (silent ? [...answered, ...(prev ?? []).filter((r) => !asked.includes(r.id))] : [...answered]))
      setResultsKey(key)
    }))
    if (current() && !silent) setQuoting(false)
  }, [client, address, amountIn, tokenIn, tokenOut, slippage, routes, key])

  // Prices refresh a moment after you stop typing.
  useEffect(() => {
    if (amountIn === null || !address) return
    const timer = setTimeout(() => { void fetchQuotes() }, routes.includes('lifi') ? 900 : 250)
    return () => clearTimeout(timer)
  }, [amountIn, address, fetchQuotes, routes])

  const fresh = results !== null && resultsKey === key
  // Keeps the price current while you read it, so the Swap button never goes stale.
  useEffect(() => {
    if (!fresh || quoting || busy !== null || amountIn === null) return
    const timer = setInterval(() => { if (!document.hidden) void fetchQuotes(true) }, AUTO_REFRESH_MS)
    return () => clearInterval(timer)
  }, [fresh, quoting, busy, amountIn, fetchQuotes])

  const ranked = useMemo(
    () => (fresh && results ? results.filter((r) => r.quote).sort((a, b) => Number((b.quote?.amountOut ?? 0n) - (a.quote?.amountOut ?? 0n))) : []),
    [fresh, results],
  )
  const best = ranked[0]?.quote
  const selected: SwapQuote | undefined = choice === 'auto' ? best : ranked.find((r) => r.id === choice)?.quote
  const selectedId: SwapProviderId | undefined = choice === 'auto' ? ranked[0]?.id : choice
  const noRoute = fresh && !quoting && ranked.length === 0

  const balIn = balances[tokenIn.address.toLowerCase()]
  const balOut = balances[tokenOut.address.toLowerCase()]
  const insufficient = balIn !== undefined && amountIn !== null && amountIn > balIn
  const isUsdcIn = same(tokenIn.address, USDC_TOKEN.address)
  const noGas = !insufficient && isUsdcIn && balIn !== undefined && amountIn !== null && balIn - amountIn < GAS_RESERVE_RAW

  const resetQuotes = () => { setResults(null); setError(''); requestId.current++; setQuoting(false) }

  function pick(side: 'in' | 'out', t: ArcToken) {
    resetQuotes(); setDoneHash('')
    if (side === 'in') { if (same(t.address, tokenOut.address)) setTokenOut(tokenIn); setTokenIn(t) }
    else { if (same(t.address, tokenIn.address)) setTokenIn(tokenOut); setTokenOut(t) }
  }
  function flip() { resetQuotes(); setDoneHash(''); setTokenIn(tokenOut); setTokenOut(tokenIn) }
  function changeAmount(v: string) { setAmount(v); resetQuotes(); setDoneHash('') }
  function changeSlippage(bps: number) { setSlippage(bps); resetQuotes() }

  function fillPercent(p: number) {
    if (balIn === undefined) return
    let raw = (balIn * BigInt(p)) / 100n
    if (isUsdcIn && p === 100) raw = balIn > GAS_RESERVE_RAW ? balIn - GAS_RESERVE_RAW : 0n
    changeAmount(formatUnits(raw, tokenIn.decimals))
  }

  async function swap() {
    const quote = selected
    if (!client || !address || !quote || !fresh || amountIn === null) return
    setError('')
    try {
      // A price older than a few seconds is replaced, and you confirm the new one.
      if (Date.now() - quote.fetchedAt > STALE_MS) {
        await fetchQuotes()
        setError('The price was refreshed. Review it and confirm again.')
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
        summary: `${paid} ${tokenIn.symbol} for about ${formatTokenAmount(quote.amountOut, tokenOut.decimals, 4)} ${tokenOut.symbol} via ${SWAP_PROVIDERS[quote.provider].name}`,
      })
      const receipt = await client.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        appStore.failTxRecord(hash, Number(receipt.blockNumber))
        throw new Error('Swap reverted onchain. Nothing was exchanged.')
      }
      appStore.confirmTxRecord(hash, Number(receipt.blockNumber))
      setDoneHash(hash); resetQuotes(); setAmount('')
    } catch (e) {
      setError(kitErrorMessage(e))
    } finally {
      setBusy(null)
    }
  }

  // Dollar values from the token list's prices (display only).
  const usdOf = (raw: bigint, t: ArcToken): number | undefined =>
    t.priceUSD ? Number(formatUnits(raw, t.decimals)) * t.priceUSD : undefined
  const usdIn = amountIn !== null ? usdOf(amountIn, tokenIn) : undefined
  const usdOut = selected ? usdOf(selected.amountOut, tokenOut) : undefined

  return {
    isConnected, address, tokens, tokensLoading, allTokens, balances,
    tokenIn, tokenOut, amount, slippage, amountIn, balIn, balOut,
    results, ranked, best, selected, selectedId, choice, setChoice, fresh, quoting, noRoute, busy, error, doneHash,
    insufficient, noGas, usdIn, usdOut,
    pick, flip, changeAmount, changeSlippage, fillPercent, swap, refresh: () => fetchQuotes(),
  }
}

export type SwapEngine = ReturnType<typeof useSwapEngine>
