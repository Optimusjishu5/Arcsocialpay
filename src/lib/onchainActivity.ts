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

/** The primary RPC rejects wide log queries (8,000 blocks is safe; 50,000 is refused). */
export const SCAN_WINDOW = 8_000
/** A second public RPC accepts up to 100,000 blocks per query, but only keeps about 2.5 days of history. */
export const FAST_WINDOW = 90_000
export const FAST_RPC_URL = 'https://rpc.blockdaemon.mainnet.arc.io'
/** Stay well inside the fast RPC's retained history, which slides forward as the chain grows. */
export const FAST_REACH_BLOCKS = 380_000
/** About 24 hours of Arc blocks (about half a second each). */
export const BLOCKS_PER_DAY = 172_800

/**
 * Arc logs every USDC movement (native sends, ERC-20 transfers, mints, burns) from this system
 * address in 18 decimals. An ERC-20 transfer ALSO logs from the USDC contract in 6 decimals, but a
 * plain native send logs only from here, so this is the one source that sees all USDC movement.
 */
export const SYSTEM_EMITTER = '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE'
const USDC_ERC20 = '0x3600000000000000000000000000000000000000'
const NATIVE_PER_ERC20_UNIT = 10n ** 12n

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

export interface RpcLog { address: string; topics: string[]; data: string; blockNumber: string; transactionHash: string }

const topicAddr = (t: string) => getAddress(`0x${t.slice(-40)}`)
const hex = (n: bigint) => `0x${n.toString(16)}`

/**
 * Turns a raw log into a transfer. System-emitter logs (18 decimals) become 6-decimal USDC
 * transfers, so the rest of the app sees one consistent USDC. Returns null for logs to ignore.
 */
export function toTransferLog(l: RpcLog): TransferLog | null {
  if (l.topics.length < 3) return null
  let token = l.address
  let value = BigInt(l.data)
  if (same(l.address, SYSTEM_EMITTER)) {
    token = USDC_ERC20
    value /= NATIVE_PER_ERC20_UNIT // dust below one millionth of a dollar is dropped
  }
  if (value === 0n) return null
  return {
    txHash: l.transactionHash, blockNumber: BigInt(l.blockNumber), token,
    from: topicAddr(l.topics[1]), to: topicAddr(l.topics[2]), value,
  }
}

/** The addresses to read logs from: the system emitter for USDC (not the duplicate ERC-20 log), plus every other token. */
export function logSources(tokens: ScanToken[]): string[] {
  return [SYSTEM_EMITTER, ...tokens.filter((t) => !same(t.address, USDC_ERC20)).map((t) => t.address)]
}

/** The RPCs refuse answers with too many results or too wide a range; the caller splits the window. */
export const isTooBig = (e: unknown) => /max results|range too large|exceeds max|query exceeds|more than \d+ results|too many results/i.test(errText(e))
const isRateLimited = (e: unknown) => /rate limit|too many requests|429/i.test(errText(e))
function errText(e: unknown): string {
  return String((e as Error)?.message ?? e) + String((e as { details?: string })?.details ?? '')
}

// Each RPC has its own pace. Measured: the primary RPC accepts a burst of roughly 60 requests and
// then about one every two seconds. The gap below widens on every "rate limit" answer and narrows
// again on success, so a long scan settles at the pace each RPC really allows.
class Pace {
  gap: number
  private next = 0
  constructor(private readonly min: number, private readonly max: number) { this.gap = min }
  async slot(): Promise<void> {
    const now = Date.now()
    const startAt = Math.max(now, this.next)
    this.next = startAt + this.gap
    if (startAt > now) await new Promise((r) => setTimeout(r, startAt - now))
  }
  ok() { this.gap = Math.max(this.min, this.gap * 0.97) }
  limited() { this.gap = Math.min(this.max, this.gap * 1.6) }
}
const paces = new WeakMap<object, Pace>()
function paceOf(client: PublicClient): Pace {
  let p = paces.get(client)
  if (!p) { p = new Pace(340, 2_000); paces.set(client, p) }
  return p
}
/** Marks a client as the fast one (shorter minimum gap). */
export function markFastClient(client: PublicClient): void {
  paces.set(client, new Pace(120, 2_000))
}

async function rpc<T>(client: PublicClient, fn: () => Promise<T>): Promise<T> {
  const pace = paceOf(client)
  let lastError: unknown
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      await pace.slot()
      const result = await fn()
      pace.ok()
      return result
    } catch (e) {
      lastError = e
      if (isTooBig(e)) throw e // the caller splits the window instead of retrying the same one
      if (isRateLimited(e)) pace.limited()
      // A rate limit refills slowly, so wait for it instead of burning attempts.
      await new Promise((r) => setTimeout(r, isRateLimited(e) ? 2_000 * (attempt + 1) : 300 * 2 ** attempt))
    }
  }
  throw lastError
}

async function rawLogs(client: PublicClient, params: Record<string, unknown>): Promise<RpcLog[]> {
  const request = client.request as unknown as (a: { method: string; params: unknown[] }) => Promise<RpcLog[]>
  return rpc(client, () => request({ method: 'eth_getLogs', params: [params] }))
}

