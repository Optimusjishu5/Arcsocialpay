// Wallet history from the Arc explorer's index (Blockscout). The explorer has every
// transaction, token transfer and contract-made payment for an address, so this is the
// complete list, unlike reading logs from a node, which is slow and capped.
//
// Three feeds are merged per transaction hash:
//   - transactions     (sent or received native USDC, contract calls, failures)
//   - token transfers  (every ERC-20: USDC, EURC, cirBTC and any other token)
//   - internal calls   (native USDC a contract paid out, e.g. the proceeds of a swap)
// and then described with the same rules the chain scanner uses (send, receive, swap, bridge,
// plus "other" for approvals and contract calls that move no tokens).

import { getAddress, zeroAddress } from 'viem'
import type { TxRecord } from '@/types/index'
import { ARC_CHAIN_ID } from '../chains'
import { parseMemo } from '../utils/memoTags'
import { classifyActivity, SYSTEM_EMITTER, type ScanToken, type TransferLog } from './onchainActivity'

export const USDC_ERC20 = '0x3600000000000000000000000000000000000000'
const NATIVE_PER_ERC20_UNIT = 10n ** 12n
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export type Feed = 'transactions' | 'token-transfers' | 'internal-transactions'
export const FEEDS: readonly Feed[] = ['transactions', 'token-transfers', 'internal-transactions']

type Json = Record<string, unknown>
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {})
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '')
const hashOf = (v: unknown): string => str(obj(v).hash) || str(obj(v).address_hash) || str(v)
const big = (v: unknown): bigint => { try { return BigInt(str(v) || '0') } catch { return 0n } }
const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ── Fetching ────────────────────────────────────────────────────────────────

export interface Page { items: Json[]; next: Record<string, string> | null }

/** Where a page comes from. Throws when the explorer can't be reached. */
export type PageFetcher = (feed: Feed, address: string, cursor: Record<string, string> | null) => Promise<Page>

function toPage(json: unknown): Page {
  const j = obj(json)
  if (!Array.isArray(j.items)) throw new Error('Unexpected explorer answer')
  const npp = obj(j.next_page_params)
  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(npp)) if (v !== null && v !== undefined) next[k] = String(v)
  return { items: j.items as Json[], next: Object.keys(next).length ? next : null }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function getJson(url: string, init?: RequestInit): Promise<unknown> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, init)
    if (res.status === 429) { await sleep(1_000 * (attempt + 1)); continue }
    if (!res.ok) throw new Error(`Explorer answered ${res.status}`)
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.includes('json')) throw new Error('Explorer answered with a page, not data') // e.g. a bot check
    return res.json()
  }
  throw new Error('Explorer is rate limited')
}

/** This app's own server route (keeps the explorer key private). Missing on static hosts. */
const viaServer: PageFetcher = async (feed, address, cursor) => {
  const qs = new URLSearchParams({ feed, address, ...(cursor ?? {}) })
  return toPage(await getJson(`/api/explorer?${qs}`))
}

/** Direct call with a key that ships in the page, for hosts that have no server routes. */
const viaPublicKey: PageFetcher = async (feed, address, cursor) => {
  const key = (typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_BLOCKSCOUT_API_KEY : undefined)?.trim()
  if (!key) throw new Error('No explorer key')
  const qs = new URLSearchParams(cursor ?? {})
  const url = `https://api.blockscout.com/${ARC_CHAIN_ID}/api/v2/addresses/${address}/${feed}?${qs}`
  return toPage(await getJson(url, { headers: { authorization: `Bearer ${key}` } }))
}

