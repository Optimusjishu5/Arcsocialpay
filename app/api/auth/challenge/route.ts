import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { isTursoConfigured } from '@/lib/turso'
import { makeChallenge } from '@/lib/session'

/** Step 1 of wallet sign-in: a short-lived challenge for the wallet to sign. */
export async function POST(req: Request) {
  if (!isTursoConfigured()) return NextResponse.json({ configured: false }, { status: 503 })
  let address = ''
  try {
    address = String(((await req.json()) as { address?: unknown })?.address ?? '').trim()
  } catch {
    /* handled below */
  }
  if (!isAddress(address)) return NextResponse.json({ error: 'A valid address is required' }, { status: 400 })
  const challenge = makeChallenge(address)
  if (!challenge) return NextResponse.json({ error: 'Sign-in is not available on this server' }, { status: 503 })
  return NextResponse.json({ challenge }, { headers: { 'cache-control': 'no-store' } })
}
