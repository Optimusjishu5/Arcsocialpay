// Same-chain swap quotes on Arc Mainnet from Uniswap v3, KyberSwap and LI.FI.
// Each provider returns the same shape: an expected and a minimum output, the
// contract that must be approved, and one transaction for the wallet to sign.
// Nothing is sent from here. Every returned transaction is checked against what
// the user reviewed before the wallet is asked to sign (see validateSwapQuote).

import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem'
import { ARC_CHAIN_ID } from '../chains'
import { buildSwapCall, minOut as minOutBps, quoteUniswap, UNISWAP_ARC, feeLabel } from './uniswapArc'
import type { ArcToken, TokenSource } from './arcTokens'

export type SwapProviderId = 'uniswap' | 'kyber' | 'lifi'

export interface SwapQuoteRequest {
  client: PublicClient
  user: Address
  tokenIn: ArcToken
  tokenOut: ArcToken
  amountIn: bigint
  slippageBps: number
}

export interface SwapQuote {
  provider: SwapProviderId
  amountIn: bigint
  amountOut: bigint
  minOut: bigint
  /** Contract that must be allowed to pull the sold token; null when none is needed. */
  spender: Address | null
  tx: { to: Address; data: Hex; value: bigint }
  details: { label: string; value: string }[]
  fetchedAt: number
}

export interface SwapProviderConfig {
  id: SwapProviderId
  name: string
  hint: string
  /** Price updates by itself while typing. LI.FI asks for a button because its keyless limit is small. */
  auto: boolean
  allowCustom: boolean
  source: TokenSource
  notice: string
  quote: (req: SwapQuoteRequest) => Promise<SwapQuote>
}

const DEADLINE_SECONDS = 20 * 60
const bi = (v: string | number | bigint | null | undefined): bigint => {
  try { return BigInt(v ?? 0) } catch { return 0n }
}
const usd = (v: string | number | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) ? `$${n < 0.01 && n > 0 ? '<0.01' : n.toFixed(2)}` : 'n/a'
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (res.status === 429) throw new Error('This price service is rate limited right now. Wait a minute and try again.')
  if (!res.ok) throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`)
  return body
}

// ── Uniswap v3 (direct pool quotes, no API) ─────────────────────────────────

async function quoteUniswapProvider(r: SwapQuoteRequest): Promise<SwapQuote> {
  const q = await quoteUniswap(r.client, r.tokenIn, r.tokenOut, r.amountIn)
  if (!q) throw new Error(`No Uniswap pool on Arc can fill ${r.tokenIn.symbol} to ${r.tokenOut.symbol} at this size. Try a smaller amount or another pair.`)
  const deadline = BigInt(Math.floor(Date.now() / 1000) + DEADLINE_SECONDS)
  const call = buildSwapCall(q, r.user, r.slippageBps, deadline)
  return {
    provider: 'uniswap', amountIn: r.amountIn, amountOut: q.amountOut, minOut: minOutBps(q.amountOut, r.slippageBps),
    spender: UNISWAP_ARC.swapRouter02,
    tx: { to: call.address, data: encodeFunctionData({ abi: call.abi, functionName: call.functionName, args: call.args }), value: 0n },
    details: [{ label: 'Uniswap pool fee', value: feeLabel(q.fee) }, { label: 'Expires', value: '20 minutes after you confirm' }],
    fetchedAt: Date.now(),
  }
}

// ── KyberSwap aggregator ────────────────────────────────────────────────────

const KYBER_BASE = 'https://aggregator-api.kyberswap.com/arc/api/v1'
const KYBER_CLIENT = 'arcsocialpay'
/** KyberSwap's MetaAggregationRouterV2. A response that points anywhere else is refused. */
export const KYBER_ROUTER: Address = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5'

interface KyberEnvelope<T> { code: number; message?: string; data: T }
interface KyberRouteSummary {
  amountIn: string; amountInUsd?: string; amountOut: string; amountOutUsd?: string; gasUsd?: string
  route?: { exchange?: string }[][]
}

async function quoteKyber(r: SwapQuoteRequest): Promise<SwapQuote> {
  const headers = { 'x-client-id': KYBER_CLIENT }
  const qs = new URLSearchParams({ tokenIn: r.tokenIn.address, tokenOut: r.tokenOut.address, amountIn: r.amountIn.toString(), gasInclude: 'true' })
  const routes = await getJson<KyberEnvelope<{ routeSummary: KyberRouteSummary; routerAddress: string }>>(`${KYBER_BASE}/routes?${qs}`, { headers })
  if (routes.code !== 0 || !routes.data?.routeSummary) throw new Error(routes.message || 'KyberSwap found no route for this pair.')
  if (routes.data.routerAddress.toLowerCase() !== KYBER_ROUTER.toLowerCase()) throw new Error('KyberSwap returned an unexpected router. Swap cancelled for your safety.')

  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS
  const built = await getJson<KyberEnvelope<{ amountOut: string; data: string; routerAddress: string; transactionValue?: string; gasUsd?: string }>>(`${KYBER_BASE}/route/build`, {
    method: 'POST',
    headers: { ...headers, 'content-type': 'application/json' },
    body: JSON.stringify({
      routeSummary: routes.data.routeSummary, sender: r.user, recipient: r.user,
      slippageTolerance: r.slippageBps, deadline, source: KYBER_CLIENT,
    }),
  })
  if (built.code !== 0 || !built.data?.data) throw new Error(built.message || 'KyberSwap could not build this swap.')

  const amountOut = bi(built.data.amountOut)
  const venues = [...new Set((routes.data.routeSummary.route ?? []).flat().map((s) => s.exchange).filter(Boolean))] as string[]
  return {
    provider: 'kyber', amountIn: r.amountIn, amountOut, minOut: (amountOut * BigInt(10_000 - r.slippageBps)) / 10_000n,
    spender: built.data.routerAddress as Address,
    tx: { to: built.data.routerAddress as Address, data: built.data.data as Hex, value: bi(built.data.transactionValue) },
    details: [
      ...(venues.length ? [{ label: 'Route', value: venues.slice(0, 3).join(', ') }] : []),
      { label: 'Network fee (est.)', value: usd(built.data.gasUsd ?? routes.data.routeSummary.gasUsd) },
      { label: 'Expires', value: '20 minutes after you confirm' },
    ],
    fetchedAt: Date.now(),
  }
}

// ── LI.FI ───────────────────────────────────────────────────────────────────

interface LifiQuote {
  tool?: string
  toolDetails?: { name?: string }
  estimate: { toAmount: string; toAmountMin?: string; approvalAddress?: string; gasCosts?: { amountUSD?: string }[]; feeCosts?: { amountUSD?: string }[] }
  transactionRequest: { to: string; data: string; value?: string; chainId?: number | string }
}

async function quoteLifi(r: SwapQuoteRequest): Promise<SwapQuote> {
  const qs = new URLSearchParams({
    fromChain: String(ARC_CHAIN_ID), toChain: String(ARC_CHAIN_ID), fromToken: r.tokenIn.address.toLowerCase(), toToken: r.tokenOut.address.toLowerCase(),
    fromAmount: r.amountIn.toString(), fromAddress: r.user, toAddress: r.user, slippage: String(r.slippageBps / 10_000),
  })
  const d = await getJson<LifiQuote>(`https://li.quest/v1/quote?${qs}`)
  const t = d.transactionRequest
  if (!t?.to || !t.data) throw new Error('LI.FI returned no transaction for this swap.')
  if (Number(t.chainId ?? ARC_CHAIN_ID) !== ARC_CHAIN_ID) throw new Error('LI.FI returned a transaction for the wrong network. Swap cancelled for your safety.')
  // The router must be a deployed contract on Arc.
  const code = await r.client.getCode({ address: t.to as Address })
  if (!code || code === '0x') throw new Error('LI.FI pointed to an address with no contract on Arc. Swap cancelled for your safety.')

  const amountOut = bi(d.estimate.toAmount)
  const sum = (xs?: { amountUSD?: string }[]) => (xs ?? []).reduce((a, x) => a + (Number(x.amountUSD) || 0), 0)
  return {
    provider: 'lifi', amountIn: r.amountIn, amountOut, minOut: bi(d.estimate.toAmountMin) || (amountOut * BigInt(10_000 - r.slippageBps)) / 10_000n,
    spender: (d.estimate.approvalAddress as Address | undefined) ?? null,
    tx: { to: t.to as Address, data: t.data as Hex, value: bi(t.value) },
    details: [
      { label: 'Route', value: d.toolDetails?.name ?? d.tool ?? 'LI.FI' },
      { label: 'Network fee (est.)', value: usd(sum(d.estimate.gasCosts)) },
      ...(sum(d.estimate.feeCosts) > 0 ? [{ label: 'Provider fee', value: usd(sum(d.estimate.feeCosts)) }] : []),
    ],
    fetchedAt: Date.now(),
  }
}