/** Tries each way in turn and sticks with the first that works. */
export function makeFetcher(sources: readonly PageFetcher[] = [viaServer, viaPublicKey]): PageFetcher {
  let working: PageFetcher | null = null
  return async (feed, address, cursor) => {
    if (working) return working(feed, address, cursor)
    let lastError: unknown
    for (const src of sources) {
      try {
        const page = await src(feed, address, cursor)
        working = src
        return page
      } catch (e) { lastError = e }
    }
    throw lastError instanceof Error ? lastError : new Error('Explorer unavailable')
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

interface Seen {
  transfers: TransferLog[]
  tokens: Map<string, ScanToken>
  /** hash -> facts about the transaction itself */
  txs: Map<string, { block: number; at: number; failed: boolean; from: string; to: string; method: string; value: bigint; note?: string }>
  /** hash -> timestamp (ms), from whichever feed saw it */
  times: Map<string, number>
}

export function emptySeen(): Seen {
  return { transfers: [], tokens: new Map(), txs: new Map(), times: new Map() }
}

const ms = (v: unknown): number => { const t = Date.parse(str(v)); return Number.isFinite(t) ? t : 0 }

function pushTransfer(s: Seen, t: TransferLog) {
  s.transfers.push(t)
}

/** Reads one page of one feed into `s`. Returns the oldest block on the page. */
export function readItems(s: Seen, feed: Feed, items: Json[]): number {
  let oldest = Number.MAX_SAFE_INTEGER
  for (const it of items) {
    const hash = str(it.hash) || str(it.transaction_hash) || str(it.tx_hash)
    const block = num(it.block_number ?? it.block)
    if (!hash) continue
    if (block) oldest = Math.min(oldest, block)
    const at = ms(it.timestamp)
    if (at) s.times.set(hash.toLowerCase(), at)

    if (feed === 'token-transfers') {
      const token = obj(it.token)
      const total = obj(it.total)
      let address = str(token.address_hash) || str(token.address)
      let decimals = num(total.decimals ?? token.decimals)
      let value = big(total.value ?? it.value)
      if (!/^0x[0-9a-fA-F]{40}$/.test(address) || value === 0n) continue
      // Arc logs every USDC move from a system address in 18 decimals; it is the same coin.
      if (same(address, SYSTEM_EMITTER)) { address = USDC_ERC20; value /= NATIVE_PER_ERC20_UNIT; decimals = 6; if (value === 0n) continue }
      address = getAddress(address.toLowerCase())
      const symbol = str(token.symbol) || (same(address, USDC_ERC20) ? 'USDC' : 'TOKEN')
      if (!s.tokens.has(address.toLowerCase())) s.tokens.set(address.toLowerCase(), { symbol: symbol.slice(0, 12), address, decimals })
      pushTransfer(s, {
        txHash: hash, blockNumber: BigInt(block), token: address,
        from: hashOf(it.from) || zeroAddress, to: hashOf(it.to) || zeroAddress, value,
      })
    } else if (feed === 'internal-transactions') {
      const value = big(it.value) / NATIVE_PER_ERC20_UNIT
      if (value === 0n || it.success === false || str(it.error)) continue
      pushTransfer(s, { txHash: hash, blockNumber: BigInt(block), token: USDC_ERC20, from: hashOf(it.from), to: hashOf(it.to), value })
    } else {
      const failed = str(it.status) === 'error' || (str(it.result) !== '' && str(it.result) !== 'success')
      const value = big(it.value)
      const from = hashOf(it.from)
      const to = hashOf(it.to) || hashOf(it.created_contract)
      s.txs.set(hash.toLowerCase(), { block, at, failed, from, to, method: str(it.method), value, note: noteOf(it) })
      if (!failed && value / NATIVE_PER_ERC20_UNIT > 0n && to) {
        pushTransfer(s, { txHash: hash, blockNumber: BigInt(block), token: USDC_ERC20, from, to, value: value / NATIVE_PER_ERC20_UNIT })
      }
    }
  }
  return oldest === Number.MAX_SAFE_INTEGER ? 0 : oldest
}

/** The memo (or tipped post) of a payment made through a contract, from the explorer's decoded call. */
function noteOf(tx: Json): string | undefined {
  const params = obj(tx.decoded_input).parameters
  if (!Array.isArray(params)) return undefined
  const p = (params as Json[]).find((x) => str(x.name) === 'memo' || str(x.name) === 'postId')
  const v = p ? str(p.value).trim() : ''
  if (v) return v.slice(0, 280)
  return str(obj(tx.decoded_input).method_call).startsWith('tip(') ? 'Tip' : undefined
}

function dedupe(list: TransferLog[]): TransferLog[] {
  const seen = new Set<string>()
  return list.filter((t) => {
    const k = `${t.txHash.toLowerCase()}|${t.token.toLowerCase()}|${t.from.toLowerCase()}|${t.to.toLowerCase()}|${t.value}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const METHOD_LABELS: Record<string, string> = {
  approve: 'Approval', permit: 'Approval', multicall: 'Contract call', transfer: 'Transfer', transferFrom: 'Transfer',
  mint: 'Mint', burn: 'Burn', deposit: 'Deposit', withdraw: 'Withdraw', claim: 'Claim', swap: 'Swap',
}
/** A short label for a call, taken from its method name. */
export function methodLabel(method: string): string {
  const m = method.trim()
  if (!m) return 'Contract interaction'
  const clean = m.replace(/\(.*$/, '').trim()
  const known = METHOD_LABELS[clean] ?? METHOD_LABELS[clean.toLowerCase()]
  if (known) return known
  const words = clean.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * Describes everything seen for transactions in blocks above `aboveBlock` (older blocks may
 * still be arriving). Returns one record per transaction that involves the wallet.
 */
export function buildRecords(me: string, s: Seen, aboveBlock: number, skip: Set<string>): Omit<TxRecord, 'id'>[] {
  const transfers = dedupe(s.transfers).filter((t) => Number(t.blockNumber) > aboveBlock && !skip.has(t.txHash.toLowerCase()))
  const tokens = [...s.tokens.values()]
  if (!tokens.some((t) => same(t.address, USDC_ERC20))) tokens.push({ symbol: 'USDC', address: USDC_ERC20, decimals: 6 })
  const out: Omit<TxRecord, 'id'>[] = []
  const have = new Set<string>()

  const timeOf = (hash: string, block: number) => s.times.get(hash.toLowerCase()) ?? s.txs.get(hash.toLowerCase())?.at ?? block

  // 1. Anything that moved tokens or USDC
  for (const r of classifyActivity(me, transfers, [], tokens, ARC_CHAIN_ID)) {
    const key = r.txHash.toLowerCase()
    have.add(key)
    const tx = s.txs.get(key)
    // A payment made through the SocialPay contract carries its origin tag and note in the memo.
    const memo = r.kind === 'payment' ? parseMemo(tx?.note) : {}
    out.push({
      ...r,
      timestamp: timeOf(r.txHash, r.blockNumber),
      ...(memo.kind ? { kind: memo.kind } : {}),
      ...(memo.note && !r.note ? { note: memo.note } : {}),
      ...(tx?.failed ? { status: 'failed' as const } : {}),
    })
  }

  // 2. Transactions the wallet sent that moved nothing: approvals, contract calls, failures
  for (const [key, tx] of s.txs) {
    if (have.has(key) || skip.has(key) || tx.block <= aboveBlock) continue
    if (!same(tx.from, me) && !same(tx.to, me)) continue
    const sent = same(tx.from, me)
    if (!sent) continue // received something with no value and no transfer: nothing to show
    const hash = key
    const attempted = tx.value / NATIVE_PER_ERC20_UNIT
    if (tx.failed && attempted > 0n && tx.to) {
      out.push({
        txHash: hash, chainId: ARC_CHAIN_ID, status: 'failed', blockNumber: tx.block, timestamp: tx.at || tx.block,
        kind: 'payment', direction: 'sent', amount: fmt6(attempted), fromAddress: tx.from, toAddress: tx.to,
      })
      continue
    }
    out.push({
      txHash: hash, chainId: ARC_CHAIN_ID, status: tx.failed ? 'failed' : 'confirmed', blockNumber: tx.block, timestamp: tx.at || tx.block,
      kind: 'other', direction: 'sent', amount: '0', fromAddress: tx.from, toAddress: tx.to || tx.from,
      summary: methodLabel(tx.method),
    })
  }
  return out
}

function fmt6(v: bigint): string {
  const s = v.toString().padStart(7, '0')
  const whole = s.slice(0, -6)
  const frac = s.slice(-6).replace(/0+$/, '')
  return frac ? `${whole}.${frac}` : whole
}

// ── Streaming ───────────────────────────────────────────────────────────────

export interface StreamOptions {
  fetchPage: PageFetcher
  /** Called with finished records as they are ready (newest first). */
  onRecords: (records: Omit<TxRecord, 'id'>[]) => void
  /** Called after each round with how many items were read so far and the oldest block reached. */
  onProgress?: (info: { items: number; oldestBlock: number }) => void
  isCancelled?: () => boolean
  /** Stop after this many pages per feed (safety net). */
  maxPages?: number
  /** Stop once every feed has reached this block or older (for incremental refreshes). */
  stopAtBlock?: number
}

export interface StreamResult {
  /** Every feed was read to the very first transaction. */
  complete: boolean
  newestBlock: number
  count: number
}

/**
 * Reads the three feeds together, newest first, and hands over a transaction only once every
 * feed has gone past its block, so a swap's two legs are never described separately.
 */
export async function streamExplorerHistory(me: string, o: StreamOptions): Promise<StreamResult> {
  const s = emptySeen()
  const cursors = new Map<Feed, Record<string, string> | null>(FEEDS.map((f) => [f, null]))
  const finished = new Set<Feed>()
  const oldest = new Map<Feed, number>()
  const emitted = new Set<string>()
  let emittedAbove = Number.MAX_SAFE_INTEGER
  let items = 0
  let newest = 0
  let pages = 0
  const maxPages = o.maxPages ?? 600

  const flush = (above: number) => {
    const recs = buildRecords(me, s, above, emitted)
    if (recs.length === 0) { emittedAbove = Math.min(emittedAbove, above); return }
    for (const r of recs) emitted.add(r.txHash.toLowerCase())
    for (const r of recs) newest = Math.max(newest, r.blockNumber ?? 0)
    emittedAbove = Math.min(emittedAbove, above)
    o.onRecords(recs)
  }

  while (finished.size < FEEDS.length && pages < maxPages) {
    if (o.isCancelled?.()) return { complete: false, newestBlock: newest, count: emitted.size }
    const active = FEEDS.filter((f) => !finished.has(f))
    const results = await Promise.all(active.map(async (f) => ({ f, page: await o.fetchPage(f, me, cursors.get(f) ?? null) })))
    pages++
    for (const { f, page } of results) {
      items += page.items.length
      const low = readItems(s, f, page.items)
      if (low) oldest.set(f, low)
      cursors.set(f, page.next)
      if (!page.next || page.items.length === 0) finished.add(f)
    }
    // Everything above the highest "oldest block" among unfinished feeds is complete.
    const open = FEEDS.filter((f) => !finished.has(f))
    const frontier = open.length ? Math.max(...open.map((f) => oldest.get(f) ?? 0)) : 0
    flush(frontier)
    o.onProgress?.({ items, oldestBlock: frontier || Math.min(...[...oldest.values(), Number.MAX_SAFE_INTEGER]) })
    if (o.stopAtBlock !== undefined && open.length > 0 && frontier < o.stopAtBlock) break
  }
  const complete = finished.size === FEEDS.length
  if (complete) flush(0)
  return { complete, newestBlock: newest, count: emitted.size }
}
