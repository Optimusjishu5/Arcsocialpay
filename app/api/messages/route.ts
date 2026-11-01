import { NextResponse } from 'next/server'
import { createPublicClient, http, isAddress } from 'viem'
import {
  isTursoConfigured,
  ensureChatSchema,
  getConversationFor,
  listMessages,
  insertMessage,
  updatePaymentStatus,
} from '@/lib/turso'
import { verifyChatSignature } from '@/lib/chatAuth'
import { requireSession } from '@/lib/session'
import { ARC_RPC_URL } from '@/chains'

const MAX_CONTENT_CHARS = 4000
const unauthorized = () => NextResponse.json({ error: 'Sign in with your wallet to use chat' }, { status: 401, headers: { 'cache-control': 'no-store' } })

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
  const me = requireSession(req)
  if (!me) return unauthorized()
  try {
    await ensureChatSchema()
    const url = new URL(req.url)
    const conversationId = (url.searchParams.get('conversationId') ?? '').trim()
    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId query param required' }, { status: 400 })
    }
    // The query itself only returns rows of conversations the caller belongs to. A conversation that
    // belongs to someone else looks exactly like one that does not exist.
    if (!(await getConversationFor(conversationId, me))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    const messages = await listMessages(conversationId, me)
    return NextResponse.json({ configured: true, messages }, { headers: { 'cache-control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Failed to list messages' }, { status: 500 })
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
    // Messages are saved under the wallet that signed in, never under an address named in the request.
    if (body.senderAddress.toLowerCase() !== me) {
      return NextResponse.json({ error: 'You can only send messages as the wallet you signed in with' }, { status: 403 })
    }
    const content = body.content ?? ''
    if (content.length > MAX_CONTENT_CHARS) {
      return NextResponse.json({ error: 'Message too long' }, { status: 413 })
    }
    await ensureChatSchema()
    // The sender must be a member of the conversation, in direct chats and in groups alike.
    if (!(await getConversationFor(body.conversationId, me))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
  } catch {
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 })
  }
  const me = requireSession(req)
  if (!me) return unauthorized()
  try {
    const body = (await req.json()) as { txHash?: string; status?: string }
    if (!body?.txHash || !body?.status) {
      return NextResponse.json({ error: 'txHash and status required' }, { status: 400 })
    }
    const n = await updatePaymentStatus(body.txHash, body.status, me)
    if (n === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Failed to update payment status' }, { status: 500 })
  }
}
