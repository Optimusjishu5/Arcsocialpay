// Arc Explorer history for the Vercel deployment: the same job as app/api/explorer in the full app,
// as a Vercel serverless function so the Blockscout key stays on the server.
//
// Set BLOCKSCOUT_API_KEY in the Vercel project (Settings > Environment Variables), then redeploy.
// Without it the function answers 503 { code: 'not_configured' } and the app reads the Arc nodes instead.
//
//   GET /api/explorer?feed=transactions|token-transfers|internal-transactions&address=0x...&<paging fields>

const PRO = 'https://api.blockscout.com/5042/api/v2'
const FEEDS = new Set(['transactions', 'token-transfers', 'internal-transactions'])
// Only the paging fields the explorer itself returns are passed along.
const PAGE_KEYS = new Set([
  'block_number', 'index', 'items_count', 'transaction_index', 'log_index', 'batch_log_index',
  'batch_block_hash', 'batch_transaction_hash', 'index_in_batch', 'transaction_hash',
  'token_contract_address_hash', 'token_id', 'fee', 'value', 'hash', 'inserted_at',
])

const SPACING_MS = 120
const SHARE_MS = 2000
let nextSlot = 0
const done = new Map() // url -> { at, body }
const flying = new Map() // url -> Promise

// A small per-visitor limit so a script cannot drain the key (per warm instance).
const hits = new Map()
function limited(ip) {
  const now = Date.now()
  const h = hits.get(ip)
  if (!h || now > h.reset) {
    if (hits.size > 5000) hits.clear()
    hits.set(ip, { n: 1, reset: now + 60000 })
    return 0
  }
  h.n++
  return h.n > 240 ? Math.ceil((h.reset - now) / 1000) : 0
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function ask(target, key) {
  for (let attempt = 0; ; attempt++) {
    const wait = Math.max(0, nextSlot - Date.now())
    nextSlot = Math.max(nextSlot, Date.now()) + SPACING_MS
    if (wait) await sleep(wait)
    const res = await fetch(target, {
      headers: { authorization: 'Bearer ' + key, accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    })
    if (res.status === 429 && attempt < 3) {
      const asked = Number(res.headers.get('retry-after'))
      await sleep(Math.min(4000, (Number.isFinite(asked) && asked > 0 ? asked : 0.6 * (attempt + 1)) * 1000))
      continue
    }
    return { status: res.status, type: res.headers.get('content-type') || '', retryAfter: Number(res.headers.get('retry-after')) || undefined, text: await res.text() }
  }
}

function shared(target, key) {
  const hit = done.get(target)
  if (hit && Date.now() - hit.at < SHARE_MS) return Promise.resolve(hit.out)
  if (flying.has(target)) return flying.get(target)
  const p = ask(target, key)
    .then((out) => {
      if (out.status === 200 && out.type.includes('json')) {
        if (done.size > 500) done.clear()
        done.set(target, { at: Date.now(), out })
      }
      return out
    })
    .finally(() => { flying.delete(target) })
  flying.set(target, p)
  return p
}

module.exports = async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  const q = req.query || {}
  const feed = String(q.feed || '')
  const address = String(q.address || '')
  if (!FEEDS.has(feed) || !/^0x[0-9a-fA-F]{40}$/.test(address)) return res.status(400).json({ error: 'Bad request' })

  const key = String(process.env.BLOCKSCOUT_API_KEY || '').trim()
  if (!key) return res.status(503).json({ error: 'Arc Explorer needs BLOCKSCOUT_API_KEY on this server', code: 'not_configured' })

  const ip = String((req.headers && req.headers['x-forwarded-for']) || 'unknown').split(',')[0].trim()
  const wait = limited(ip)
  if (wait) {
    res.setHeader('retry-after', String(wait))
    return res.status(429).json({ error: 'Too many requests', code: 'rate_limited', retryAfter: wait })
  }

  const qs = new URLSearchParams()
  for (const k of Object.keys(q)) {
    const v = Array.isArray(q[k]) ? q[k][0] : q[k]
    if (PAGE_KEYS.has(k) && String(v).length < 100) qs.set(k, String(v))
  }
  const target = PRO + '/addresses/' + address + '/' + feed + '?' + qs

  try {
    const out = await shared(target, key)
    if (out.status === 401 || out.status === 402 || out.status === 403) {
      return res.status(503).json({ error: 'Blockscout rejected BLOCKSCOUT_API_KEY', code: 'not_configured' })
    }
    if (out.status !== 200 || !out.type.includes('json')) {
      if (out.retryAfter) res.setHeader('retry-after', String(out.retryAfter))
      return res.status(out.status === 429 ? 429 : 502).json({
        error: 'Explorer answered ' + out.status,
        code: out.status === 429 ? 'rate_limited' : 'upstream',
        retryAfter: out.retryAfter,
      })
    }
    res.setHeader('content-type', 'application/json')
    return res.status(200).send(out.text)
  } catch (e) {
    return res.status(502).json({ error: 'Explorer unreachable' })
  }
}
