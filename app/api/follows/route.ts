import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { followStats, isTursoConfigured, listFollowers, listFollowing, setFollow } from '@/lib/turso'
import { requireSession } from '@/lib/session'

const noStore = { 'cache-control': 'no-store' }
const unauthorized = () => NextResponse.json({ error: 'Sign in with your wallet first' }, { status: 401, headers: noStore })

/**
 * Without a query: who follows you and whom you follow (your own lists).
 * With ?address=0x...: that wallet's follower and following counts, and whether you follow it.
 * Add &list=followers or &list=following for the people behind those counts. Follows are public, like a profile.
 */
export async function GET(req: Request) {
  if (!isTursoConfigured()) return NextResponse.json({ configured: false, followers: [] })
  const me = requireSession(req)
  if (!me) return unauthorized()
  try {
    const url = new URL(req.url)
    const target = (url.searchParams.get('address') ?? '').trim()
    if (!target) {
      const [followers, following] = await Promise.all([listFollowers(me), listFollowing(me)])
      return NextResponse.json({ configured: true, followers, following }, { headers: noStore })
    }
    if (!isAddress(target)) return NextResponse.json({ error: 'A valid address is required' }, { status: 400 })
    const stats = await followStats(target, me)
    const list = url.searchParams.get('list')
    let people: string[] | undefined
    if (list === 'followers') people = (await listFollowers(target)).map((f) => f.address)
    else if (list === 'following') people = await listFollowing(target)
    return NextResponse.json({ configured: true, ...stats, ...(people ? { people: people.slice(0, 200) } : {}) }, { headers: noStore })
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
