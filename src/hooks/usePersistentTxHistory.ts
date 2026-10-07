'use client'

// ── Turso-backed persistent payment history (Next.js App Router) ─────────────
// Same pattern as usePersistentChat: local appStore stays the realtime source
// of truth; this hook syncs wallet tx history (normal pay, wallet sends, tips)
// so it renders correctly across reloads and devices when Turso is configured.

import { useEffect, useRef } from 'react'
import { appStore } from '@/store/appStore'
import type { TxRecord } from '@/types/index'

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function toRecord(raw: unknown): TxRecord | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.txHash !== 'string') return null
  return {
    id: typeof r.id === 'string' ? r.id : r.txHash,
    txHash: r.txHash,
    chainId: typeof r.chainId === 'number' ? r.chainId : 5042,
    direction: r.direction === 'received' ? 'received' : 'sent',
    amount: String(r.amount ?? ''),
    fromAddress: String(r.fromAddress ?? ''),
    toAddress: String(r.toAddress ?? ''),
    status: (r.status as TxRecord['status']) ?? 'pending',
    timestamp: typeof r.timestamp === 'number' ? r.timestamp : Date.now(),
    note: typeof r.note === 'string' ? r.note : undefined,
    blockNumber: typeof r.blockNumber === 'number' ? r.blockNumber : undefined,
  }
}

export function usePersistentTxHistory(address: string | undefined) {
  const hydratedFor = useRef<string | null>(null)
  // Records mutate (pending → confirmed), so track last-sent snapshots.
  const sent = useRef<Map<string, string>>(new Map())

  const pull = async (): Promise<boolean> => {
    if (!address) return false
    try {
      const res = await fetch(`/api/tx-history?address=${encodeURIComponent(address)}&limit=200`)
      if (!res.ok) return false
      const json = await safeJson(res)
      if (json.configured === false) return false
      const records = Array.isArray(json.records)
        ? (json.records as unknown[]).map(toRecord).filter((r): r is TxRecord => !!r)
        : []
      appStore.importTxRecords(records, new Set(sent.current.keys()))
      for (const r of records) sent.current.set(r.txHash.toLowerCase(), JSON.stringify(r))
      return true
    } catch {
      return false
    }
  }

  // 1) Hydrate on connect
  useEffect(() => {
    if (!address) return
    if (hydratedFor.current === address.toLowerCase()) return
    hydratedFor.current = address.toLowerCase()
    let cancelled = false
    void (async () => {
      const ok = await pull()
      if (!ok || cancelled) return
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address])

  // 2) Write-through: POST new/changed records (status flips re-POST on change)
  useEffect(() => {
    if (!address) return
    const sync = () => {
      void (async () => {
        try {
          const { txHistory } = appStore.getState()
          for (const record of txHistory.slice(0, 200)) {
            const key = record.txHash.toLowerCase()
            const snap = JSON.stringify(record)
            if (sent.current.get(key) === snap) continue
            sent.current.set(key, snap)
            await fetch('/api/tx-history', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(record),
            }).catch(() => {
              sent.current.delete(key)
            })
          }
        } catch {
          // best-effort only
        }
      })()
    }
    const iv = setInterval(sync, 2000)
    return () => clearInterval(iv)
  }, [address])

  // 3) Incoming: poll so records confirmed on another device converge here
  useEffect(() => {
    if (!address) return
    let disabled = false
    let inFlight = false
    const tick = () => {
      if (disabled || inFlight) return
      inFlight = true
      void (async () => {
        try {
          const res = await fetch(
            `/api/tx-history?address=${encodeURIComponent(address)}&limit=200`,
          )
          if (!res.ok) return
          const json = await safeJson(res)
          if (json.configured === false) {
            disabled = true
            return
          }
          const records = Array.isArray(json.records)
            ? (json.records as unknown[]).map(toRecord).filter((r): r is TxRecord => !!r)
            : []
          appStore.importTxRecords(records, new Set(sent.current.keys()))
          for (const r of records) sent.current.set(r.txHash.toLowerCase(), JSON.stringify(r))
        } catch {
          // offline — retry on next tick
        } finally {
          inFlight = false
        }
      })()
    }
    tick()
    const iv = setInterval(tick, 4000)
    return () => clearInterval(iv)
  }, [address])
}
