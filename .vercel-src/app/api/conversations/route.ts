import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureChatSchema,
  listConversationsForAddress,
  upsertConversation,
  markConversationRead,
} from '@/lib/turso'

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, conversations: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent chat.' },
      { status: 200 },
    )
  }
  try {
    await ensureChatSchema()
    const url = new URL(req.url)
    const address = (url.searchParams.get('address') ?? '').trim()
    if (!address) {
      return NextResponse.json({ error: 'address query param required' }, { status: 400 })
    }
    const conversations = await listConversationsForAddress(address)
    return NextResponse.json({ configured: true, conversations })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list conversations' },
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
      id: string
      participants: string[]
      createdAt?: number
      isGroup?: boolean
      groupId?: string
      lastMessage?: Record<string, unknown> | null
      unreadCount?: number
    }
    if (!body?.id || !Array.isArray(body.participants)) {
      return NextResponse.json({ error: 'id and participants[] required' }, { status: 400 })
    }
    await upsertConversation({
      id: body.id,
      participants: body.participants,
      createdAt: body.createdAt ?? Date.now(),
      isGroup: !!body.isGroup,
      groupId: body.groupId,
      lastMessage: body.lastMessage ?? null,
      unreadCount: body.unreadCount ?? 0,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save conversation' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }
  try {
    const body = (await req.json()) as { conversationId?: string }
    if (!body?.conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }
    await markConversationRead(body.conversationId)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to mark read' },
      { status: 500 },
    )
  }
}
