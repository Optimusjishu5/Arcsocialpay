// Permanent per-wallet store for transactions read from the chain, kept in the browser's
// IndexedDB (room for hundreds of thousands of entries, unlike localStorage's ~5 MB) together
// with how far back the wallet has been scanned. Records and scan progress live in the same
// database, so "scanned" can never outlive the records it refers to.

import { useSyncExternalStore } from 'react'
import type { TxRecord } from '../types/index'

export type CachedRecord = Omit<TxRecord, 'id'>

export interface ScanState {
  /** Oldest and newest block already covered for this wallet (one unbroken range). */
  lowest: number
  highest: number
}

const DB_NAME = 'socialpay-activity'
const TX_STORE = 'tx'
const SCAN_STORE = 'scan'
/** Bump to force every wallet to be scanned again from scratch. */
const SCAN_VERSION = 3

const lower = (s: string) => s.toLowerCase()

// ── In-memory view (what the Activity tab reads) ────────────────────────────

const memory = new Map<string, Map<string, CachedRecord>>()
const snapshots = new Map<string, CachedRecord[]>()
const EMPTY: CachedRecord[] = []
const listeners = new Set<() => void>()
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }
const notify = () => listeners.forEach((l) => l())

function rebuild(addr: string) {
  const m = memory.get(addr)
  snapshots.set(addr, m ? [...m.values()].sort((a, b) => b.timestamp - a.timestamp) : EMPTY)
}

/** Everything that is shown for a record, so an updated copy replaces an outdated one. */
const sig = (r: CachedRecord) =>
  [r.status, r.timestamp, r.blockNumber, r.amount, r.symbol, r.kind, r.note, r.summary, r.direction, r.fromAddress, r.toAddress].join('|')

function putMemory(addr: string, records: CachedRecord[]): boolean {
  let m = memory.get(addr)
  if (!m) { m = new Map(); memory.set(addr, m) }
  let changed = false
  for (const r of records) {
    const key = lower(r.txHash)
    const prev = m.get(key)
    if (prev && sig(prev) === sig(r)) continue
    m.set(key, r)
    changed = true
  }
  if (changed) rebuild(addr)
  return changed
}

/** Everything cached for the wallet right now, newest first (outside React). */
export function getCachedRecords(address: string): CachedRecord[] {
  return snapshots.get(lower(address)) ?? EMPTY
}

/** Every transaction cached for the wallet, newest first. Updates live while a scan runs. */
export function useCachedRecords(address: string | undefined): CachedRecord[] {
  return useSyncExternalStore(
    subscribe,
    () => (address ? snapshots.get(lower(address)) ?? EMPTY : EMPTY),
    () => EMPTY,
  )
}

// ── IndexedDB ───────────────────────────────────────────────────────────────

let dbPromise: Promise<IDBDatabase | null> | null = null
/** Record writes that have not finished yet. Scan progress is only saved once they all succeeded. */
const inflight = new Set<Promise<boolean>>()
let writeFailed = false

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        const tx = db.createObjectStore(TX_STORE, { keyPath: 'k' })
        tx.createIndex('addr', 'addr')
        db.createObjectStore(SCAN_STORE, { keyPath: 'addr' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function done(tx: IDBTransaction): Promise<boolean> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve(true)
    tx.onerror = () => resolve(false)
    tx.onabort = () => resolve(false)
  })
}

async function writeRecords(addr: string, records: CachedRecord[]): Promise<boolean> {
  const db = await openDb()
  if (!db || records.length === 0) return !!db
  try {
    const tx = db.transaction(TX_STORE, 'readwrite')
    const store = tx.objectStore(TX_STORE)
    for (const r of records) store.put({ ...r, k: `${addr}:${lower(r.txHash)}`, addr })
    return await done(tx)
  } catch {
    return false
  }
}

/** True when records can be kept across reloads (false in private windows that block IndexedDB). */
export async function isPersistent(): Promise<boolean> {
  return (await openDb()) !== null
}

// Older versions kept a smaller copy in localStorage: fold it in once, remove it only after it is safely stored.
const legacyKeys = (addr: string) => [`socialpay:chaintx:v1:${addr}`, `socialpay:scan:v2:${addr}`] // old coverage did not include native USDC sends
function removeLegacy(addr: string) {
  try { for (const k of legacyKeys(addr)) localStorage.removeItem(k) } catch { /* ignore */ }
}
function readLegacyRecords(addr: string): CachedRecord[] {
  try {
    const raw = localStorage.getItem(`socialpay:chaintx:v1:${addr}`)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CachedRecord[]).filter((r) => r && typeof r.txHash === 'string') : []
  } catch {
    return []
  }
}

/** Loads a wallet's saved transactions into memory and returns where its last scan got to. */
export async function loadWallet(address: string): Promise<ScanState | null> {
  const addr = lower(address)
  const db = await openDb()
  const legacy = readLegacyRecords(addr)
  let scan: ScanState | null = null
  if (db) {
    try {
      const tx = db.transaction([TX_STORE, SCAN_STORE], 'readonly')
      // Both reads are issued before waiting, so the transaction never sits idle between them.
      const recsReq = tx.objectStore(TX_STORE).index('addr').getAll(addr)
      const stReq = tx.objectStore(SCAN_STORE).get(addr)
      const finished = done(tx)
      await finished
      const recs = (recsReq.result ?? []) as CachedRecord[]
      const st = stReq.result as (ScanState & { v?: number }) | undefined
      putMemory(addr, recs)
      if (st && st.v === SCAN_VERSION && typeof st.lowest === 'number' && typeof st.highest === 'number') {
        scan = { lowest: st.lowest, highest: st.highest }
      }
    } catch {
      // start from nothing: the wallet is simply scanned again
    }
  }
  if (legacy.length) {
    putMemory(addr, legacy)
    if (await writeRecords(addr, legacy)) removeLegacy(addr)
  } else if (db) {
    removeLegacy(addr)
  }
  notify()
  return scan
}

/** Adds records to the wallet's saved history (de-duplicated by hash) and shows them right away. */
export function appendCachedRecords(address: string, records: CachedRecord[]): void {
  if (records.length === 0) return
  const addr = lower(address)
  if (putMemory(addr, records)) notify()
  const write = writeRecords(addr, records)
  inflight.add(write)
  void write.then((ok) => { if (!ok) writeFailed = true }).finally(() => inflight.delete(write))
}

/**
 * Saves how far back the wallet has been scanned, but only after every record found so far is
 * safely stored. Returns false (and saves nothing) when records can't be kept.
 */
export async function saveScanState(address: string, state: ScanState): Promise<boolean> {
  const writes = await Promise.all([...inflight])
  if (writeFailed || writes.some((ok) => !ok)) return false
  const db = await openDb()
  if (!db) return false
  try {
    const tx = db.transaction(SCAN_STORE, 'readwrite')
    tx.objectStore(SCAN_STORE).put({ addr: lower(address), v: SCAN_VERSION, ...state })
    return await done(tx)
  } catch {
    return false
  }
}
