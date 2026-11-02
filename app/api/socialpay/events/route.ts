// SocialPay contract events (Tip, Payment, ownership and pause events), decoded with the contract's
// ABI and confirmed against receipts on the Arc node.
//
//   GET /api/socialpay/events?address=0x...&limit=25&before=<block>&since=<block>
//
//   address  optional. Only tips and payments this wallet sent or received.
//   before   continue below this block (the `nextBefore` of the previous page).
//   since    only blocks above this one (live refresh).

import { readSocialPayEvents } from '@/server/socialPayFeed'
import { rateLimit, tooManyRequests } from '@/server/guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const HEADERS = { 'cache-control': 'no-store' }
const int = (v: string | null): number | undefined => (v && /^\d{1,10}$/.test(v) ? Number(v) : undefined)

export async function GET(req: Request) {
  const url = new URL(req.url)
  const address = url.searchParams.get('address')
  if (address && !/^0x[0-9a-fA-F]{40}$/.test(address)) return Response.json({ error: 'Bad address' }, { status: 400, headers: HEADERS })
  const before = int(url.searchParams.get('before'))
  const since = int(url.searchParams.get('since'))
  const limit = Math.min(Math.max(int(url.searchParams.get('limit')) ?? 25, 1), 100)

  const limited = rateLimit(req, 'sp-events', 40)
  if (!limited.ok) return tooManyRequests(limited.retryAfter)

  try {
    const page = await readSocialPayEvents({ before, since, address: address ?? undefined, limit })
    return Response.json(page, { headers: HEADERS })
  } catch {
    return Response.json({ error: 'SocialPay events could not be read right now', code: 'upstream' }, { status: 502, headers: HEADERS })
  }
}
