// Reads Arc Mainnet straight from an Arc node and checks what the explorers say against it.
// Used by the API routes. A static host has no routes, so the browser also calls verifyTransaction from here.
// The RPC is chosen with ARC_MAINNET_RPC (or NEXT_PUBLIC_ARC_RPC) and falls back to
// the public Arc Mainnet endpoint. The chain id is checked once, so a misconfigured URL can never
// "verify" a transaction against the wrong network.

import { createPublicClient, formatUnits, http, parseAbiItem, decodeEventLog, type PublicClient } from 'viem'
import { ARC_CHAIN_ID, ARC_RPC_URL } from '../chains'
import { decodeSocialPayLogs, socialPayContracts, type DecodedSocialPayEvent, type RawLog } from '../lib/socialPayEvents'
import { ARC_USDC, isTxHash } from '../lib/arcExplorers'

/** The node refuses larger log ranges than this. */
export const RPC_LOG_WINDOW = 8_000n

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)')

let client: PublicClient | null = null
let checked: Promise<void> | null = null

export function rpcUrl(): string {
  return process.env.ARC_MAINNET_RPC?.trim() || ARC_RPC_URL
}

export async function arcClient(): Promise<PublicClient> {
  if (!client) client = createPublicClient({ transport: http(rpcUrl(), { timeout: 10_000, retryCount: 2 }) }) as PublicClient
  const c = client
  checked ??= c.getChainId().then((id) => {
    if (id !== ARC_CHAIN_ID) throw new Error(`RPC answered chain ${id}, expected ${ARC_CHAIN_ID}`)
  })
  try {
    await checked
  } catch (e) {
    checked = null
    throw e
  }
  return c
}

export interface UsdcTransfer { from: string; to: string; amountUsdc: string; logIndex: number }

export type TxVerification =
  | { found: false; hash: string }
  | {
      found: true
      /** The receipt, the transaction and every log agree with each other and with the requested hash. */
      verified: boolean
      mismatches: string[]
      hash: string
      status: 'success' | 'reverted'
      blockNumber: number
      /** Block time, ms. */
      timestamp: number
      from: string
      to: string | null
      contractAddress: string | null
      gasUsed: string
      /** Fee paid, in USDC (the native view of the same coin, 18 decimals). */
      feeUsdc: string
      logCount: number
      socialPayEvents: DecodedSocialPayEvent[]
      usdcTransfers: UsdcTransfer[]
    }

const lc = (s: string) => s.toLowerCase()
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const isLimited = (e: unknown) => /rate limit|too many|exceeds defined limit|429/i.test(String((e as Error)?.message))

/** Runs an RPC call again, with growing waits, while the node answers "rate limit". Other errors pass straight through. */
async function withRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (e) {
      if (!isLimited(e) || attempt >= 5) throw e
      await sleep(300 * 2 ** attempt)
    }
  }
}
/** Verified transactions never change (Arc finalizes in one step), so they are kept; "not found" is never kept. */
const verifiedCache = new Map<string, TxVerification>()

