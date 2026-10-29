// USDC bridge routes from Across, Relay and LI.FI. All three public APIs work
// without a key from the browser. Every transaction they return is checked
// here before the wallet is asked to sign it.

import { decodeFunctionData, encodeFunctionData, erc20Abi, type Hex } from 'viem'

export type RouteProvider = 'Across' | 'Relay' | 'LI.FI'
export const ROUTE_PROVIDERS: RouteProvider[] = ['Across', 'Relay', 'LI.FI']

export interface RouteTx {
  label: string
  chainId: number
  to: `0x${string}`
  data: Hex
  value: bigint
  /** Set on approval steps so they can be checked against the amount. */
  approval?: boolean
}

export interface RouteQuote {
  provider: RouteProvider
  /** Estimated USDC received on the destination chain (6 decimals). */
  amountOut: bigint
  /** Guaranteed minimum, when the provider reports one. */
  minOut?: bigint
  etaSeconds?: number
  txs: RouteTx[]
  /** Everything needed to poll delivery after the source transaction. */
  status: { provider: RouteProvider; relayEndpoint?: string }
  fetchedAt: number
}

export interface RouteRequest {
  fromChainId: number
  toChainId: number
  fromToken: `0x${string}`
  toToken: `0x${string}`
  amountRaw: bigint
  user: `0x${string}`
  recipient: `0x${string}`
}

const bi = (v: string | number | bigint | null | undefined): bigint => {
  try { return BigInt(v ?? 0) } catch { return 0n }
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string }
  if (!res.ok) throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`)
  return body
}


/**
 * Providers sometimes ask for a larger (even unlimited) allowance. Rebuild
 * those approvals for exactly the amount being bridged, same spender.
 */
function tightenApprovals(txs: RouteTx[], amountRaw: bigint): RouteTx[] {
  return txs.map((tx) => {
    if (!tx.approval) return tx
    try {
      const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: tx.data })
      if (functionName !== 'approve') return tx
      const [spender, value] = args
      if (value <= amountRaw) return tx
      return { ...tx, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [spender, amountRaw] }) }
    } catch {
      return tx
    }
  })
}

// ── Across ──────────────────────────────────────────────────────────────────

interface AcrossTx { chainId: number; to: string; data: string; value?: string }

async function quoteAcross(r: RouteRequest): Promise<RouteQuote> {
  const q = new URLSearchParams({
    tradeType: 'exactInput', amount: r.amountRaw.toString(), inputToken: r.fromToken, outputToken: r.toToken,
    originChainId: String(r.fromChainId), destinationChainId: String(r.toChainId),
    depositor: r.user, recipient: r.recipient,
  })
  const d = await getJson<{
    approvalTxns?: AcrossTx[]; swapTx: AcrossTx; expectedOutputAmount: string; minOutputAmount?: string; expectedFillTime?: number
  }>(`https://app.across.to/api/swap/approval?${q}`)
  const txs: RouteTx[] = [
    ...(d.approvalTxns ?? []).map((t) => ({ label: 'Approve USDC', chainId: t.chainId, to: t.to as `0x${string}`, data: t.data as Hex, value: bi(t.value), approval: true })),
    { label: 'Bridge with Across', chainId: d.swapTx.chainId, to: d.swapTx.to as `0x${string}`, data: d.swapTx.data as Hex, value: bi(d.swapTx.value) },
  ]
  return {
    provider: 'Across', amountOut: bi(d.expectedOutputAmount), minOut: bi(d.minOutputAmount), etaSeconds: d.expectedFillTime,
    txs: tightenApprovals(txs, r.amountRaw), status: { provider: 'Across' }, fetchedAt: Date.now(),
  }
}

// ── Relay ───────────────────────────────────────────────────────────────────

interface RelayItem { data: { to: string; data: string; value?: string; chainId: number }; check?: { endpoint: string } }
interface RelayStep { id: string; kind: string; description?: string; items?: RelayItem[] }

async function quoteRelay(r: RouteRequest): Promise<RouteQuote> {
  const d = await getJson<{
    steps: RelayStep[]
    details?: { currencyOut?: { amount?: string }; timeEstimate?: number }
  }>('https://api.relay.link/quote/v2', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      user: r.user, recipient: r.recipient, originChainId: r.fromChainId, destinationChainId: r.toChainId,
      originCurrency: r.fromToken, destinationCurrency: r.toToken, amount: r.amountRaw.toString(), tradeType: 'EXACT_INPUT',
    }),
  })
  const txs: RouteTx[] = []
  let endpoint: string | undefined
  for (const step of d.steps) {
    if (step.kind !== 'transaction') throw new Error('This Relay route needs a signature step that is not supported here.')
    for (const item of step.items ?? []) {
      txs.push({
        label: step.id === 'approve' ? 'Approve USDC' : 'Bridge with Relay',
        chainId: item.data.chainId, to: item.data.to as `0x${string}`, data: item.data.data as Hex, value: bi(item.data.value),
        approval: step.id === 'approve',
      })
      if (item.check?.endpoint) endpoint = item.check.endpoint
    }
  }
  if (txs.length === 0) throw new Error('Relay returned no transactions for this route.')
  return {
    provider: 'Relay', amountOut: bi(d.details?.currencyOut?.amount), etaSeconds: d.details?.timeEstimate,
    txs: tightenApprovals(txs, r.amountRaw), status: { provider: 'Relay', relayEndpoint: endpoint }, fetchedAt: Date.now(),
  }
}

