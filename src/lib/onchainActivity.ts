// Rebuilds payment, tip, swap and bridge history from Arc logs, so history shows up
// in any browser or on any device, not only the one the transaction was made from.

import { decodeEventLog, formatUnits, getAddress, pad, zeroAddress, type PublicClient } from 'viem'
import type { TxRecord } from '@/types/index'
import { SOCIAL_PAY_ABI } from '../contracts/arcSocialPay'

export interface ScanToken { symbol: string; address: string; decimals: number }

export interface TransferLog { txHash: string; blockNumber: bigint; token: string; from: string; to: string; value: bigint }
export interface PayLog {
  txHash: string; blockNumber: bigint
  kind: 'payment' | 'tip'
  sender: string; recipient: string; amount: bigint; text: string
}

export type ScannedRecord = Omit<TxRecord, 'id' | 'timestamp'> & { blockNumber: number }

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function fmt(value: bigint, decimals: number): string {
  const [i, f] = formatUnits(value, decimals).split('.')
  return f ? `${i}.${f}` : i
}

/**
 * Turns raw logs into history entries, one per transaction:
 * - a payment or tip made through the SocialPay contract
 * - a swap (one token leaves your wallet and a different one arrives in the same transaction)
 * - a bridge arrival (tokens minted to you)
 * - a plain send or receive
 */
export function classifyActivity(
  me: string,
  transfers: TransferLog[],
  payLogs: PayLog[],
  tokens: ScanToken[],
  chainId: number,
): ScannedRecord[] {
  const byHash = new Map<string, { transfers: TransferLog[]; pays: PayLog[]; block: bigint }>()
  const slot = (hash: string, block: bigint) => {
    const key = hash.toLowerCase()
    let s = byHash.get(key)
    if (!s) { s = { transfers: [], pays: [], block }; byHash.set(key, s) }
    return s
  }
  for (const t of transfers) {
    if (same(t.from, t.to)) continue // moving funds to yourself
    slot(t.txHash, t.blockNumber).transfers.push(t)
  }
  for (const p of payLogs) slot(p.txHash, p.blockNumber).pays.push(p)

  const tokenOf = (addr: string) => tokens.find((t) => same(t.address, addr))
  const out: ScannedRecord[] = []

  for (const [txHash, g] of byHash) {
    const base = { txHash, chainId, status: 'confirmed' as const, blockNumber: Number(g.block) }
    const ins = g.transfers.filter((t) => same(t.to, me))
    const outs = g.transfers.filter((t) => same(t.from, me))

    // 1. Through the SocialPay contract
    const pay = g.pays.find((p) => same(p.sender, me)) ?? g.pays.find((p) => same(p.recipient, me))
    if (pay) {
      const sent = same(pay.sender, me)
      out.push({
        ...base, kind: 'payment', direction: sent ? 'sent' : 'received',
        amount: fmt(pay.amount, 6), fromAddress: pay.sender, toAddress: pay.recipient,
        note: pay.text || (pay.kind === 'tip' ? 'Tip' : undefined),
      })
      continue
    }

    // 2. Swap: a different token comes back in the same transaction
    const outTok = outs.map((t) => t.token.toLowerCase())
    const swapOut = outs.find((o) => ins.some((i) => !same(i.token, o.token)))
    const swapIn = swapOut ? ins.find((i) => !same(i.token, swapOut.token)) : undefined
    if (swapOut && swapIn && outTok.length > 0) {
      const a = tokenOf(swapOut.token); const b = tokenOf(swapIn.token)
      if (a && b) {
        const sumOut = outs.filter((o) => same(o.token, swapOut.token)).reduce((n, o) => n + o.value, 0n)
        const sumIn = ins.filter((i) => same(i.token, swapIn.token)).reduce((n, i) => n + i.value, 0n)
        out.push({
          ...base, kind: 'swap', direction: 'sent',
          amount: fmt(sumOut, a.decimals), symbol: a.symbol,
          fromAddress: me, toAddress: me,
          summary: `${fmt(sumOut, a.decimals)} ${a.symbol} to ${fmt(sumIn, b.decimals)} ${b.symbol}`,
        })
        continue
      }
    }

    // 3. Bridge arrival: tokens minted straight to you
    const minted = ins.find((i) => same(i.from, zeroAddress))
    if (minted && outs.length === 0) {
      const t = tokenOf(minted.token)
      if (t) {
        out.push({
          ...base, kind: 'bridge', direction: 'received',
          amount: fmt(minted.value, t.decimals), symbol: t.symbol,
          fromAddress: zeroAddress, toAddress: me,
          summary: `${fmt(minted.value, t.decimals)} ${t.symbol} arrived from another chain`,
        })
        continue
      }
    }

    // 4. Plain send or receive (the biggest transfer in the transaction)
    const pick = (list: TransferLog[]) => list.reduce((best, t) => (t.value > best.value ? t : best))
    if (outs.length > 0) {
      const o = pick(outs); const t = tokenOf(o.token)
      if (!t) continue
      out.push({
        ...base, kind: 'payment', direction: 'sent', amount: fmt(o.value, t.decimals),
        symbol: t.symbol === 'USDC' ? undefined : t.symbol, fromAddress: me, toAddress: o.to,
      })
    } else if (ins.length > 0) {
      const i = pick(ins); const t = tokenOf(i.token)
      if (!t) continue
      out.push({
        ...base, kind: 'payment', direction: 'received', amount: fmt(i.value, t.decimals),
        symbol: t.symbol === 'USDC' ? undefined : t.symbol, fromAddress: i.from, toAddress: me,
      })
    }
  }
  return out
}

