// Wallet history from the Arc explorer index, called from the server so the explorer key
// stays private. The browser asks this route; it never sees the key.
//
//   BLOCKSCOUT_API_KEY   optional. With it, the Blockscout Pro API is used (reliable, no bot check).
//                        Without it, the explorer's own API is tried, which may refuse servers.

const PRO = 'https://api.blockscout.com/5042/api/v2'
const PUBLIC = 'https://explorer.arc.io/api/v2'
const FEEDS = new Set(['transactions', 'token-transfers', 'internal-transactions'])
// Only the paging fields the explorer itself returns are passed along.
const PAGE_KEYS = new Set([
  'block_number', 'index', 'items_count', 'transaction_index', 'log_index', 'batch_log_index',
  'batch_block_hash', 'batch_transaction_hash', 'index_in_batch', 'transaction_hash',
  'token_contract_address_hash', 'token_id', 'fee', 'value', 'hash', 'inserted_at',
])

export async function GET(req: Request) {
  const url = new URL(req.url)
  const feed = url.searchParams.get('feed') ?? ''
  const address = url.searchParams.get('address') ?? ''
  if (!FEEDS.has(feed) || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return Response.json({ error: 'Bad request' }, { status: 400 })
  }
  const qs = new URLSearchParams()
  for (const [k, v] of url.searchParams) {
    if (PAGE_KEYS.has(k) && v.length < 100) qs.set(k, v)
  }
  const key = process.env.BLOCKSCOUT_API_KEY?.trim()
  const target = `${key ? PRO : PUBLIC}/addresses/${address}/${feed}?${qs}`
  try {
    const res = await fetch(target, {
      headers: key ? { authorization: `Bearer ${key}`, accept: 'application/json' } : { accept: 'application/json' },
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    })
    const type = res.headers.get('content-type') ?? ''
    if (!res.ok || !type.includes('json')) {
      return Response.json({ error: `Explorer answered ${res.status}`, keyed: !!key }, { status: res.status === 429 ? 429 : 502 })
    }
    return new Response(await res.text(), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
  } catch {
    return Response.json({ error: 'Explorer unreachable' }, { status: 502 })
  }
}
