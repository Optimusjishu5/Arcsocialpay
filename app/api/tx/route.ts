// Checks one transaction against the Arc node: does it exist, did it succeed, which block, and
// which SocialPay events its receipt holds (decoded with the contract's ABI). Only a hash that
// the node knows gets explorer links in the app.
//
//   GET /api/tx?hash=0x...

import { txLinks, isTxHash } from '@/lib/arcExplorers'
import { rateLimit, tooManyRequests } from '@/server/guard'
import { verifyTransaction } from '@/server/arcRpc'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const hash = new URL(req.url).searchParams.get('hash') ?? ''
  if (!isTxHash(hash)) return Response.json({ error: 'Not a transaction hash' }, { status: 400 })
  const limited = rateLimit(req, 'tx', 180)
  if (!limited.ok) return tooManyRequests(limited.retryAfter)
  try {
    const result = await verifyTransaction(hash)
    return Response.json(
      { ...result, links: result.found && result.verified ? txLinks(result.hash) : [] },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch {
    return Response.json({ error: 'The Arc node could not be reached', code: 'rpc' }, { status: 502, headers: { 'cache-control': 'no-store' } })
  }
}