// ── LI.FI ───────────────────────────────────────────────────────────────────

async function quoteLifi(r: RouteRequest): Promise<RouteQuote> {
  const q = new URLSearchParams({
    fromChain: String(r.fromChainId), toChain: String(r.toChainId), fromToken: r.fromToken, toToken: r.toToken,
    fromAmount: r.amountRaw.toString(), fromAddress: r.user, toAddress: r.recipient, slippage: '0.005',
  })
  const d = await getJson<{
    transactionRequest: { to: string; data: string; value?: string; chainId: number }
    estimate: { toAmount: string; toAmountMin?: string; approvalAddress?: string; executionDuration?: number }
  }>(`https://li.quest/v1/quote?${q}`)
  const txs: RouteTx[] = []
  if (d.estimate.approvalAddress) {
    // Exact-amount approval, built here rather than taken from the API.
    txs.push({
      label: 'Approve USDC', chainId: r.fromChainId, to: r.fromToken, value: 0n, approval: true,
      data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [d.estimate.approvalAddress as `0x${string}`, r.amountRaw] }),
    })
  }
  const t = d.transactionRequest
  txs.push({ label: 'Bridge with LI.FI', chainId: t.chainId, to: t.to as `0x${string}`, data: t.data as Hex, value: bi(t.value) })
  return {
    provider: 'LI.FI', amountOut: bi(d.estimate.toAmount), minOut: bi(d.estimate.toAmountMin),
    etaSeconds: d.estimate.executionDuration, txs, status: { provider: 'LI.FI' }, fetchedAt: Date.now(),
  }
}

export interface ProviderResult { provider: RouteProvider; quote?: RouteQuote; error?: string }

/** Ask all three providers at once; a provider that cannot serve the route reports why. */
export async function getRouteQuotes(r: RouteRequest): Promise<ProviderResult[]> {
  const jobs: [RouteProvider, Promise<RouteQuote>][] = [
    ['Across', quoteAcross(r)], ['Relay', quoteRelay(r)], ['LI.FI', quoteLifi(r)],
  ]
  const settled = await Promise.allSettled(jobs.map(([, p]) => p))
  return settled.map((s, i) =>
    s.status === 'fulfilled'
      ? { provider: jobs[i][0], quote: s.value }
      : { provider: jobs[i][0], error: s.reason instanceof Error ? s.reason.message : 'Route unavailable' },
  )
}

/**
 * Refuse transactions that do not match what the user reviewed: wrong chain,
 * an approval for a different token or more than the bridged amount, or
 * native value on an approval.
 */
export function validateRouteTxs(q: RouteQuote, req: RouteRequest): string | null {
  for (const tx of q.txs) {
    if (tx.chainId !== req.fromChainId) return `${q.provider} returned a transaction for the wrong chain.`
    if (tx.approval) {
      if (tx.to.toLowerCase() !== req.fromToken.toLowerCase()) return `${q.provider} asked to approve an unexpected token.`
      if (tx.value !== 0n) return `${q.provider} attached value to an approval.`
      try {
        const { functionName, args } = decodeFunctionData({ abi: erc20Abi, data: tx.data })
        if (functionName !== 'approve') return `${q.provider} sent an unexpected approval call.`
        if ((args as readonly [string, bigint])[1] > req.amountRaw) return `${q.provider} asked for an approval above the amount you are bridging.`
      } catch {
        return `${q.provider} sent an approval this app cannot read.`
      }
    }
  }
  return null
}

export type DeliveryStatus = 'pending' | 'done' | 'failed'

/** Poll the provider's own status API for a submitted source transaction. */
export async function getDeliveryStatus(q: RouteQuote, req: RouteRequest, txHash: string): Promise<DeliveryStatus> {
  try {
    if (q.status.provider === 'LI.FI') {
      const d = await getJson<{ status?: string }>(`https://li.quest/v1/status?txHash=${txHash}&fromChain=${req.fromChainId}&toChain=${req.toChainId}`)
      return d.status === 'DONE' ? 'done' : d.status === 'FAILED' ? 'failed' : 'pending'
    }
    if (q.status.provider === 'Relay') {
      if (!q.status.relayEndpoint) return 'pending'
      const d = await getJson<{ status?: string }>(`https://api.relay.link${q.status.relayEndpoint}`)
      return d.status === 'success' ? 'done' : d.status === 'failure' || d.status === 'refund' ? 'failed' : 'pending'
    }
    const d = await getJson<{ status?: string }>(`https://app.across.to/api/deposit/status?originChainId=${req.fromChainId}&depositTxnRef=${txHash}`)
    return d.status === 'filled' ? 'done' : d.status === 'expired' || d.status === 'refunded' ? 'failed' : 'pending'
  } catch {
    // Not indexed yet: treat as still pending.
    return 'pending'
  }
}
