import { NextResponse } from 'next/server'
import { createPublicClient, http, isAddress } from 'viem'
import {
  isTursoConfigured,
  ensureChatSchema,
  getConversation,
  listMessages,
  insertMessage,
  updatePaymentStatus,
} from '@/lib/turso'
import { verifyChatSignature } from '@/lib/chatAuth'
import { ARC_RPC_URL } from '@/chains'

const MAX_CONTENT_CHARS = 4000

/** A payment card is trusted when its transaction was really sent by the claimed sender. */
async function paymentSentBy(txHash: string, sender: string): Promise<boolean> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) return false
  try {
    const client = createPublicClient({ transport: http(ARC_RPC_URL) })
    const tx = await client.getTransaction({ hash: txHash as `0x${string}` })
    return tx.from.toLowerCase() === sender.toLowerCase()
  } catch {
    return false
  }
}

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
      signature?: string
    }
    if (!body?.id || !body?.conversationId || !body?.senderAddress || !isAddress(body.senderAddress)) {
      return NextResponse.json({ error: 'id, conversationId and a valid senderAddress are required' }, { status: 400 })
    }
    const content = body.content ?? ''
    if (content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json({ error: 'Message too long' }, { status: 413 })
    }
    await ensureChatSchema()
    const conv = await getConversation(body.conversationId)
    if (!conv) {
      return NextResponse.json({ error: 'Unknown conversation' }, { status: 404 })
    }
    // Direct chats: only the two participants may post. (Group membership lives in the client store.)
    if (!conv.isGroup && !conv.participants.some((p) => p.toLowerCase() === body.senderAddress.toLowerCase())) {
      return NextResponse.json({ error: 'Sender is not in this conversation' }, { status: 403 })
    }
    const txHash = typeof body.paymentTx?.txHash === 'string' ? body.paymentTx.txHash : ''
    const createdAt = body.createdAt ?? Date.now()
    let authentic = false
    if (body.signature && /^0x[0-9a-fA-F]+$/.test(body.signature)) {
      authentic = await verifyChatSignature(
        {
          id: body.id, conversationId: body.conversationId, sender: body.senderAddress,
          content, createdAt, replyToId: body.replyToId, paymentTxHash: txHash || undefined,
        },
        body.signature as `0x${string}`,
      )
    }
    // Payment cards without a signature are accepted only when the transaction itself came from the sender.
    if (!authentic && txHash) authentic = await paymentSentBy(txHash, body.senderAddress)
    if (!authentic) {
      return NextResponse.json({ error: 'Message signature is missing or invalid' }, { status: 401 })
    }
    await insertMessage({
      id: body.id,
      conversationId: body.conversationId,
      senderAddress: body.senderAddress,
      content,
      createdAt,
      status: body.status ?? 'sent',
      replyToId: body.replyToId,
      paymentTx: body.paymentTx ?? null,
      signature: body.signature,
    })
    return NextResponse.json({ ok: true, id: body.id })
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