async function readTx(hash: `0x${string}`): Promise<TxVerification> {
  const c = await arcClient()
  const [receipt, tx] = await Promise.all([
    withRetry(() => c.getTransactionReceipt({ hash })).catch((e: unknown) => {
      if (/could not be found|not found/i.test(String((e as Error)?.message))) return null
      throw e
    }),
    withRetry(() => c.getTransaction({ hash })).catch((e: unknown) => {
      if (/could not be found|not found/i.test(String((e as Error)?.message))) return null
      throw e
    }),
  ])
  if (!receipt || !tx) return { found: false, hash }
  const block = await withRetry(() => c.getBlock({ blockNumber: receipt.blockNumber }))

  const mismatches: string[] = []
  if (lc(receipt.transactionHash) !== lc(hash)) mismatches.push('receipt hash differs')
  if (lc(tx.hash) !== lc(hash)) mismatches.push('transaction hash differs')
  if (tx.blockHash && lc(tx.blockHash) !== lc(receipt.blockHash)) mismatches.push('block differs between receipt and transaction')
  if (lc(receipt.from) !== lc(tx.from)) mismatches.push('sender differs between receipt and transaction')
  for (const l of receipt.logs) {
    if (lc(l.transactionHash ?? '') !== lc(hash)) { mismatches.push('a log belongs to another transaction'); break }
  }

  const raw: RawLog[] = receipt.logs.map((l) => ({
    address: l.address, topics: l.topics, data: l.data, blockNumber: l.blockNumber, transactionHash: l.transactionHash, logIndex: l.logIndex,
  }))
  const usdcTransfers: UsdcTransfer[] = []
  for (const l of receipt.logs) {
    if (lc(l.address) !== lc(ARC_USDC)) continue
    try {
      const ev = decodeEventLog({ abi: [TRANSFER], data: l.data, topics: l.topics, strict: true })
      usdcTransfers.push({ from: ev.args.from, to: ev.args.to, amountUsdc: formatUnits(ev.args.value, 6), logIndex: l.logIndex })
    } catch { /* not a Transfer */ }
  }

  return {
    found: true,
    verified: mismatches.length === 0,
    mismatches,
    hash: lc(hash),
    status: receipt.status === 'success' ? 'success' : 'reverted',
    blockNumber: Number(receipt.blockNumber),
    timestamp: Number(block.timestamp) * 1000,
    from: receipt.from,
    to: receipt.to,
    contractAddress: receipt.contractAddress ?? null,
    gasUsed: receipt.gasUsed.toString(),
    feeUsdc: formatUnits(receipt.gasUsed * receipt.effectiveGasPrice, 18),
    logCount: receipt.logs.length,
    socialPayEvents: decodeSocialPayLogs(raw),
    usdcTransfers,
  }
}

/** Looks a transaction up on the Arc node and decodes its SocialPay events. */
export async function verifyTransaction(hash: string): Promise<TxVerification> {
  if (!isTxHash(hash)) throw new Error('Not a transaction hash')
  const h = lc(hash) as `0x${string}`
  const hit = verifiedCache.get(h)
  if (hit) return hit
  const res = await readTx(h)
  if (res.found && res.verified) {
    if (verifiedCache.size >= 2_000) verifiedCache.clear()
    verifiedCache.set(h, res)
  }
  return res
}

/** The logs of one transaction exactly as the node holds them, or null when it is not on chain (yet). */
export async function receiptLogs(hash: string): Promise<{ status: 'success' | 'reverted'; logs: RawLog[] } | null> {
  if (!isTxHash(hash)) return null
  const c = await arcClient()
  const receipt = await withRetry(() => c.getTransactionReceipt({ hash: lc(hash) as `0x${string}` })).catch((e: unknown) => {
    if (/could not be found|not found/i.test(String((e as Error)?.message))) return null
    throw e
  })
  if (!receipt || lc(receipt.transactionHash) !== lc(hash)) return null
  return {
    status: receipt.status === 'success' ? 'success' : 'reverted',
    logs: receipt.logs.map((l) => ({ address: l.address, topics: l.topics, data: l.data, blockNumber: l.blockNumber, transactionHash: l.transactionHash, logIndex: l.logIndex })),
  }
}

export async function headBlock(): Promise<number> {
  return Number(await (await arcClient()).getBlockNumber())
}

/** SocialPay logs read from the node. Range must fit RPC_LOG_WINDOW. */
export async function rpcSocialPayLogs(fromBlock: number, toBlock: number): Promise<RawLog[]> {
  const c = await arcClient()
  const logs = await withRetry(() => c.getLogs({
    address: socialPayContracts() as `0x${string}`[],
    fromBlock: BigInt(fromBlock),
    toBlock: BigInt(toBlock),
  }))
  return logs.map((l) => ({
    address: l.address, topics: l.topics, data: l.data, blockNumber: l.blockNumber, transactionHash: l.transactionHash, logIndex: l.logIndex,
  }))
}

/** Block times (ms) for a set of blocks; blocks the node does not answer for are left out. */
export async function blockTimestamps(blocks: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>()
  const c = await arcClient()
  for (let i = 0; i < blocks.length; i += 3) {
    await Promise.all(blocks.slice(i, i + 3).map(async (n) => {
      const b = await withRetry(() => c.getBlock({ blockNumber: BigInt(n) })).catch(() => null)
      if (b) out.set(n, Number(b.timestamp) * 1000)
    }))
  }
  return out
}
