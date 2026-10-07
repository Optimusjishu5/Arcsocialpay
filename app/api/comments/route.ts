import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureSocialSchema,
  listComments,
  upsertComment,
} from '@/lib/turso'

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, comments: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent comments.' },
      { status: 200 },
    )
  }
  try {
    await ensureSocialSchema()
    const url = new URL(req.url)
    const postId = (url.searchParams.get('postId') ?? '').trim() || undefined
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 500, 1), 1000)
    const comments = await listComments(limit, postId)
    return NextResponse.json({ configured: true, comments })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list comments' },
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
      id?: string
      postId: string
      authorAddress: string
      content: string
      createdAt?: number
    }
    if (!body?.postId || !body?.authorAddress || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'postId, authorAddress and content required' }, { status: 400 })
    }
    const id =
      body.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await upsertComment({
      id,
      postId: body.postId,
      authorAddress: body.authorAddress,
      content: body.content,
      createdAt: body.createdAt ?? Date.now(),
    })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save comment' },
      { status: 500 },
    )
  }
}
