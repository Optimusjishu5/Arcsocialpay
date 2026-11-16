'use client'

// Fills the payment, swap and bridge history from the chain itself, so it shows up on
// any browser or device (the app's own saved history only exists where you used it).
// It reads the newest days first (fast), then keeps reading further back in the background
// until the whole history of the wallet is covered. Everything found is stored permanently
// in the browser (see lib/activityCache), together with how far back the scan has got.

import { useEffect, useSyncExternalStore } from 'react'
import { usePublicClient } from 'wagmi'
import { createPublicClient, http, type PublicClient } from 'viem'
import { ARC_CHAIN_ID } from '../chains'
import { appStore } from '../store/appStore'
import type { TxRecord } from '../types/index'
import { addPaymentNotes, applyKnownChecks, BLOCKS_PER_DAY, FAST_RPC_URL, isFastDown, markFastClient, markFastDown, recordsFromReceipt, scanRange } from '../lib/onchainActivity'
import { appendCachedRecords, getCachedRecords, isPersistent, loadWallet, saveScanState, type CachedRecord, type ScanState } from '../lib/activityCache'
import { UNI_TOKENS } from '../lib/uniswapArc'
import { discoverScanTokens, knownScanTokens } from '../lib/scanTokens'
import type { ScanToken } from '../lib/onchainActivity'
import { makeFetcher, streamExplorerHistory, type SourceStatus } from '../lib/explorerHistory'
import { isSocialPayConfigured, SOCIAL_PAY_ADDRESS } from '../contracts/arcSocialPay'

/** Each step of the scan covers this many days. */
const CHUNK_DAYS = 2
/** New blocks are checked this often, so a new transaction appears within a few seconds. */
const LIVE_MS = 2_000
/** Records from the explorer are applied together at most this often (ms). */
const FLUSH_MS = 250
/** How often the explorer is asked for anything new (ms). */
const EXPLORER_POLL_MS = 8_000
const RETRY_MS = 15_000
/** Every so often the newest blocks are read again, in case a node answered before it had all their logs. */
const RECHECK_BLOCKS = 600n
const RECHECK_EVERY_TICKS = 15
/** A new transaction is looked up by its receipt on this schedule (ms) until the chain has it. */
const RECEIPT_DELAYS = [0, 300, 600, 1_000, 1_500, 2_000, 3_000, 4_000, 6_000, 8_000, 12_000, 15_000, 20_000]
const lc = (s: string) => s.toLowerCase()

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
  /** The saved history survives reloads (false in private windows that block browser storage). */
  saved: boolean
  /** The saved history has been loaded, so an empty list really means nothing was found yet. */
  ready: boolean
  /** When the last scan step finished. */
  lastSyncedAt: number
  /** Where the history comes from: the Arc explorer's index (complete) or the nodes directly (slow, partial). */
  source: 'checking' | 'explorer' | 'nodes'
  /** How each explorer (Arc Explorer) answered on the last read. */
  sources: SourceStatus[]
}

