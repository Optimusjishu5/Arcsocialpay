import { NextResponse } from 'next/server'
import { isTursoConfigured, ensureChatSchema } from '@/lib/turso'
import { ARC_CHAIN_ID, ARC_RPC_URL, ARC_EXPLORER_URL } from '@/chains'

export async function GET() {
  let tursoOk = false
  let tursoError: string | null = null
  if (isTursoConfigured()) {
    try {
      tursoOk = await ensureChatSchema()
    } catch (e) {
      tursoError = e instanceof Error ? e.message : String(e)
    }
  }
  return NextResponse.json({
    ok: true,
    chain: {
      network: 'Arc Mainnet',
      chainId: ARC_CHAIN_ID,
      rpc: ARC_RPC_URL,
      explorer: ARC_EXPLORER_URL,
      gasToken: 'USDC',
    },
    turso: {
      configured: isTursoConfigured(),
      reachable: tursoOk,
      error: tursoError,
    },
    time: new Date().toISOString(),
  })
}
