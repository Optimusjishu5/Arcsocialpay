'use client'

// Fills the payment, swap and bridge history from the chain itself, so it shows up on
// any browser or device (the app's own saved history only exists where you used it).
// Scans Arc in small windows: the RPC limits both the block range and the result size.

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { ARC_CHAIN_ID } from '../chains'
import { appStore } from '../store/appStore'
import { BLOCKS_PER_DAY, scanRange } from '../lib/onchainActivity'
import { UNI_TOKENS } from '../lib/uniswapArc'
import { isSocialPayConfigured, SOCIAL_PAY_ADDRESS } from '../contracts/arcSocialPay'

interface ScanState {
  /** Oldest and newest block already covered for this wallet. */
  lowest: number
  highest: number
}

const KEY = (addr: string) => `socialpay:scan:v2:${addr.toLowerCase()}`
/** First visit looks back this far, and each "Load older" goes back this much more. */
const FIRST_SCAN_DAYS = 2
const MAX_CATCH_UP_DAYS = 14
const MAX_RECORDS_PER_SCAN = 400

function loadScan(addr: string): ScanState | null {
  try {
    const raw = localStorage.getItem(KEY(addr))
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<ScanState>
    return typeof p.lowest === 'number' && typeof p.highest === 'number' ? { lowest: p.lowest, highest: p.highest } : null
  } catch {
    return null
  }
}

interface Status {
  scanning: boolean
  /** 0 to 1 while a scan runs. */
  progress: number
  /** How many days back the saved history reaches. */
  daysCovered: number
  /** True when the last scan stopped early (RPC trouble) and will resume on its own. */
  incomplete: boolean
}

// One scan runs for the whole app (mounted in App); pages read its progress from here.
let status: Status = { scanning: false, progress: 0, daysCovered: 0, incomplete: false }
const listeners = new Set<() => void>()
let runner: ((mode: 'auto' | 'older') => void) | null = null

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useOnchainStatus(): Status & { loadOlder: () => void; rescan: () => void } {
  const st = useSyncExternalStore(subscribe, () => status, () => status)
  return { ...st, loadOlder: () => runner?.('older'), rescan: () => runner?.('auto') }
}

/** Mount once in App: reads the wallet's history from the chain and merges it into the app's history. */
export function useOnchainActivity(address: string | undefined): void {
  const client = usePublicClient({ chainId: ARC_CHAIN_ID }) as PublicClient | undefined
  const running = useRef(false)
  const headRef = useRef<bigint>(0n)

  const run = useCallback(
    async (mode: 'auto' | 'older') => {
      if (!client || !address || running.current) return
      running.current = true
      setStatus({ scanning: true, progress: 0, incomplete: false })
      try {
        const head = await client.getBlockNumber()
        headRef.current = head
        const saved = loadScan(address)
        const day = BigInt(BLOCKS_PER_DAY)
        const span = day * BigInt(FIRST_SCAN_DAYS)
        let from: bigint
        let to: bigint
        if (mode === 'older' && saved) {
          to = BigInt(saved.lowest) - 1n
          from = to - span + 1n
        } else if (saved) {
          to = head
          const gapStart = BigInt(saved.highest) + 1n
          const floor = head - day * BigInt(MAX_CATCH_UP_DAYS)
          from = gapStart > floor ? gapStart : floor
        } else {
          to = head
          from = head - span + 1n
        }
        if (from < 0n) from = 0n
        if (from > to) return

        const social = isSocialPayConfigured() ? SOCIAL_PAY_ADDRESS : null
        const { scannedLow } = await scanRange(
          client, address, UNI_TOKENS, social, from, to, ARC_CHAIN_ID,
          (done, total) => setStatus({ progress: Number(done) / Number(total || 1n) }),
          (batch) => { appStore.mergeTxRecords(batch.slice(0, MAX_RECORDS_PER_SCAN)) },
        )

        const complete = scannedLow <= from
        // Coverage must stay one unbroken block range. A catch-up scan that stopped early
        // would leave a hole, so it is simply repeated next time (duplicates are ignored).
        let next: ScanState | null = null
        if (scannedLow <= to) {
          if (!saved) next = { lowest: Number(scannedLow), highest: Number(to) }
          else if (mode === 'older') next = { lowest: Math.min(saved.lowest, Number(scannedLow)), highest: saved.highest }
          else if (complete) next = { lowest: saved.lowest, highest: Math.max(saved.highest, Number(to)) }
        }
        if (next) {
          localStorage.setItem(KEY(address), JSON.stringify(next))
          setStatus({ daysCovered: Math.max(1, Math.round((Number(head) - next.lowest) / BLOCKS_PER_DAY)) })
        }
        setStatus({ incomplete: !complete, progress: 1 })
      } catch {
        setStatus({ incomplete: true })
      } finally {
        running.current = false
        setStatus({ scanning: false })
      }
    },
    [client, address],
  )

  useEffect(() => {
    if (!address || !client) return
    runner = (mode) => { void run(mode) }
    void run('auto')
    // Pick up new activity from other tabs and devices every minute.
    const iv = setInterval(() => { void run('auto') }, 60_000)
    return () => { clearInterval(iv); runner = null }
  }, [address, client, run])
}
