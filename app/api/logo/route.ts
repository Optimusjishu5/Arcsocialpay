// Token and network logos, served from this app's own origin. Many logo hosts
// are blocked or slow in some browsers, so the app asks here first. Only https
// images from a short list of logo hosts are fetched, and every response is
// locked down so an image can never run script.

const ALLOWED_SUFFIXES = [
  'githubusercontent.com',
  'googleapis.com',
  'coingecko.com',
  'geckoterminal.com',
  'debank.com',
  'coinmarketcap.com',
  'li.quest',
  'kyberswap.com',
  'llamao.fi',
  'ipfs.io',
]
const MAX_BYTES = 600_000
const MAX_REDIRECTS = 3

function allowed(u: URL): boolean {
  if (u.protocol !== 'https:' || u.port !== '' || u.username || u.password) return false
  return ALLOWED_SUFFIXES.some((s) => u.hostname === s || u.hostname.endsWith(`.${s}`))
}

export async function GET(req: Request) {
  const raw = new URL(req.url).searchParams.get('u')
  let target: URL
  try { target = new URL(raw ?? '') } catch { return new Response('Bad url', { status: 400 }) }
  if (!allowed(target)) return new Response('Host not allowed', { status: 400 })

  try {
    let res: Response | null = null
    // Redirects are followed by hand so each hop is checked against the allow list.
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      res = await fetch(target, { redirect: 'manual', signal: AbortSignal.timeout(10_000), headers: { accept: 'image/*' } })
      const next = res.headers.get('location')
      if (res.status >= 300 && res.status < 400 && next) {
        target = new URL(next, target)
        if (!allowed(target)) return new Response('Redirect not allowed', { status: 400 })
        continue
      }
      break
    }
    if (!res || !res.ok) return new Response('Not found', { status: 404 })
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const byExt = /\.svg(\?|$)/i.test(target.pathname) ? 'image/svg+xml' : ''
    const contentType = type.startsWith('image/') ? type : byExt
    if (!contentType) return new Response('Not an image', { status: 415 })
    const buf = await res.arrayBuffer()
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) return new Response('Bad size', { status: 413 })
    return new Response(buf, {
      headers: {
        'content-type': contentType,
        'cache-control': 'public, max-age=86400, immutable',
        'x-content-type-options': 'nosniff',
        'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      },
    })
  } catch {
    return new Response('Fetch failed', { status: 502 })
  }
}