// ── Fetching ────────────────────────────────────────────────────────────────

/** The Arc RPC rejects wide log queries (8,000 blocks worked, 10,000 failed when measured), so scan in small windows. */
export const SCAN_WINDOW = 8_000
/** About 24 hours of Arc blocks (about half a second each). */
export const BLOCKS_PER_DAY = 172_800

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

interface RpcLog { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string }

/** The RPC also refuses answers with more than 2,000 logs, which a very active wallet can hit. */
export const isTooBig = (e: unknown) => /max results|range too large|exceeds max/i.test(errText(e))
const isRateLimited = (e: unknown) => /rate limit|too many requests|429/i.test(errText(e))
function errText(e: unknown): string {
  return String((e as Error)?.message ?? e) + String((e as { details?: string })?.details ?? '')
}

// The Arc RPC allows only about 3 log queries per second (bursts of 16 were rejected when
// measured), so requests are started one at a time with a short gap between them.
const REQUEST_GAP_MS = 340
let nextStart = 0
async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const startAt = Math.max(now, nextStart)
  nextStart = startAt + REQUEST_GAP_MS
  if (startAt > now) await new Promise((r) => setTimeout(r, startAt - now))
  return fn()
}

async function rpc<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await withSlot(fn)
    } catch (e) {
      lastError = e
      if (isTooBig(e)) throw e // the caller splits the window instead of retrying the same one
      await new Promise((r) => setTimeout(r, (isRateLimited(e) ? 800 : 300) * 2 ** attempt))
    }
  }
  throw lastError
}

async function rawLogs(client: PublicClient, params: Record<string, unknown>): Promise<RpcLog[]> {
  const request = client.request as unknown as (a: { method: string; params: unknown[] }) => Promise<RpcLog[]>
  return rpc(() => request({ method: 'eth_getLogs', params: [params] }))
}

const topicAddr = (t: string) => getAddress(`0x${t.slice(-40)}`)
const hex = (n: bigint) => `0x${n.toString(16)}`

/** Fetches logs for one window of blocks. Throws if any query fails, so the caller never records a gap as scanned. */
async function fetchWindowOnce(
  client: PublicClient,
  me: string,
  tokens: ScanToken[],
  socialPay: string | null,
  from: bigint,
  to: bigint,
): Promise<{ transfers: TransferLog[]; pays: PayLog[] }> {
  const range = { fromBlock: hex(from), toBlock: hex(to) }
  const meTopic = pad(me as `0x${string}`).toLowerCase()
  const tokenAddrs = tokens.map((t) => t.address)

  const queries: Promise<RpcLog[]>[] = [
    rawLogs(client, { ...range, address: tokenAddrs, topics: [TRANSFER_TOPIC, meTopic] }),
    rawLogs(client, { ...range, address: tokenAddrs, topics: [TRANSFER_TOPIC, null, meTopic] }),
  ]
  // Payments through the SocialPay contract move USDC like any transfer, so the two transfer
  // queries already find them. Skipping the contract's own events halves the number of RPC calls.
  void socialPay
  const results = await Promise.all(queries)

  const transfers: TransferLog[] = []
  for (const l of [...results[0], ...results[1]]) {
    if (l.topics.length < 3) continue
    transfers.push({
      txHash: l.transactionHash, blockNumber: BigInt(l.blockNumber), token: l.address,
      from: topicAddr(l.topics[1]), to: topicAddr(l.topics[2]), value: BigInt(l.data),
    })
  }
  // Memos and tips are added afterwards from the receipts of the payments that were found.
  return { transfers: dedupe(transfers), pays: [] as PayLog[] }
}

