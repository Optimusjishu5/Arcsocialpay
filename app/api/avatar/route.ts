import { isAddress } from 'viem'
import { getAvatarDataUrl, isTursoConfigured } from '@/lib/turso'

const DATA_URL = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

/** A profile picture as a normal image. The link carries a version, so browsers keep it for a year. */
export async function GET(req: Request) {
  if (!isTursoConfigured()) return new Response(null, { status: 404 })
  const a = new URL(req.url).searchParams.get('a') ?? ''
  if (!isAddress(a)) return new Response(null, { status: 400 })
  try {
    const m = (await getAvatarDataUrl(a)).match(DATA_URL)
    if (!m) return new Response(null, { status: 404, headers: { 'cache-control': 'public, max-age=60' } })
    return new Response(Buffer.from(m[2], 'base64'), {
      headers: {
        'content-type': m[1],
        'cache-control': 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
      },
    })
  } catch {
    return new Response(null, { status: 500 })
  }
}
