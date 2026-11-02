// Wallet history from the Arc explorer index, called from the server so the explorer key
// stays private. The browser asks this route; it never sees the key.
//
//   BLOCKSCOUT_API_KEY   optional. With it, the Blockscout Pro API is used (reliable, no bot check).
//                        Without it, the explorer's own API is tried, which may refuse servers.

import { memoAsync, rateLimit, tooManyRequests } from '@/server/guard'

/** Calls Blockscout with calls spaced apart, a short wait-and-retry on its rate limit, and identical requests shared. */
interface Upstream { status: number; ok: boolean; headers: Headers; body: string }
let nextSlot = 0
const SPACING_MS = 120
const shared = memoAsync<Upstream>(2_000)
function upstream(target: string, key: string | undefined): Promise<Upstream> {
  return shared(`${key ? 'k' : 'p'}|${target}`, async () => {
    for (let attempt = 0; ; attempt++) {
      const wait = Math.max(0, nextSlot - Date.now())
      nextSlot = Math.max(nextSlot, Date.now()) + SPACING_MS
      if (wait) await new Promise((r) => setTimeout(r, wait))
      const res = await fetch(target, {
        headers: key ? { authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      })
      if (res.status === 429 && attempt < 3) {
        const asked = Number(res.headers.get('retry-after'))
        await new Promise((r) => setTimeout(r, Math.min(4_000, (Number.isFinite(asked) && asked > 0 ? asked : 0.6 * (attempt + 1)) * 1_000)))
        continue
      }
      const out: Upstream = { status: res.status, ok: res.ok, headers: res.headers, body: await res.text() }
      // Only good answers are kept for the next caller; failures are never shared.
      if (!out.ok || !(out.headers.get('content-type') ?? '').includes('json')) throw Object.assign(new Error('upstream'), { out })
      return out
    }
  }).catch((e: unknown) => {
    const out = (e as { out?: Upstream }).out
    if (out) return out
    throw e
  })
}

const PRO = 'https://api.blockscout.com/5042/api/v2'
const PUBLIC = 'https://explorer.arc.io/api/v2'
const FEEDS = new Set(['transactions', 'token-transfers', 'internal-transactions'])
// Only the paging fields the explorer itself returns are passed along.
const PAGE_KEYS = new Set([
  'block_number', 'index', 'items_count', 'transaction_index', 'log_index', 'batch_log_index',
  'batch_block_hash', 'batch_transaction_hash', 'index_in_batch', 'transaction_hash',
  'token_contract_address_hash', 'token_id', 'fee', 'value', 'hash', 'inserted_at',
])

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const feed = url.searchParams.get('feed') ?? ''
  const address = url.searchParams.get('address') ?? ''
  if (!FEEDS.has(feed) || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
  const limited = rateLimit(req, 'explorer', 180)
  if (!limited.ok) return tooManyRequests(limited.retryAfter)
  const qs = new URLSearchParams()
  for (const [k, v] of url.searchParams) {
    if (PAGE_KEYS.has(k) && v.length < 100) qs.set(k, v)
  }
  const key = process.env.BLOCKSCOUT_API_KEY?.trim()
  const target = `${key ? PRO : PUBLIC}/addresses/${address}/${feed}?${qs}`
  try {
    const res = await upstream(target, key)
    const type = res.headers.get('content-type') ?? ''
    if (!key && (res.status === 403 || (res.ok && !type.includes('json')))) {
      // explorer.arc.io puts a bot check in front of its API, which refuses servers. A key for the Blockscout API gets through it.
      return Response.json({ error: 'Arc Explorer needs BLOCKSCOUT_API_KEY on this server', code: 'not_configured' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    if (key && (res.status === 401 || res.status === 402 || res.status === 403)) {
      return Response.json({ error: 'Blockscout rejected BLOCKSCOUT_API_KEY', code: 'not_configured' }, { status: 503, headers: { 'cache-control': 'no-store' } })
    }
    if (!res.ok || !type.includes('json')) {
      const retryAfter = Number(res.headers.get('retry-after')) || undefined
      return Response.json(
        { error: `Explorer answered ${res.status}`, keyed: !!key, code: res.status === 429 ? 'rate_limited' : 'upstream', retryAfter },
        { status: res.status === 429 ? 429 : 502, headers: retryAfter ? { 'retry-after': String(retryAfter) } : undefined },
      )
    }
    return new Response(res.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Explorer unreachable' }, { status: 502 })
  }
}