export async function fetchWindow(
  client: PublicClient,
  me: string,
  tokens: ScanToken[],
  socialPay: string | null,
  from: bigint,
  to: bigint,
): Promise<{ transfers: TransferLog[]; pays: PayLog[] }> {
  try {
    return await fetchWindowOnce(client, me, tokens, socialPay, from, to)
  } catch (e) {
    if (!isTooBig(e) || from >= to) throw e
    const mid = from + (to - from) / 2n
    const [a, b] = await Promise.all([
      fetchWindow(client, me, tokens, socialPay, from, mid),
      fetchWindow(client, me, tokens, socialPay, mid + 1n, to),
    ])
    return { transfers: [...a.transfers, ...b.transfers], pays: [...a.pays, ...b.pays] }
  }
}

function dedupe(list: TransferLog[]): TransferLog[] {
  const seen = new Set<string>()
  return list.filter((t) => {
    const k = `${t.txHash}|${t.token}|${t.from}|${t.to}|${t.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
/**
 * Scans [from, to] newest first in small windows and returns history entries with
 * timestamps. If a window keeps failing the scan stops there and `scannedLow` says
 * how far down it really got, so the gap is retried next time instead of being skipped.
 */
export async function scanRange(
  client: PublicClient,
  me: string,
  tokens: ScanToken[],
  socialPay: string | null,
  from: bigint,
  to: bigint,
  chainId: number,
  onProgress?: (doneBlocks: bigint, totalBlocks: bigint) => void,
  /** Called with each batch of finished entries so they show up while the scan is still running. */
  onRecords?: (records: Omit<TxRecord, 'id'>[]) => void,
): Promise<{ records: Omit<TxRecord, 'id'>[]; scannedLow: bigint }> {
  const windows: [bigint, bigint][] = []
  for (let hi = to; hi >= from; hi -= BigInt(SCAN_WINDOW)) {
    const lo = hi - BigInt(SCAN_WINDOW) + 1n > from ? hi - BigInt(SCAN_WINDOW) + 1n : from
    windows.push([lo, hi])
    if (lo === from) break
  }
  const all: Omit<TxRecord, 'id'>[] = []
  let scannedLow = to + 1n
  const total = to - from + 1n
  const CONCURRENCY = 2
  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const group = windows.slice(i, i + CONCURRENCY)
    try {
      const parts = await Promise.all(group.map(([lo, hi]) => fetchWindow(client, me, tokens, socialPay, lo, hi)))
      // A transaction's logs all sit in one block, so a window never splits a transaction.
      const classified = classifyActivity(me, parts.flatMap((p) => p.transfers), parts.flatMap((p) => p.pays), tokens, chainId)
      const times = new Map<number, number>()
      const blocks = [...new Set(classified.map((r) => r.blockNumber))]
      for (let b = 0; b < blocks.length; b += 6) {
        await Promise.all(blocks.slice(b, b + 6).map(async (n) => {
          try {
            const blk = await rpc(() => client.getBlock({ blockNumber: BigInt(n) }))
            times.set(n, Number(blk.timestamp) * 1000)
          } catch { /* leave undated */ }
        }))
      }
      await addPaymentNotes(client, socialPay, classified)
      const batch = classified.map((r) => ({ ...r, timestamp: times.get(r.blockNumber) ?? Date.now() }))
      all.push(...batch)
      if (batch.length) onRecords?.(batch)
      scannedLow = group[group.length - 1][0]
      onProgress?.(to - scannedLow + 1n, total)
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[activity] scan stopped:', String((e as { details?: string })?.details ?? (e as Error)?.message ?? e))
      break
    }
  }
  return { records: all, scannedLow }
}

/** Adds the memo (or the tipped post) to payments that went through the SocialPay contract, read from their receipts. */
async function addPaymentNotes(client: PublicClient, socialPay: string | null, records: ScannedRecord[]): Promise<void> {
  if (!socialPay) return
  const payments = records.filter((r) => r.kind === 'payment' && !r.symbol).slice(0, 12)
  await Promise.all(payments.map(async (r) => {
    try {
      const receipt = await rpc(() => client.getTransactionReceipt({ hash: r.txHash as `0x${string}` }))
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== socialPay.toLowerCase()) continue
        try {
          const ev = decodeEventLog({ abi: SOCIAL_PAY_ABI, data: log.data, topics: log.topics })
          if (ev.eventName !== 'Payment' && ev.eventName !== 'Tip') continue
          const a = ev.args as unknown as { memo?: string; postId?: string }
          r.note = (ev.eventName === 'Tip' ? a.postId || 'Tip' : a.memo) || r.note
        } catch { /* a different event from the same contract */ }
      }
    } catch { /* no note, the payment still shows */ }
  }))
}