/** Fetches logs for one window of blocks. Throws if any query fails, so the caller never records a gap as scanned. */
async function fetchWindowOnce(
  client: PublicClient,
  me: string,
  tokens: ScanToken[],
  from: bigint,
  to: bigint,
): Promise<TransferLog[]> {
  const range = { fromBlock: hex(from), toBlock: hex(to) }
  const meTopic = pad(me as `0x${string}`).toLowerCase()
  const address = logSources(tokens)
  // Payments through the SocialPay contract move USDC like any transfer, so these two queries
  // already find them. Memos and tips are added afterwards from the receipts of those payments.
  const results = await Promise.all([
    rawLogs(client, { ...range, address, topics: [TRANSFER_TOPIC, meTopic] }),
    rawLogs(client, { ...range, address, topics: [TRANSFER_TOPIC, null, meTopic] }),
  ])
  const transfers: TransferLog[] = []
  for (const l of [...results[0], ...results[1]]) {
    const t = toTransferLog(l)
    if (t) transfers.push(t)
  }
  return dedupe(transfers)
}

export async function fetchWindow(
  client: PublicClient,
  me: string,
  tokens: ScanToken[],
  from: bigint,
  to: bigint,
): Promise<TransferLog[]> {
  try {
    return await fetchWindowOnce(client, me, tokens, from, to)
  } catch (e) {
    if (!isTooBig(e) || from >= to) throw e
    const mid = from + (to - from) / 2n
    const [a, b] = await Promise.all([
      fetchWindow(client, me, tokens, from, mid),
      fetchWindow(client, me, tokens, mid + 1n, to),
    ])
    return [...a, ...b]
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

export interface ScanWindow { lo: bigint; hi: bigint; fast: boolean }

/**
 * Splits [from, to] into windows, newest first. Blocks at or above `fastFloor` use the large
 * windows of the fast RPC; older blocks use small windows on the primary RPC.
 */
export function planWindows(from: bigint, to: bigint, fastFloor: bigint | null): ScanWindow[] {
  const out: ScanWindow[] = []
  let hi = to
  while (hi >= from) {
    const fast = fastFloor !== null && hi >= fastFloor
    const size = BigInt(fast ? FAST_WINDOW : SCAN_WINDOW)
    let lo = hi - size + 1n
    if (fast && fastFloor !== null && lo < fastFloor) lo = fastFloor
    if (lo < from) lo = from
    out.push({ lo, hi, fast })
    hi = lo - 1n
  }
  return out
}

/**
 * Scans [from, to] newest first and returns history entries with timestamps. If a window keeps
 * failing the scan stops there and `scannedLow` says how far down it really got, so the gap is
 * retried next time instead of being skipped. An entry is never saved without its real time.
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
  /** Optional second RPC with wide windows for the most recent days. */
  fastClient?: PublicClient,
  /** Newest block the head was at when the scan started (used to decide what the fast RPC still holds). */
  head?: bigint,
): Promise<{ records: Omit<TxRecord, 'id'>[]; scannedLow: bigint }> {
  const fastFloor = fastClient && head !== undefined ? (head > BigInt(FAST_REACH_BLOCKS) ? head - BigInt(FAST_REACH_BLOCKS) : 0n) : null
  const windows = planWindows(from, to, fastFloor)
  const all: Omit<TxRecord, 'id'>[] = []
  let scannedLow = to + 1n
  const total = to - from + 1n
  const CONCURRENCY = 2

  /** One window; the fast RPC falls back to the primary one if it fails. */
  async function load(w: ScanWindow): Promise<TransferLog[]> {
    if (w.fast && fastClient) {
      try {
        return await fetchWindow(fastClient, me, tokens, w.lo, w.hi)
      } catch {
        // fall through to the primary RPC in small windows
      }
    }
    const out: TransferLog[] = []
    for (let hi = w.hi; hi >= w.lo; hi -= BigInt(SCAN_WINDOW)) {
      const lo = hi - BigInt(SCAN_WINDOW) + 1n > w.lo ? hi - BigInt(SCAN_WINDOW) + 1n : w.lo
      out.push(...(await fetchWindow(client, me, tokens, lo, hi)))
      if (lo === w.lo) break
    }
    return out
  }

  async function blockTime(n: number): Promise<number> {
    const big = BigInt(n)
    if (fastClient && fastFloor !== null && big >= fastFloor) {
      try {
        const blk = await rpc(fastClient, () => fastClient.getBlock({ blockNumber: big }))
        return Number(blk.timestamp) * 1000
      } catch { /* try the primary RPC */ }
    }
    const blk = await rpc(client, () => client.getBlock({ blockNumber: big }))
    return Number(blk.timestamp) * 1000
  }

  for (let i = 0; i < windows.length; i += CONCURRENCY) {
    const group = windows.slice(i, i + CONCURRENCY)
    try {
      const parts = await Promise.all(group.map(load))
      // A transaction's logs all sit in one block, so a window never splits a transaction.
      const classified = classifyActivity(me, parts.flat(), [], tokens, chainId)
      const times = new Map<number, number>()
      const blocks = [...new Set(classified.map((r) => r.blockNumber))]
      for (let b = 0; b < blocks.length; b += 6) {
        await Promise.all(blocks.slice(b, b + 6).map(async (n) => { times.set(n, await blockTime(n)) }))
      }
      await addPaymentNotes(client, socialPay, classified)
      const batch = classified.map((r) => ({ ...r, timestamp: times.get(r.blockNumber) as number }))
      all.push(...batch)
      if (batch.length) onRecords?.(batch)
      scannedLow = group[group.length - 1].lo
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
      const receipt = await rpc(client, () => client.getTransactionReceipt({ hash: r.txHash as `0x${string}` }))
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
