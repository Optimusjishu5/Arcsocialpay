// Token and network lists for the swap and bridge screens, fetched on the server
// and cached for a few minutes. The browser asks this app instead of third-party
// sites, so the lists load even when a browser, extension or network blocks them.
// Only the fixed sources below can be requested.

const SOURCES = {
  'lifi-tokens': 'https://li.quest/v1/tokens?chains=5042',
  'kyber-tokens': 'https://ks-setting.kyberswap.com/api/v1/tokens?chainIds=5042&page=1&pageSize=100&isWhitelisted=true',
  'lifi-chains': 'https://li.quest/v1/chains?chainTypes=EVM',
} as const

type SourceId = keyof typeof SOURCES

const TTL_MS = 10 * 60 * 1000
const cache = new Map<SourceId, { at: number; body: string }>()

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('src') as SourceId | null
  if (!id || !(id in SOURCES)) return Response.json({ error: 'Unknown source' }, { status: 400 })

  const hit = cache.get(id)
  if (hit && Date.now() - hit.at < TTL_MS) {
    return new Response(hit.body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } })
  }
  try {
    const res = await fetch(SOURCES[id], { signal: AbortSignal.timeout(15_000) })
    if (!res.ok) throw new Error(`Upstream ${res.status}`)
    const body = await res.text()
    JSON.parse(body) // refuse to cache anything that is not JSON
    cache.set(id, { at: Date.now(), body })
    return new Response(body, { headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } })
  } catch {
    // Serve a stale copy rather than nothing.
    if (hit) return new Response(hit.body, { headers: { 'content-type': 'application/json' } })
    return Response.json({ error: 'Upstream unavailable' }, { status: 502 })
  }
}
