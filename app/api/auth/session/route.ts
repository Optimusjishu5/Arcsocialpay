import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { isTursoConfigured } from '@/lib/turso'
import { challengeIsValid, mintSession, type Challenge } from '@/lib/session'
import { verifyLoginSignature } from '@/lib/chatAuth'

/** Step 2 of wallet sign-in: checks the signature and returns a session tied to that one address. */
export async function POST(req: Request) {
  if (!isTursoConfigured()) return NextResponse.json({ configured: false }, { status: 503 })
  try {
    const body = (await req.json()) as { challenge?: Challenge; signature?: string }
    const c = body?.challenge
    const sig = body?.signature
    if (!c || typeof c.address !== 'string' || !isAddress(c.address) || typeof sig !== 'string' || !/^0x[0-9a-fA-F]+$/.test(sig)) {
      return NextResponse.json({ error: 'Invalid sign-in request' }, { status: 400 })
    }
    if (!challengeIsValid(c)) return NextResponse.json({ error: 'The sign-in request expired. Try again.' }, { status: 401 })
    const ok = await verifyLoginSignature(
      { address: c.address as `0x${string}`, nonce: c.nonce, issuedAt: c.issuedAt, expiresAt: c.expiresAt },
      sig as `0x${string}`,
    )
    if (!ok) return NextResponse.json({ error: 'That signature does not match this wallet' }, { status: 401 })
    const session = mintSession(c.address)
    if (!session) return NextResponse.json({ error: 'Sign-in is not available on this server' }, { status: 503 })
    return NextResponse.json({ token: session.token, expiresAt: session.expiresAt, address: c.address.toLowerCase() }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Sign-in failed' }, { status: 500 })
  }
}
