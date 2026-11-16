// Small in-memory guards for the API routes that spend a paid explorer key or the shared RPC.
// Server only. Counters live per server instance, which is enough to stop one browser (or a loop
// in a script) from draining the key; the explorer's own limits are handled by the history reader.

const hits = new Map<string, { n: number; reset: number }>()

export function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for')
  if (fwd) return fwd.split(',')[0].trim().slice(0, 64)
  return req.headers.get('x-real-ip')?.slice(0, 64) ?? 'local'
}

/** Allows `max` calls per `windowMs` for this caller and bucket. */
export function rateLimit(req: Request, bucket: string, max: number, windowMs = 60_000): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now()
  if (hits.size > 5_000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k)
  const key = `${bucket}|${clientIp(req)}`
  const cur = hits.get(key)
  if (!cur || cur.reset <= now) {
    hits.set(key, { n: 1, reset: now + windowMs })
    return { ok: true }
  }
  cur.n++
  if (cur.n > max) return { ok: false, retryAfter: Math.max(1, Math.ceil((cur.reset - now) / 1000)) }
  return { ok: true }
}

export function tooManyRequests(retryAfter: number): Response {
  return Response.json(
    { error: 'Too many requests. Try again shortly.', code: 'rate_limited', retryAfter },
    { status: 429, headers: { 'retry-after': String(retryAfter), 'cache-control': 'no-store' } },
  )
}

/** Small time-boxed cache that also shares one in-flight call between identical requests. */
export function memoAsync<T>(ttlMs: number, max = 500) {
  const done = new Map<string, { at: number; value: T }>()
  const flying = new Map<string, Promise<T>>()
  return (key: string, run: () => Promise<T>): Promise<T> => {
    const hit = done.get(key)
    if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value)
    const running = flying.get(key)
    if (running) return running
    const p = run()
      .then((value) => {
        if (done.size >= max) done.clear()
        done.set(key, { at: Date.now(), value })
        return value
      })
      .finally(() => { flying.delete(key) })
    flying.set(key, p)
    return p
  }
}
