// SocialPay contract events, newest first, read from the Arc node, decoded with the contract's ABI,
// and checked against the transaction receipts on the Arc node. Server only.
//
// Paging walks down the chain in block windows. `before` continues below the last page, `since`
// asks only for blocks above a known one (cheap enough to poll for live updates).

import { getAddress } from 'viem'
import { SOCIAL_PAY_DEPLOY_BLOCK, decodeSocialPayLog, decodeSocialPayLogs, involves, socialPayContracts, toNumber, type DecodedSocialPayEvent, type RawLog } from '../lib/socialPayEvents'
import { txLinks, type ExplorerLink } from '../lib/arcExplorers'
import { blockTimestamps, headBlock, receiptLogs, rpcSocialPayLogs, RPC_LOG_WINDOW } from './arcRpc'

const RPC_BATCH = 3
const MAX_EVENTS = 200
const BUDGET_MS = 12_000

export interface VerifiedSocialPayEvent extends DecodedSocialPayEvent {
  /** The Arc node's receipt for the transaction holds this exact log and the transaction succeeded. */
  verified: boolean
  /** Block time in ms, from the Arc node. */
  timestamp?: number
  links: ExplorerLink[]
}

export interface SocialPayEventsPage {
  events: VerifiedSocialPayEvent[]
  /** Pass as `before` for the next older page. Null once the contract's first block was reached. */
  nextBefore: number | null
  /** Newest block that was read, to pass as `since` for a live refresh. */
  head: number
  source: 'rpc'
  /** Anything the reader should know about this page, such as it stopping early. */
  note?: string
  /** Logs an explorer returned that the node's receipts did not confirm (left out). */
  rejected: number
}

export interface EventsQuery { before?: number; since?: number; address?: string; limit: number }

const lc = (s: string) => s.toLowerCase()
const sameLog = (a: RawLog, b: RawLog) =>
  lc(a.address) === lc(b.address) && lc(a.data) === lc(b.data) && a.topics.length === b.topics.length && a.topics.every((t, i) => lc(t) === lc(b.topics[i]))

export async function readSocialPayEvents(q: EventsQuery): Promise<SocialPayEventsPage> {
  const started = Date.now()
  const head = await headBlock()
  const top = q.before !== undefined ? Math.min(q.before - 1, head) : head
  const floor = Math.max(SOCIAL_PAY_DEPLOY_BLOCK, q.since !== undefined ? q.since + 1 : 0)

  let note: string | undefined
  const raw: RawLog[] = []
  let cursor = top // next block to read downward from
  const wanted = (logs: RawLog[]): RawLog[] => {
    if (!q.address) return logs
    return logs.filter((l) => {
      const d = decodeSocialPayLog(l)
      return !!d && involves(d, q.address as string)
    })
  }

  while (cursor >= floor && raw.length < Math.min(Math.max(q.limit, 1), MAX_EVENTS) && Date.now() - started < BUDGET_MS) {
    const windows: [number, number][] = []
    for (let i = 0, hi = cursor; i < RPC_BATCH && hi >= floor; i++) {
      const lo = Math.max(floor, hi - Number(RPC_LOG_WINDOW) + 1)
      windows.push([lo, hi])
      hi = lo - 1
    }
    const parts = await Promise.allSettled(windows.map(([lo, hi]) => rpcSocialPayLogs(lo, hi)))
    // Keep the windows read in order up to the first one that failed, so nothing is skipped silently.
    let readUpTo = windows.length
    parts.forEach((r, i) => { if (r.status === 'rejected' && i < readUpTo) readUpTo = i })
    for (let i = 0; i < readUpTo; i++) {
      const r = parts[i]
      if (r.status === 'fulfilled') raw.push(...wanted(r.value))
    }
    if (readUpTo === 0) throw (parts[0] as PromiseRejectedResult).reason
    if (readUpTo < windows.length) {
      // A live refresh must never skip blocks: fail it, and the caller asks again with the same `since`.
      if (q.since !== undefined) throw (parts[readUpTo] as PromiseRejectedResult).reason
      cursor = windows[readUpTo - 1][0] - 1
      note = 'The Arc node was busy, so this page stopped early. Load older events to continue.'
      break
    }
    cursor = windows[windows.length - 1][0] - 1
  }

  if (q.since !== undefined && cursor >= floor) throw new Error('Too many blocks since the last read')

  // Done when the contract's first block (or the `since` block) was reached; otherwise continue below `cursor`.
  const nextBefore = q.since !== undefined || cursor < floor ? null : cursor + 1
  const events = await confirm(raw)
  events.list.sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)

  return {
    events: events.list,
    nextBefore,
    head,
    source: 'rpc',
    ...(note ? { note } : {}),
    rejected: events.rejected,
  }
}

/**
 * Rebuilds each event from the node's own receipt (events read from the node itself are checked the same way). An explorer log with no matching receipt log is
 * dropped. When the node cannot be reached the explorer's log is kept but marked unverified.
 */
async function confirm(raw: RawLog[]): Promise<{ list: VerifiedSocialPayEvent[]; rejected: number }> {
  const seen = new Set<string>()
  const unique = raw.filter((l) => {
    const k = `${lc(l.transactionHash ?? '')}:${toNumber(l.logIndex)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
  const hashes = [...new Set(unique.map((l) => lc(l.transactionHash ?? '')))].filter(Boolean)
  const receipts = new Map<string, Awaited<ReturnType<typeof receiptLogs>> | 'error'>()
  for (let i = 0; i < hashes.length; i += 3) {
    await Promise.all(hashes.slice(i, i + 3).map(async (h) => {
      receipts.set(h, await receiptLogs(h).catch(() => 'error' as const))
    }))
  }

  const list: VerifiedSocialPayEvent[] = []
  let rejected = 0
  for (const l of unique) {
    const h = lc(l.transactionHash ?? '')
    const r = receipts.get(h)
    if (r === 'error') {
      const d = decodeSocialPayLog(l)
      if (d) list.push({ ...d, verified: false, links: txLinks(d.txHash) })
      continue
    }
    if (r === null || r === undefined) { rejected++; continue }
    const idx = toNumber(l.logIndex)
    const onChain = r.logs.find((x) => toNumber(x.logIndex) === idx)
    if (r.status !== 'success' || !onChain || !sameLog(onChain, l)) { rejected++; continue }
    const d = decodeSocialPayLogs([onChain])[0]
    if (!d) { rejected++; continue }
    list.push({ ...d, contract: getAddress(onChain.address), verified: true, links: txLinks(d.txHash) })
  }
  const times = await blockTimestamps([...new Set(list.map((e) => e.blockNumber))].slice(0, 100)).catch(() => new Map<number, number>())
  for (const e of list) {
    const t = times.get(e.blockNumber)
    if (t) e.timestamp = t
  }
  return { list, rejected }
}
