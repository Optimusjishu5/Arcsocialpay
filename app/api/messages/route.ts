import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureChatSchema,
  listMessages,
  insertMessage,
  updatePaymentStatus,
} from '@/lib/turso'

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, messages: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent chat.' },
      { status: 200 },
    )
  }
  try {
    await ensureChatSchema()
    const url = new URL(req.url)
    const conversationId = (url.searchParams.get('conversationId') ?? '').trim()
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId query param required' }, { status: 400 })
    }
    const messages = await listMessages(conversationId)
    return NextResponse.json({ configured: true, messages })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list messages' },
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
      conversationId: string
      senderAddress: string
      content: string
      createdAt?: number
      status?: string
      replyToId?: string
      paymentTx?: Record<string, unknown> | null
    }
    if (!body?.conversationId || !body?.senderAddress) {
      return NextResponse.json({ error: 'conversationId and senderAddress required' }, { status: 400 })
    }
    const id =
      body.id ??
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    await insertMessage({
      id,
      conversationId: body.conversationId,
      senderAddress: body.senderAddress,
      content: body.content ?? '',
      createdAt: body.createdAt ?? Date.now(),
      status: body.status ?? 'sent',
      replyToId: body.replyToId,
      paymentTx: body.paymentTx ?? null,
    })
    return NextResponse.json({ ok: true, id })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save message' },
      { status: 500 },
    )
  }
}

export async function PATCH(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }
  try {
    const body = (await req.json()) as { txHash?: string; status?: string }
    if (!body?.txHash || !body?.status) {
      return NextResponse.json({ error: 'txHash and status required' }, { status: 400 })
    }
    await updatePaymentStatus(body.txHash, body.status)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to update payment status' },
      { status: 500 },
    )
  }
}