const INITIAL: Status = {
  scanning: false, progress: 0, daysCovered: 0, coverage: 0, complete: false, paused: false,
  incomplete: false, saved: true, ready: false, lastSyncedAt: 0, source: 'checking', sources: [],
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

/** Mount once in App: reads the wallet's history from the chain and keeps it saved. */
export function useOnchainActivity(address: string | undefined): void {
  const client = usePublicClient({ chainId: ARC_CHAIN_ID }) as PublicClient | undefined

  useEffect(() => {
    if (!address || !client) return
    const me = address
    const rpc = client
    const ctx = { cancelled: false, backfilling: false, paused: false }
    const day = BigInt(BLOCKS_PER_DAY)
    const span = day * BigInt(CHUNK_DAYS)
    const social = isSocialPayConfigured() ? SOCIAL_PAY_ADDRESS : null
    const fast = createPublicClient({ transport: http(FAST_RPC_URL, { timeout: 5_000, retryCount: 1 }) }) as PublicClient
    markFastClient(fast)
    // The tokens the node scan watches: the Circle tokens, plus tokens this wallet holds (set in the start-up below).
    let scanTokens: ScanToken[] = UNI_TOKENS
    let head = 0n
    let saved: ScanState | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let forwarding: Promise<boolean> | null = null
    const fetchPage = makeFetcher()
    let explorerOk = false
    let explorerBusy = false
    let explorerNewest = 0

    // Records streaming in from the explorer wait here for a moment so they are applied together.
    let queue: Omit<TxRecord, 'id'>[] = []
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    let flushedOnce = false
    function flushQueue() {
      clearTimeout(flushTimer)
      flushTimer = undefined
      const batch = queue
      queue = []
      if (ctx.cancelled || batch.length === 0) return
      applyKnownChecks(batch)
      appStore.syncChainRecords(batch)
      appendCachedRecords(me, batch)
      void refineFromReceipts(batch)
    }

    /**
     * Reads the wallet's history from the Arc explorer's index. A first run reads everything;
     * later runs only the newest part. Returns true when the explorer could be used.
     */
    async function explorerSync(full: boolean): Promise<boolean> {
      if (explorerBusy || ctx.cancelled) return explorerOk
      explorerBusy = true
      try {
        const startHead = Number(await latestHead().catch(() => 0n))
        if (full) setStatus({ scanning: true, progress: 0, incomplete: false })
        const res = await streamExplorerHistory(me, {
          fetchPage,
          isCancelled: () => ctx.cancelled,
          maxPages: full ? 800 : 40,
          stopAtBlock: full ? undefined : Math.max(0, (explorerNewest || saved?.highest || startHead) - 3_000),
          onRecords: (batch) => {
            if (ctx.cancelled) return
            queue.push(...batch)
            // The first records are shown at once; after that they are handed over a few times a second,
            // so a long history streaming in does not make the list redraw on every page.
            if (!flushedOnce) { flushedOnce = true; flushQueue() } else if (!flushTimer) flushTimer = setTimeout(flushQueue, FLUSH_MS)
          },
          onProgress: ({ oldestBlock }) => {
            if (!full || ctx.cancelled || !startHead || !oldestBlock) return
            setStatus({ progress: Math.min(1, Math.max(0, 1 - oldestBlock / startHead)), daysCovered: Math.round((startHead - oldestBlock) / BLOCKS_PER_DAY) })
          },
        })
        flushQueue()
        if (ctx.cancelled) return explorerOk
        setStatus({ sources: fetchPage.status() })
        explorerOk = true
        explorerNewest = Math.max(explorerNewest, res.newestBlock)
        if (full && res.complete && startHead > 0) {
          // The explorer holds the whole history, so there is nothing older for the nodes to read.
          await remember({ lowest: 0, highest: Math.max(startHead, saved?.highest ?? 0) })
          setStatus({ scanning: false, incomplete: false, progress: 1, complete: true, coverage: 1, source: 'explorer', lastSyncedAt: Date.now() })
        } else {
          setStatus({ source: 'explorer', lastSyncedAt: Date.now(), ...(full ? { scanning: false, incomplete: !res.complete } : {}) })
        }
        return true
      } catch {
        flushQueue()
        if (!ctx.cancelled) setStatus({ sources: fetchPage.status(), ...(full ? { scanning: false } : {}) })
        return false
      } finally {
        explorerBusy = false
      }
    }

    /**
     * The explorers list a bridge out as a plain payment to a contract. The receipt shows the CCTP burn
     * (and the memo of a SocialPay payment), so those entries are read once and corrected.
     */
    async function refineFromReceipts(batch: Omit<TxRecord, 'id'>[]): Promise<void> {
      const copies = batch.filter((r) => r.chainId === ARC_CHAIN_ID).map((r) => ({ ...r }))
      for (let i = 0; i < copies.length && !ctx.cancelled; i += 60) {
        const changed = await addPaymentNotes(rpc, social, copies.slice(i, i + 60)).catch(() => [])
        if (ctx.cancelled || changed.length === 0) continue
        appStore.syncChainRecords(changed)
        appendCachedRecords(me, changed)
      }
    }

    const reportCoverage = () => {
      if (!saved) { setStatus({ daysCovered: 0, coverage: 0, complete: false }); return }
      const h = Number(head) || saved.highest
      setStatus({
        daysCovered: Math.max(1, Math.round((h - saved.lowest) / BLOCKS_PER_DAY)),
        coverage: h > 0 ? Math.min(1, (h - saved.lowest) / h) : 0,
        complete: saved.lowest <= 0,
      })
    }

    /** Remembers how far the scan got. Only the in-memory copy moves if storage is unavailable. */
    async function remember(next: ScanState): Promise<void> {
      saved = next
      reportCoverage()
      const ok = await saveScanState(me, next)
      if (!ok && !ctx.cancelled) setStatus({ saved: false })
    }

    /** Scans one block range. Returns the lowest block that was really covered. */
    async function scan(from: bigint, to: bigint): Promise<bigint> {
      const { scannedLow } = await scanRange(
        rpc, me, scanTokens, social, from, to, ARC_CHAIN_ID,
        (done, total) => { if (!ctx.cancelled && ctx.backfilling) setStatus({ progress: Number(done) / Number(total || 1n) }) },
        (batch: CachedRecord[]) => {
          if (ctx.cancelled) return
          // New transactions appear, and pending ones are corrected to the chain's exact details.
          appStore.syncChainRecords(batch)
          appendCachedRecords(me, batch)
        },
        fast, head,
      )
      return scannedLow
    }

    async function latestHead(): Promise<bigint> {
      if (!isFastDown()) {
        try { return await fast.getBlockNumber() } catch { markFastDown() }
      }
      return rpc.getBlockNumber()
    }

    /** Newest blocks: everything since the last scan (or the first days on a new device). */
    async function forward(recheck = false): Promise<boolean> {
      const h = await latestHead()
      if (saved && h <= BigInt(saved.highest) && !recheck) return true
      head = h
      if (!saved) {
        const from = head - span + 1n > 0n ? head - span + 1n : 0n
        const low = await scan(from, head)
        if (low <= head) await remember({ lowest: Number(low), highest: Number(head) })
        return low <= from
      }
      // Walk the gap oldest to newest so every finished step is kept, even if a later one fails.
      let cursor = BigInt(saved.highest) + 1n
      if (recheck) {
        const back = BigInt(saved.highest) - RECHECK_BLOCKS + 1n
        cursor = back > BigInt(saved.lowest) ? back : BigInt(saved.lowest)
        if (cursor < 0n) cursor = 0n
      }
      while (cursor <= head && !ctx.cancelled) {
        const to = cursor + span - 1n < head ? cursor + span - 1n : head
        const low = await scan(cursor, to)
        if (low > cursor) return false
        await remember({ lowest: saved.lowest, highest: Math.max(saved.highest, Number(to)) })
        cursor = to + 1n
      }
      return true
    }

    /** Checks for new blocks. One check runs at a time; callers wait for the running one. */
    function syncForward(recheck = false): Promise<boolean> {
      if (forwarding) return forwarding
      if (ctx.cancelled) return Promise.resolve(true)
      forwarding = (async () => {
        try {
          const ok = await forward(recheck)
          if (ok && !ctx.cancelled) setStatus({ lastSyncedAt: Date.now() })
          return ok
        } catch {
          return false
        } finally {
          forwarding = null
        }
      })()
      return forwarding
    }

    /** One step further back in time. Returns false when the step stopped early. */
    async function older(): Promise<boolean> {
      if (!saved) return false
      const to = BigInt(saved.lowest) - 1n
      if (to < 0n) return true
      const from = to - span + 1n > 0n ? to - span + 1n : 0n
      const low = await scan(from, to)
      if (low <= to) await remember({ lowest: Math.min(saved.lowest, Number(low)), highest: saved.highest })
      return low <= from
    }

    /** Reads older and older history in the background until the start of the chain. */
    async function backfill(): Promise<void> {
      if (ctx.backfilling || ctx.cancelled) return
      ctx.backfilling = true
      setStatus({ scanning: true, progress: 0, incomplete: false })
      let failed = false
      try {
        if (!saved && !(await syncForward())) failed = true
        while (!failed && !ctx.cancelled && !ctx.paused) {
          if (!saved || saved.lowest <= 0) break
          setStatus({ progress: 0 })
          if (!(await older())) failed = true
        }
      } catch {
        failed = true
      } finally {
        ctx.backfilling = false
        if (!ctx.cancelled) {
          setStatus({ scanning: false, incomplete: failed, progress: failed ? status.progress : 1 })
          if (failed) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { void backfill() }, RETRY_MS) }
        }
      }
    }

    // ── A new transaction shows up at once ─────────────────────────────────────
    // The moment the app knows about a transaction of this wallet (sent here, or still pending), its
    // receipt is read directly, so the entry appears with its real details as soon as the network
    // confirms it. The regular block reading below still runs and confirms the same entry.
    const ingesting = new Set<string>()
    const lastTry = new Map<string, number>()
    const isCached = (hash: string) => getCachedRecords(me).some((r) => lc(r.txHash) === lc(hash))
    async function ingest(hash: string): Promise<void> {
      const key = lc(hash)
      if (ingesting.has(key)) return
      ingesting.add(key)
      lastTry.set(key, Date.now())
      try {
        for (const delay of RECEIPT_DELAYS) {
          if (delay) await new Promise((r) => setTimeout(r, delay))
          if (ctx.cancelled) return
          if (isCached(hash)) return
          const recs = await recordsFromReceipt(rpc, fast, me, hash, scanTokens, social, ARC_CHAIN_ID).catch(() => null)
          if (ctx.cancelled) return
          if (recs === null) continue
          if (recs.length) {
            appStore.syncChainRecords(recs)
            appendCachedRecords(me, recs)
          }
          void syncForward()
          // A moment later the explorer has described it too (swap and bridge legs in tokens the node scan does not watch).
          if (explorerOk) setTimeout(() => { if (!ctx.cancelled) void explorerSync(false) }, 3_000)
          return
        }
      } finally {
        ingesting.delete(key)
      }
      // The receipt never showed up: the block reading below will find it, or the app marks it dropped.
      void syncForward(true)
    }
    function watchStore() {
      const now = Date.now()
      for (const t of appStore.getState().txHistory) {
        if (t.chainId !== ARC_CHAIN_ID) continue
        if (lc(t.fromAddress) !== lc(me) && lc(t.toAddress) !== lc(me)) continue
        const fresh = t.status === 'pending' || (t.status === 'confirmed' && now - t.timestamp < 10 * 60_000)
        const key = lc(t.txHash)
        if (!fresh || ingesting.has(key) || now - (lastTry.get(key) ?? 0) < 30_000) continue
        void ingest(t.txHash)
      }
    }

    controls = {
      sync: () => { void syncForward(true); void backfill() },
      pause: () => { ctx.paused = true; setStatus({ paused: true }) },
      resume: () => { ctx.paused = false; setStatus({ paused: false }); void backfill() },
    }

    setStatus({ ...INITIAL, paused: false })
    let unsubscribe: (() => void) | undefined
    let iv: ReturnType<typeof setInterval> | undefined
    let xv: ReturnType<typeof setInterval> | undefined
    const wake = () => { if (document.visibilityState === 'visible') void syncForward(true) }
    void (async () => {
      // Show what earlier visits already found before the first network call.
      const [state, persistent] = await Promise.all([loadWallet(me), isPersistent()])
      if (ctx.cancelled) return
      // Tokens remembered for this wallet are watched from the first read; tokens it holds now are found in the background.
      scanTokens = knownScanTokens(me)
      void discoverScanTokens(rpc, me).then((t) => { if (!ctx.cancelled) scanTokens = t }).catch(() => undefined)
      saved = state
      // The Dashboard and Pay history read the app's own list: give it the newest saved items.
      appStore.syncChainRecords(getCachedRecords(me).slice(0, 200))
      // Entries saved by an earlier version may list a bridge out as a plain payment: check them once.
      void refineFromReceipts(getCachedRecords(me).filter((r) => r.kind === 'payment' && r.direction === 'sent').slice(0, 400))
      setStatus({ ready: true, saved: persistent })
      reportCoverage()
      // The newest days are read at once, in parallel with everything below, so the list is never empty for long.
      void syncForward()
      unsubscribe = appStore.subscribe(watchStore)
      watchStore()
      // The explorer has the complete history, so ask it first. If it can't be reached, fall back to
      // reading the nodes directly, which is slower and goes back only as far as it gets.
      void (async () => {
        const ok = await explorerSync(!(saved && saved.lowest <= 0))
        if (ctx.cancelled) return
        if (!ok) { setStatus({ source: 'nodes' }); void backfill() }
      })()
      // Live: look for new blocks every couple of seconds (one cheap call when nothing changed).
      let ticks = 0
      iv = setInterval(() => { ticks++; void syncForward(ticks % RECHECK_EVERY_TICKS === 0) }, LIVE_MS)
      // Every so often the explorer adds anything the nodes scan can't describe (other tokens, approvals).
      xv = setInterval(() => { if (explorerOk && document.visibilityState === 'visible') void explorerSync(false) }, EXPLORER_POLL_MS)
      document.addEventListener('visibilitychange', wake)
      window.addEventListener('online', wake)
    })()

    return () => {
      ctx.cancelled = true
      unsubscribe?.()
      clearInterval(iv)
      clearInterval(xv)
      clearTimeout(flushTimer)
      clearTimeout(retryTimer)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      controls = null
    }
  }, [address, client])
}
