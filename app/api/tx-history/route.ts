import { NextResponse } from 'next/server'
import {
  isTursoConfigured,
  ensureTxSchema,
  listTxRecords,
  upsertTxRecord,
} from '@/lib/turso'

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
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 200, 1), 500)
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
    }
    if (!body?.txHash) {
      return NextResponse.json({ error: 'txHash required' }, { status: 400 })
    }
    await upsertTxRecord({
      id: body.id ?? body.txHash,
      txHash: body.txHash,
      chainId: body.chainId ?? 5042,
      direction: body.direction ?? 'sent',
      amount: body.amount ?? '',
      fromAddress: body.fromAddress ?? '',
      toAddress: body.toAddress ?? '',
      status: body.status ?? 'pending',
      timestamp: body.timestamp ?? Date.now(),
      note: body.note,
      blockNumber: body.blockNumber,
    })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to save payment record' },
      { status: 500 },
    )
  }
}
