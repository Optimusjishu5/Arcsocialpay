'use client'

// Fills the payment, swap and bridge history from the chain itself, so it shows up on
// any browser or device (the app's own saved history only exists where you used it).
// It reads the newest days first, then keeps reading further back in the background
// until the whole history of the wallet is covered. Arc's RPC limits both the block
// range and the result size, so the scan runs in small windows.

import { useEffect, useSyncExternalStore } from 'react'
import { usePublicClient } from 'wagmi'
import type { PublicClient } from 'viem'
import { ARC_CHAIN_ID } from '../chains'
import { appStore } from '../store/appStore'
import { BLOCKS_PER_DAY, scanRange } from '../lib/onchainActivity'
import { appendCachedRecords, loadCachedRecords, type CachedRecord } from '../lib/activityCache'
import { UNI_TOKENS } from '../lib/uniswapArc'
import { isSocialPayConfigured, SOCIAL_PAY_ADDRESS } from '../contracts/arcSocialPay'

interface ScanState {
  /** Oldest and newest block already covered for this wallet (one unbroken range). */
  lowest: number
  highest: number
}

const KEY = (addr: string) => `socialpay:scan:v2:${addr.toLowerCase()}`
/** Each step of the scan covers this many days. */
const CHUNK_DAYS = 2
const RESYNC_MS = 30_000
const RETRY_MS = 15_000

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

function saveScan(addr: string, s: ScanState): void {
  try { localStorage.setItem(KEY(addr), JSON.stringify(s)) } catch { /* storage unavailable */ }
}

export interface Status {
  /** A scan step is running right now. */
  scanning: boolean
  /** 0 to 1 within the current step. */
  progress: number
  /** How many days back the history reaches. */
  daysCovered: number
  /** 0 to 1: how much of the chain's history has been read for this wallet. */
  coverage: number
  /** The scan reached the start of the chain: nothing older exists. */
  complete: boolean
  /** The user paused reading older history. */
  paused: boolean
  /** The last step stopped early (network trouble) and will retry on its own. */
  incomplete: boolean
  /** Newest transaction found by the chain scan in this session. */
  lastSyncedAt: number
}

const INITIAL: Status = {
  scanning: false, progress: 0, daysCovered: 0, coverage: 0, complete: false, paused: false, incomplete: false, lastSyncedAt: 0,
}

// One scan runs for the whole app (mounted in App); pages read its progress from here.
let status: Status = INITIAL
const listeners = new Set<() => void>()
interface Controls { sync: () => void; pause: () => void; resume: () => void }
let controls: Controls | null = null

function setStatus(patch: Partial<Status>) {
  status = { ...status, ...patch }
  listeners.forEach((l) => l())
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l) } }

export function useOnchainStatus(): Status & { pause: () => void; resume: () => void; loadOlder: () => void; rescan: () => void } {
  const st = useSyncExternalStore(subscribe, () => status, () => status)
  return {
    ...st,
    pause: () => controls?.pause(),
    resume: () => controls?.resume(),
    loadOlder: () => controls?.resume(),
    rescan: () => controls?.sync(),
  }
}

