// Keeps every transaction read from the chain in its own per-wallet cache, so a long
// history survives reloads without being squeezed into the app's shared saved state.

import type { TxRecord } from '../types/index'

export type CachedRecord = Omit<TxRecord, 'id'>

const KEY = (addr: string) => `socialpay:chaintx:v1:${addr.toLowerCase()}`
const MAX_CACHED = 20_000

function read(addr: string): CachedRecord[] {
  try {
    const raw = localStorage.getItem(KEY(addr))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as CachedRecord[]).filter((r) => r && typeof r.txHash === 'string') : []
  } catch {
    return []
  }
}

export function loadCachedRecords(addr: string): CachedRecord[] {
  return read(addr)
}

/** Adds records to the wallet's cache (newest first, de-duplicated by hash). */
export function appendCachedRecords(addr: string, records: CachedRecord[]): void {
  if (records.length === 0) return
  try {
    const byHash = new Map<string, CachedRecord>()
    for (const r of read(addr)) byHash.set(r.txHash.toLowerCase(), r)
    for (const r of records) byHash.set(r.txHash.toLowerCase(), r)
    const list = [...byHash.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_CACHED)
    localStorage.setItem(KEY(addr), JSON.stringify(list))
  } catch {
    // Storage full or unavailable: the records are still in memory for this session.
  }
}
