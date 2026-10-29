import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureSocialSchema,
  listPosts,
  upsertPost,
  deletePostById,
} from '@/lib/turso'

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, posts: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent feed.' },
      { status: 200 },
    )
  }
  try {
    await ensureSocialSchema()
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 500)
    const posts = await listPosts(limit)
    return NextResponse.json({ configured: true, posts })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list posts' },
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
      authorAddress: string
      content: string
      createdAt?: number
      editedAt?: number
      likeCount?: number
      commentCount?: number
      repostCount?: number
      repostOf?: string
      likes?: string[]
      reposts?: string[]
    }
    if (!body?.authorAddress || typeof body.content !== 'string') {
      return NextResponse.json({ error: 'authorAddress and content required' }, { status: 400 })
    }
    const id =
      body.id ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await upsertPost({
      id,
      authorAddress: body.authorAddress,
      content: body.content,
      createdAt: body.createdAt ?? Date.now(),
      editedAt: body.editedAt,
      likeCount: body.likeCount ?? 0,
      commentCount: body.commentCount ?? 0,
      repostCount: body.repostCount ?? 0,
      repostOf: body.repostOf,
      likes: body.likes ?? [],
      reposts: body.reposts ?? [],
    })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save post' },
      { status: 500 },
    )
  }
}

export async function DELETE(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }
  try {
    const url = new URL(req.url)
    const id = (url.searchParams.get('id') ?? '').trim()
    if (!id) {
      return NextResponse.json({ error: 'id query param required' }, { status: 400 })
    }
    await deletePostById(id)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to delete post' },
      { status: 500 },
    )
  }
}
