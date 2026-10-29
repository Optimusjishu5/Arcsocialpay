import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import { isTursoConfigured, ensureSocialSchema, isUsernameTaken, updateProfileIdentity } from '@/lib/turso'
import {
  AVATAR_DATA_URL_MAX,
  AVATAR_DATA_URL_PATTERN,
  BIO_MAX,
  PROFILE_ACCENTS,
  USERNAME_PATTERN,
  verifyProfileSignature,
} from '@/lib/chatAuth'

const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000

interface Body {
  address?: string
  username?: string
  bio?: string
  avatarUrl?: string
  accent?: string
  updatedAt?: number
  signature?: string
}

/** Signed profile edit. The wallet must sign the exact name, bio, picture and color being saved. */
export async function POST(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false, error: 'Profile storage is not configured' }, { status: 503 })
  }
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { address, username = '', bio = '', avatarUrl = '', accent = '', updatedAt, signature } = body
  if (!address || !isAddress(address)) return NextResponse.json({ error: 'Valid address required' }, { status: 400 })
  if (!USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: 'Username must be 3-20 letters, numbers, dots or underscores' }, { status: 400 })
  }
  if (bio.length > BIO_MAX) return NextResponse.json({ error: `Bio is limited to ${BIO_MAX} characters` }, { status: 400 })
  if (avatarUrl && (avatarUrl.length > AVATAR_DATA_URL_MAX || !AVATAR_DATA_URL_PATTERN.test(avatarUrl))) {
    return NextResponse.json({ error: 'Profile picture must be a small JPEG, PNG or WebP image' }, { status: 400 })
  }
  if (accent && !(PROFILE_ACCENTS as readonly string[]).includes(accent)) {
    return NextResponse.json({ error: 'Unknown profile color' }, { status: 400 })
  }
  if (typeof updatedAt !== 'number' || Math.abs(Date.now() - updatedAt) > MAX_CLOCK_SKEW_MS) {
    return NextResponse.json({ error: 'Signature expired. Please try again.' }, { status: 400 })
  }
  if (!signature || !/^0x[0-9a-fA-F]+$/.test(signature)) {
    return NextResponse.json({ error: 'Signature required' }, { status: 401 })
  }
  const ok = await verifyProfileSignature(
    { address, username, bio, avatarUrl, accent, updatedAt },
    signature as `0x${string}`,
  )
  if (!ok) return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })

  try {
    await ensureSocialSchema()
    const key = address.toLowerCase()
    if (await isUsernameTaken(username, key)) {
      return NextResponse.json({ error: 'That username is already taken' }, { status: 409 })
    }
    await updateProfileIdentity({ address: key, username, bio, avatarUrl, accent })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed to save profile' }, { status: 500 })
  }
}
