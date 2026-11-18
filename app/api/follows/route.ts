import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { isTursoConfigured, listFollowers, setFollow } from '@/lib/turso'
import { requireSession } from '@/lib/session'

const noStore = { 'cache-control': 'no-store' }
const unauthorized = () => NextResponse.json({ error: 'Sign in with your wallet first' }, { status: 401, headers: noStore })

/** Who follows the signed-in wallet. Only your own followers are ever returned. */
export async function GET(req: Request) {
  if (!isTursoConfigured()) return NextResponse.json({ configured: false, followers: [] })
  const me = requireSession(req)
  if (!me) return unauthorized()
  try {
    return NextResponse.json({ configured: true, followers: await listFollowers(me) }, { headers: noStore })
  } catch {
    return NextResponse.json({ error: 'Failed to load followers' }, { status: 500 })
  }
}

/** The signed-in wallet follows or unfollows someone. The follower is always the signed-in wallet. */
export async function POST(req: Request) {
  if (!isTursoConfigured()) return NextResponse.json({ configured: false }, { status: 503 })
  const me = requireSession(req)
  if (!me) return unauthorized()
  try {
    const body = (await req.json()) as { target?: string; follow?: boolean }
    if (!body?.target || !isAddress(body.target) || typeof body.follow !== 'boolean') {
      return NextResponse.json({ error: 'A valid target address and follow true/false are required' }, { status: 400 })
    }
    if (body.target.toLowerCase() === me) return NextResponse.json({ error: 'You cannot follow yourself' }, { status: 400 })
    await setFollow(me, body.target, body.follow)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