/** Mount once in App: reads the wallet's history from the chain and merges it into the app's history. */
export function useOnchainActivity(address: string | undefined): void {
  const client = usePublicClient({ chainId: ARC_CHAIN_ID }) as PublicClient | undefined

  useEffect(() => {
    if (!address || !client) return
    const me = address
    const rpc = client
    const ctx = { cancelled: false, running: false, forwardDue: false, paused: false }
    const day = BigInt(BLOCKS_PER_DAY)
    const span = day * BigInt(CHUNK_DAYS)
    const social = isSocialPayConfigured() ? SOCIAL_PAY_ADDRESS : null
    let head = 0n
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    // Start from a clean status for this wallet and show what earlier visits already found.
    const cached = loadCachedRecords(me)
    if (cached.length) appStore.mergeTxRecords(cached)
    const reportCoverage = () => {
      const s = loadScan(me)
      if (!s) { setStatus({ ...INITIAL, paused: ctx.paused }); return }
      const h = Number(head) || s.highest
      setStatus({
        daysCovered: Math.max(1, Math.round((h - s.lowest) / BLOCKS_PER_DAY)),
        coverage: h > 0 ? Math.min(1, (h - s.lowest) / h) : 0,
        complete: s.lowest <= 0,
      })
    }
    reportCoverage()

    /** Scans one block range. Returns the lowest block that was really covered. */
    async function scan(from: bigint, to: bigint): Promise<bigint> {
      const { scannedLow } = await scanRange(
        rpc, me, UNI_TOKENS, social, from, to, ARC_CHAIN_ID,
        (done, total) => { if (!ctx.cancelled) setStatus({ progress: Number(done) / Number(total || 1n) }) },
        (batch: CachedRecord[]) => {
          if (ctx.cancelled) return
          appStore.mergeTxRecords(batch)
          appendCachedRecords(me, batch)
        },
      )
      return scannedLow
    }

    /** Newest blocks: everything since the last scan (or the first days on a new device). */
    async function forward(): Promise<boolean> {
      head = await rpc.getBlockNumber()
      const saved = loadScan(me)
      if (!saved) {
        const from = head - span + 1n > 0n ? head - span + 1n : 0n
        const low = await scan(from, head)
        if (low <= head) saveScan(me, { lowest: Number(low), highest: Number(head) })
        reportCoverage()
        return low <= from
      }
      // Walk the gap oldest to newest so every finished step is kept, even if a later one fails.
      let cursor = BigInt(saved.highest) + 1n
      while (cursor <= head && !ctx.cancelled) {
        const to = cursor + span - 1n < head ? cursor + span - 1n : head
        const low = await scan(cursor, to)
        if (low > cursor) return false
        saveScan(me, { lowest: saved.lowest, highest: Number(to) })
        saved.highest = Number(to)
        cursor = to + 1n
        reportCoverage()
      }
      return true
    }

    /** One step further back in time. Returns false when the step stopped early. */
    async function older(): Promise<boolean> {
      const saved = loadScan(me)
      if (!saved) return false
      const to = BigInt(saved.lowest) - 1n
      if (to < 0n) return true
      const from = to - span + 1n > 0n ? to - span + 1n : 0n
      const low = await scan(from, to)
      if (low <= to) saveScan(me, { lowest: Math.min(saved.lowest, Number(low)), highest: saved.highest })
      reportCoverage()
      return low <= from
    }

    async function run(): Promise<void> {
      if (ctx.running) { ctx.forwardDue = true; return }
      ctx.running = true
      setStatus({ scanning: true, progress: 0, incomplete: false })
      let failed = false
      try {
        if (!(await forward())) failed = true
        while (!failed && !ctx.cancelled && !ctx.paused) {
          const saved = loadScan(me)
          if (!saved || saved.lowest <= 0) break
          if (ctx.forwardDue) {
            ctx.forwardDue = false
            if (!(await forward())) { failed = true; break }
          }
          setStatus({ progress: 0 })
          if (!(await older())) failed = true
        }
        if (!ctx.cancelled) setStatus({ lastSyncedAt: Date.now() })
      } catch {
        failed = true
      } finally {
        ctx.running = false
        if (!ctx.cancelled) {
          setStatus({ scanning: false, incomplete: failed, progress: failed ? status.progress : 1 })
          if (failed) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { void run() }, RETRY_MS) }
        }
      }
    }

    controls = {
      sync: () => { void run() },
      pause: () => { ctx.paused = true; setStatus({ paused: true }) },
      resume: () => { ctx.paused = false; setStatus({ paused: false }); void run() },
    }
    setStatus({ paused: false, incomplete: false })
    void run()
    // Pick up new activity from other tabs and devices.
    const iv = setInterval(() => { void run() }, RESYNC_MS)
    return () => {
      ctx.cancelled = true
      clearInterval(iv)
      clearTimeout(retryTimer)
      controls = null
    }
  }, [address, client])
}
