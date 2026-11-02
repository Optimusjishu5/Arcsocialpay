import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureTxSchema,
  listTxRecords,
  upsertTxRecord,
} from '@/lib/turso'
import { isTxHash } from '@/lib/arcExplorers'
import { verifyTransaction } from '@/server/arcRpc'
import { rateLimit, tooManyRequests } from '@/server/guard'

export async function GET(req: Request) {
  if (!isTursoConfigured()) {
    return NextResponse.json(
      { configured: false, records: [], hint: 'Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN to enable persistent payment history.' },
      { status: 200 },
    )
  }
  try {
    await ensureTxSchema()
    const url = new URL(req.url)
    const address = (url.searchParams.get('address') ?? '').trim()
    if (!address) {
      return NextResponse.json({ error: 'address query param required' }, { status: 400 })
    }
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 2000)
    const records = await listTxRecords(address, limit)
    return NextResponse.json({ configured: true, records })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to list payment history' },
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
      txHash: string
      chainId?: number
      direction?: string
      amount?: string
      fromAddress?: string
      toAddress?: string
      status?: string
      timestamp?: number
      note?: string
      blockNumber?: number
      kind?: string
      summary?: string
      symbol?: string
    }
    if (!body?.txHash) {
      return NextResponse.json({ error: 'txHash required' }, { status: 400 })
    }
    const limited = rateLimit(req, 'tx-history', 120)
    if (!limited.ok) return tooManyRequests(limited.retryAfter)

    // A saved payment must be a real Arc transaction. What the Arc node says (outcome, block, time)
    // replaces what the browser claimed; a payment the node does not know yet can only be saved as pending.
    let { status, blockNumber, timestamp } = body
    if ((body.chainId ?? 5042) === 5042) {
      if (!isTxHash(body.txHash)) return NextResponse.json({ error: 'txHash is not a transaction hash' }, { status: 400 })
      const onChain = await verifyTransaction(body.txHash).catch(() => null) // node unreachable: keep as sent
      if (onChain && !onChain.found && status === 'confirmed') {
        return NextResponse.json({ error: 'Transaction is not on Arc (yet), so it cannot be saved as settled' }, { status: 422 })
      }
      if (onChain?.found) {
        if (!onChain.verified) return NextResponse.json({ error: 'Arc data for this transaction is inconsistent' }, { status: 422 })
        status = onChain.status === 'success' ? 'confirmed' : 'failed'
        blockNumber = onChain.blockNumber
        timestamp = onChain.timestamp
      }
    }
    await upsertTxRecord({
      id: body.id ?? body.txHash,
      txHash: body.txHash,
      chainId: body.chainId ?? 5042,
      direction: body.direction ?? 'sent',
      amount: body.amount ?? '',
      fromAddress: body.fromAddress ?? '',
      toAddress: body.toAddress ?? '',
      status: status ?? 'pending',
      timestamp: timestamp ?? Date.now(),
      note: body.note,
      blockNumber,
      kind: ['payment', 'swap', 'bridge', 'batch', 'request', 'split', 'schedule', 'other'].includes(body.kind ?? '') ? body.kind : undefined,
      summary: typeof body.summary === 'string' ? body.summary.slice(0, 200) : undefined,
      symbol: typeof body.symbol === 'string' ? body.symbol.slice(0, 12) : undefined,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save payment record' },
      { status: 500 },
    )
  }
}
