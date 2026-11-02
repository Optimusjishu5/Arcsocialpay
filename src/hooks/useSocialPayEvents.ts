'use client'

// SocialPay contract events (tips and payments) for one wallet, newest first, from /api/socialpay/events.
// The first page loads on its own, older pages on request, and new ones are picked up every few
// seconds while the page is open. A rate-limited answer is waited out, not retried at once.

import { useCallback, useEffect, useRef, useState } from 'react'
import type { SocialPayEventsPage, VerifiedSocialPayEvent } from '../server/socialPayFeed'

const POLL_MS = 8_000
const PAGE = 15
/** After this long without a successful read, start over instead of asking for "what is new". */
const STALE_MS = 5 * 60_000

export interface SocialPayEventsState {
  events: VerifiedSocialPayEvent[]
  /** The first page is being read. */
  loading: boolean
  loadingOlder: boolean
  /** Older events may exist: call loadOlder(). */
  hasOlder: boolean
  /** What went wrong with the last read, in plain words. Empty when fine. */
  error: string
  source: SocialPayEventsPage['source'] | null
  note: string
  /** This host has no events route (a static deployment): there is nothing to show. */
  unavailable: boolean
  loadOlder: () => void
}

interface Data {
  /** The wallet these events belong to; data for another wallet is ignored. */
  for: string | undefined
  loaded: boolean
  loadingOlder: boolean
  events: VerifiedSocialPayEvent[]
  nextBefore: number | null
  error: string
  source: SocialPayEventsPage['source'] | null
  note: string
  unavailable: boolean
}

const EMPTY: Data = { for: undefined, loaded: false, loadingOlder: false, events: [], nextBefore: null, error: '', source: null, note: '', unavailable: false }

const key = (e: VerifiedSocialPayEvent) => `${e.txHash}:${e.logIndex}`
function merge(prev: VerifiedSocialPayEvent[], add: VerifiedSocialPayEvent[]): VerifiedSocialPayEvent[] {
  const map = new Map(prev.map((e) => [key(e), e]))
  for (const e of add) map.set(key(e), e)
  return [...map.values()].sort((a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex)
}

async function read(params: Record<string, string>): Promise<SocialPayEventsPage> {
  const res = await fetch(`/api/socialpay/events?${new URLSearchParams(params)}`, { cache: 'no-store' })
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after')) || 10
    throw Object.assign(new Error('Reading events too fast. Waiting a moment.'), { retryAfter: wait })
  }
  if (res.status === 404) throw Object.assign(new Error('No events route on this host.'), { unavailable: true })
  if (!res.ok) throw new Error('SocialPay events could not be read right now.')
  return (await res.json()) as SocialPayEventsPage
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'SocialPay events could not be read right now.')

export function useSocialPayEvents(address: string | undefined): SocialPayEventsState {
  const [data, setData] = useState<Data>(EMPTY)
  const head = useRef(0)
  const busy = useRef(false)
  const pausedUntil = useRef(0)
  const lastOk = useRef(0)

  /** Updates the data of the wallet being shown; starts fresh when it was another wallet's. */
  const update = useCallback((wallet: string, fn: (d: Data) => Partial<Data>) => {
    setData((d) => {
      const base = d.for === wallet ? d : { ...EMPTY, for: wallet }
      return { ...base, ...fn(base) }
    })
  }, [])

  useEffect(() => {
    if (!address) return
    const wallet = address
    let cancelled = false
    head.current = 0
    lastOk.current = Date.now()

    const guard = async (fn: () => Promise<void>) => {
      if (busy.current || Date.now() < pausedUntil.current) return
      busy.current = true
      try {
        await fn()
      } catch (e) {
        const wait = (e as { retryAfter?: number }).retryAfter
        if (wait) pausedUntil.current = Date.now() + wait * 1000
        if (!cancelled) update(wallet, () => ((e as { unavailable?: boolean }).unavailable ? { unavailable: true, loaded: true } : { error: message(e), loaded: true }))
      } finally {
        busy.current = false
      }
    }

    const first = () => guard(async () => {
      const page = await read({ address: wallet, limit: String(PAGE) })
      if (cancelled) return
      head.current = page.head
      lastOk.current = Date.now()
      update(wallet, () => ({ events: page.events, nextBefore: page.nextBefore, source: page.source, note: page.note ?? '', error: '', loaded: true }))
    })
    void first()

    const poll = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      if (!head.current) { void first(); return }
      // Away for a while: a fresh read is cheaper than catching up block by block.
      if (Date.now() - lastOk.current > STALE_MS) { void first(); return }
      void guard(async () => {
        const page = await read({ address: wallet, since: String(head.current), limit: String(PAGE) })
        if (cancelled) return
        head.current = Math.max(head.current, page.head)
        lastOk.current = Date.now()
        update(wallet, (d) => ({ events: page.events.length ? merge(d.events, page.events) : d.events, error: '' }))
      })
    }, POLL_MS)

    return () => { cancelled = true; clearInterval(poll) }
  }, [address, update])

  const current = data.for === address ? data : EMPTY

  const loadOlder = useCallback(() => {
    if (!address || current.nextBefore === null || busy.current) return
    busy.current = true
    update(address, () => ({ loadingOlder: true }))
    read({ address, before: String(current.nextBefore), limit: String(PAGE) })
      .then((page) => update(address, (d) => ({ events: merge(d.events, page.events), nextBefore: page.nextBefore, error: '' })))
      .catch((e: unknown) => update(address, () => ({ error: message(e) })))
      .finally(() => { busy.current = false; update(address, () => ({ loadingOlder: false })) })
  }, [address, current.nextBefore, update])

  return {
    events: current.events,
    loading: !!address && !current.loaded,
    loadingOlder: current.loadingOlder,
    hasOlder: current.nextBefore !== null,
    error: current.error,
    source: current.source,
    note: current.note,
    unavailable: current.unavailable,
    loadOlder,
  }
}
