/**
 * AchSwap Developer API (server only). The key never leaves the server: browsers call /api/achswap,
 * which checks the request, spends the key's limits carefully and returns only what the app needs.
 * Docs: https://docs.achswap.app/developers/developer-api
 */
import { isAddress } from 'viem'

export const ACHSWAP_EXECUTOR = '0xF69036De0e32566CfF7C79c29229D441cdE3e48E'
const DEFAULT_BASE = 'https://trade.achswap.app/api/v1'
const ARC_CHAIN_ID = 5042

/** The key's own limits are 60 requests a minute and 2 at a time. Stay under both. */
const MAX_PER_MINUTE = 50
const MAX_IN_FLIGHT = 2
const QUEUE_WAIT_MS = 5_000
const TIMEOUT_MS = 12_000
const QUOTE_CACHE_MS = 5_000

export const achswapKey = (): string | null => process.env.ACHSWAP_API_KEY?.trim() || null
export const achswapConfigured = (): boolean => achswapKey() !== null
const base = () => (process.env.ACHSWAP_API_URL?.trim() || DEFAULT_BASE).replace(/\/$/, '')

export interface AchRequest {
  action: 'quote' | 'swap'
  tokenIn: string
  tokenOut: string
  amountIn: string
  slippageBps: number
  sender?: string
}

export class AchError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfter?: number) { super(message) }
}

/** Checks the body from the browser. Returns the clean request, or throws a 400. */
export function parseAchRequest(body: unknown): AchRequest {
  const b = (body ?? {}) as Record<string, unknown>
  const fail = (m: string) => { throw new AchError(400, 'INVALID_REQUEST', m) }
  if (b.action !== 'quote' && b.action !== 'swap') fail('action must be quote or swap')
  for (const f of ['tokenIn', 'tokenOut'] as const) if (typeof b[f] !== 'string' || !isAddress(b[f])) fail(`${f} must be an address`)
  if (typeof b.amountIn !== 'string' || !/^[1-9]\d{0,38}$/.test(b.amountIn)) fail('amountIn must be a whole number string')
  const slip = b.slippageBps === undefined ? 50 : Number(b.slippageBps)
  if (!Number.isInteger(slip) || slip < 1 || slip > 2000) fail('slippageBps must be between 1 and 2000')
  if ((b.tokenIn as string).toLowerCase() === (b.tokenOut as string).toLowerCase()) fail('Choose two different tokens')
  if (b.action === 'swap' && (typeof b.sender !== 'string' || !isAddress(b.sender))) fail('sender must be an address')
  return {
    action: b.action as 'quote' | 'swap', tokenIn: b.tokenIn as string, tokenOut: b.tokenOut as string, amountIn: b.amountIn as string,
    slippageBps: slip, sender: b.action === 'swap' ? (b.sender as string) : undefined,
  }
}

// ── Limits ─────────────────────────────────────────────────────────────────

let minuteStart = 0
let usedThisMinute = 0
let inFlight = 0
const waiters: Array<() => void> = []

function spendBudget(now = Date.now()): void {
  if (now - minuteStart >= 60_000) { minuteStart = now; usedThisMinute = 0 }
  if (usedThisMinute >= MAX_PER_MINUTE) {
    throw new AchError(429, 'BUSY', 'AchSwap is busy right now. Try again in a moment.', Math.max(1, Math.ceil((minuteStart + 60_000 - now) / 1000)))
  }
  usedThisMinute++
}

async function slot(): Promise<() => void> {
  if (inFlight >= MAX_IN_FLIGHT) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => { waiters.splice(waiters.indexOf(go), 1); reject(new AchError(429, 'BUSY', 'AchSwap is busy right now. Try again in a moment.', 2)) }, QUEUE_WAIT_MS)
      const go = () => { clearTimeout(t); resolve() }
      waiters.push(go)
    })
  }
  inFlight++
  return () => { inFlight--; waiters.shift()?.() }
}

/** Visitors are limited too, so one browser cannot use up the key for everyone. */
const perVisitor = new Map<string, { start: number; n: number }>()
export function visitorAllowed(id: string, limit = 40, now = Date.now()): boolean {
  const v = perVisitor.get(id)
  if (!v || now - v.start >= 60_000) {
    perVisitor.set(id, { start: now, n: 1 })
    if (perVisitor.size > 5000) for (const [k, x] of perVisitor) if (now - x.start >= 60_000) perVisitor.delete(k)
    return true
  }
  v.n++
  return v.n <= limit
}

