import { NextResponse } from 'next/server'
import { AchError, achswapConfigured, callAchswap, parseAchRequest, visitorAllowed } from '@/lib/achswap'

const noStore = { 'cache-control': 'no-store' }

/** Tells the app whether AchSwap prices are available here, so it only shows the route when it works. */
export function GET() {
  return NextResponse.json({ configured: achswapConfigured() }, { headers: noStore })
}

/** Quote or build a swap through AchSwap. The API key stays on the server. */
export async function POST(req: Request) {
  try {
    const parsed = parseAchRequest(await req.json().catch(() => null))
    const visitor = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'
    if (!visitorAllowed(visitor)) throw new AchError(429, 'RATE_LIMITED', 'Too many price requests. Wait a moment and try again.', 10)
    return NextResponse.json(await callAchswap(parsed), { headers: noStore })
  } catch (e) {
    if (e instanceof AchError) {
      return NextResponse.json({ error: { code: e.code, message: e.message } }, { status: e.status, headers: { ...noStore, ...(e.retryAfter ? { 'retry-after': String(e.retryAfter) } : {}) } })
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } }, { status: 500, headers: noStore })
  }
}
