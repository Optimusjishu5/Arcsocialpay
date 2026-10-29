import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureSocialSchema,
  listProfiles,
  upsertProfile,
} from '@/lib/turso'

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, profiles: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent profiles.' },
      { status: 200 },
    )
  }
  try {
    await ensureSocialSchema()
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 500, 1), 1000)
    const profiles = await listProfiles(limit)
    return NextResponse.json({ configured: true, profiles })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list profiles' },
      { status: 500 },
    )
  }
}

export async function POST(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false, error: 'Turso not configured' }, { status: 503 })
  }
  try {
    const body = (await req.json()) as {
      address: string
      username?: string
      bio?: string
      avatarSeed?: string
      followerCount?: number
      followingCount?: number
      createdAt?: number
    }
    if (!body?.address) {
      return NextResponse.json({ error: 'address required' }, { status: 400 })
    }
    await upsertProfile({
      address: body.address,
      username: body.username ?? '',
      bio: body.bio ?? '',
      avatarSeed: body.avatarSeed ?? '',
      followerCount: body.followerCount ?? 0,
      followingCount: body.followingCount ?? 0,
      createdAt: body.createdAt ?? Date.now(),
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save profile' },
      { status: 500 },
    )
  }
}
