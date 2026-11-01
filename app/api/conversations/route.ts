import { NextResponse } from 'next/server'
import { isAddress } from 'viem'
import {
  isTursoConfigured,
  ensureChatSchema,
  listConversationsForAddress,
  upsertConversation,
  markConversationRead,
} from '@/lib/turso'
import { requireSession } from '@/lib/session'

// Every handler works for the wallet that signed in, taken from the session token. An address or
// conversation id in the request can only narrow what that wallet already has access to.

const ID = /^[A-Za-z0-9_-]{8,64}$/
const unauthorized = () => NextResponse.json({ error: 'Sign in with your wallet to use chat' }, { status: 401, headers: { 'cache-control': 'no-store' } })

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, conversations: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent chat.' },
      { status: 200 },
    )
  }
  const me = requireSession(req)
  if (!me) return unauthorized()
  // A request that names a different wallet is refused instead of quietly answered with the caller's own data.
  const asked = (new URL(req.url).searchParams.get('address') ?? '').trim().toLowerCase()
  if (asked && asked !== me) return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
  try {
    await ensureChatSchema()
    const conversations = await listConversationsForAddress(me)
    return NextResponse.json({ configured: true, conversations }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Failed to list conversations' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false, error: 'Turso not configured' }, { status: 503 })
  }
  const me = requireSession(req)
  if (!me) return unauthorized()
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
    if (
      !body || typeof body.id !== 'string' || !ID.test(body.id) ||
      !Array.isArray(body.participants) || body.participants.length === 0 || body.participants.length > 256 ||
      !body.participants.every((p) => typeof p === 'string' && isAddress(p))
    ) {
      return NextResponse.json({ error: 'A valid id and participants[] are required' }, { status: 400 })
    }
    await ensureChatSchema()
    const result = await upsertConversation(
      {
        id: body.id,
        participants: body.participants,
        createdAt: typeof body.createdAt === 'number' ? body.createdAt : Date.now(),
        isGroup: !!body.isGroup,
        groupId: typeof body.groupId === 'string' ? body.groupId.slice(0, 64) : undefined,
        lastMessage: body.lastMessage ?? null,
        unreadCount: typeof body.unreadCount === 'number' ? body.unreadCount : 0,
      },
      me,
    )
    if (result === 'forbidden') return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }
  const me = requireSession(req)
  if (!me) return unauthorized()
  try {
    const body = (await req.json()) as { conversationId?: string }
    if (!body?.conversationId || typeof body.conversationId !== 'string') {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
    }
    const ok = await markConversationRead(body.conversationId, me)
    // Same answer whether the conversation does not exist or belongs to someone else.
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to mark read' }, { status: 500 })
  }
}