// ── Registry ────────────────────────────────────────────────────────────────

export const SWAP_PROVIDERS: Record<SwapProviderId, SwapProviderConfig> = {
  uniswap: {
    id: 'uniswap', name: 'Uniswap', hint: 'v3 pools on Arc', auto: true, allowCustom: true, source: 'uniswap',
    notice: 'Swaps through Uniswap v3 pools on Arc. Mainnet swaps move real funds. Pools can be thin, so check the minimum you will receive.',
    quote: quoteUniswapProvider,
  },
  kyber: {
    id: 'kyber', name: 'KyberSwap', hint: 'Best route across pools', auto: true, allowCustom: false, source: 'kyber',
    notice: 'KyberSwap splits your swap across Arc pools for the best price. Mainnet swaps move real funds, and you are subject to KyberSwap\'s terms of use.',
    quote: quoteKyber,
  },
  lifi: {
    id: 'lifi', name: 'LI.FI', hint: 'Aggregator routing', auto: false, allowCustom: false, source: 'lifi',
    notice: 'LI.FI routes your swap through the best DEX on Arc. Mainnet swaps move real funds, and you are subject to LI.FI\'s terms of service. Prices load when you press the button to stay within the free request limit.',
    quote: quoteLifi,
  },
}

/**
 * Refuse a transaction that does not match what the user reviewed:
 * wrong target contract, attached native value, or a missing approval target.
 */
export function validateSwapQuote(q: SwapQuote): string | null {
  if (q.tx.value !== 0n) return 'The route attached native value to the swap. Cancelled for your safety.'
  const to = q.tx.to.toLowerCase()
  if (q.provider === 'uniswap' && to !== UNISWAP_ARC.swapRouter02.toLowerCase()) return 'The swap points at an unexpected contract.'
  if (q.provider === 'kyber' && (to !== KYBER_ROUTER.toLowerCase() || q.spender?.toLowerCase() !== KYBER_ROUTER.toLowerCase())) return 'The swap points at an unexpected contract.'
  if (q.provider === 'lifi' && q.spender && q.spender.toLowerCase() !== to) return 'The approval target does not match the swap contract. Cancelled for your safety.'
  if (q.minOut <= 0n || q.amountOut <= 0n) return 'The route returned no output amount.'
  return null
}