// ── Calls ──────────────────────────────────────────────────────────────────

const quoteCache = new Map<string, { at: number; value: Record<string, unknown> }>()

function pick(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k]
  return out
}

/** Keeps only the fields the app uses, and refuses a transaction that points anywhere but AchSwap's executor. */
export function cleanAchResponse(action: 'quote' | 'swap', raw: Record<string, unknown>): Record<string, unknown> {
  const out = pick(raw, ['chainId', 'tokenIn', 'tokenOut', 'amountIn', 'amountOut', 'minAmountOut', 'slippageBps', 'grossAmountOut', 'fees', 'priceImpactBps', 'gasEstimate', 'route', 'requestId'])
  if (action === 'swap') {
    const tx = (raw.tx ?? {}) as Record<string, unknown>
    const approval = raw.approval as Record<string, unknown> | null | undefined
    if (typeof tx.to !== 'string' || tx.to.toLowerCase() !== ACHSWAP_EXECUTOR.toLowerCase() || typeof tx.data !== 'string' || !/^0x[0-9a-fA-F]+$/.test(tx.data)) {
      throw new AchError(502, 'BAD_TRANSACTION', 'AchSwap returned an unexpected transaction. Swap cancelled for your safety.')
    }
    if (approval && (typeof approval.spender !== 'string' || approval.spender.toLowerCase() !== ACHSWAP_EXECUTOR.toLowerCase())) {
      throw new AchError(502, 'BAD_TRANSACTION', 'AchSwap returned an unexpected approval. Swap cancelled for your safety.')
    }
    Object.assign(out, { sender: raw.sender, recipient: raw.recipient, deadline: raw.deadline, simulated: raw.simulated, tx: pick(tx, ['to', 'data', 'value', 'gas']), approval: approval ? pick(approval, ['token', 'spender', 'amount']) : null })
  }
  return out
}

export async function callAchswap(req: AchRequest, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const key = achswapKey()
  if (!key) throw new AchError(503, 'NOT_CONFIGURED', 'AchSwap is not set up on this server.')

  const cacheKey = req.action === 'quote' ? `${req.tokenIn.toLowerCase()}|${req.tokenOut.toLowerCase()}|${req.amountIn}|${req.slippageBps}` : ''
  if (cacheKey) {
    const hit = quoteCache.get(cacheKey)
    if (hit && Date.now() - hit.at < QUOTE_CACHE_MS) return hit.value
  }

  spendBudget()
  const release = await slot()
  try {
    const body: Record<string, unknown> = { tokenIn: req.tokenIn, tokenOut: req.tokenOut, amountIn: req.amountIn, slippageBps: req.slippageBps, chainId: ARC_CHAIN_ID }
    if (req.action === 'swap') body.sender = req.sender
    const res = await fetchImpl(`${base()}/${req.action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (!res.ok) {
      const e = (json.error ?? {}) as { code?: string; message?: string; reason?: string }
      const retry = Number(res.headers.get('retry-after')) || undefined
      // A bad or revoked key is the site owner's problem, not the visitor's: say so plainly and without detail.
      if (res.status === 401) throw new AchError(503, 'NOT_CONFIGURED', 'AchSwap is not available right now.')
      const reason = e.reason ? ` (${e.reason})` : ''
      throw new AchError(res.status, e.code ?? 'ERROR', `${e.message ?? 'AchSwap could not price this swap.'}${reason}`, retry)
    }
    const clean = cleanAchResponse(req.action, json)
    if (cacheKey) {
      quoteCache.set(cacheKey, { at: Date.now(), value: clean })
      if (quoteCache.size > 500) for (const [k, v] of quoteCache) if (Date.now() - v.at > QUOTE_CACHE_MS) quoteCache.delete(k)
    }
    return clean
  } catch (e) {
    if (e instanceof AchError) throw e
    if (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new AchError(504, 'TIMEOUT', 'AchSwap took too long to answer.')
    throw new AchError(502, 'UNAVAILABLE', 'AchSwap could not be reached.')
  } finally {
    release()
  }
}

/** Test helper: clears limits and the cache. */
export function resetAchswapState(): void {
  minuteStart = 0; usedThisMinute = 0; inFlight = 0; waiters.length = 0; quoteCache.clear(); perVisitor.clear()
}
