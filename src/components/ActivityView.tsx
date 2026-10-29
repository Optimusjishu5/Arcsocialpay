'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Activity as ActivityIcon, ArrowDownLeft, ArrowUpRight, Download, Search, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { useAppStore } from '../store/appStore'
import { useSettings } from '../hooks/useSettings'
import { useOnchainStatus } from '../hooks/useOnchainActivity'
import { useCachedRecords } from '../lib/activityCache'
import { EmptyState } from './ui/EmptyState'
import { Button } from './ui/Button'
import { StatCard, glassCard } from './dashboard/ui'
import { ActivityRow } from './activity/ActivityRow'
import { SyncStatus } from './activity/SyncStatus'
import { FILTERS, buildEntries, groupByDay, matchesQuery, toCsv, type Filter } from './activity/entries'
import { formatUsdcDisplay, isSameAddress } from '../utils/format'
import { parseUsdc } from '@/onchain-money'

const PAGE = 40

function RowsSkeleton() {
  return (
    <div className="rounded-3xl p-2" style={glassCard} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
          <div className="w-10 h-10 rounded-xl" style={{ background: 'var(--surface-muted)' }} />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-muted)' }} />
            <div className="h-2.5 w-40 rounded" style={{ background: 'var(--surface-muted)' }} />
          </div>
          <div className="h-3 w-16 rounded" style={{ background: 'var(--surface-muted)' }} />
        </div>
      ))}
    </div>
  )
}

export function ActivityView() {
  const { address, isConnected } = useArcAccount()
  const { txHistory, posts, comments, notifications } = useAppStore()
  const { filterNotifications } = useSettings()
  const chain = useOnchainStatus()
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState({ key: '', count: PAGE })
  const sentinel = useRef<HTMLDivElement>(null)

  // Everything read from the chain lives in the permanent store below; the app's own list
  // (pending sends, recent items) goes first so a live status wins over a saved copy.
  const saved = useCachedRecords(address)
  const allTx = useMemo(
    () => [...txHistory, ...saved.map((r) => ({ ...r, id: `chain-${r.txHash}` }))],
    [txHistory, saved],
  )

  const entries = useMemo(
    () => (address ? buildEntries({ address, txHistory: allTx, posts, comments, notifications: filterNotifications(notifications) }) : []),
    [address, allTx, posts, comments, notifications, filterNotifications],
  )

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: entries.length, payments: 0, swaps: 0, bridges: 0, social: 0 }
    for (const e of entries) {
      if (e.kind === 'payment') c.payments++
      else if (e.kind === 'swap') c.swaps++
      else if (e.kind === 'bridge') c.bridges++
      else c.social++
    }
    return c
  }, [entries])

  const totals = useMemo(() => {
    let received = 0n
    let sent = 0n
    for (const e of entries) {
      const t = e.tx
      if (!t || e.kind !== 'payment' || t.status !== 'confirmed' || (t.symbol && t.symbol !== 'USDC')) continue
      try {
        const raw = parseUsdc(t.amount)
        if (isSameAddress(t.fromAddress, address)) sent += raw
        else received += raw
      } catch { /* skip malformed legacy rows */ }
    }
    return { received, sent }
  }, [entries, address])

  const shown = useMemo(() => {
    const kind = FILTERS.find((f) => f.id === filter)?.kind
    const q = query.trim()
    return entries.filter((e) => (!kind || e.kind === kind) && matchesQuery(e, q))
  }, [entries, filter, query])

  // The page size resets whenever the filter, search or wallet changes.
  const pageKey = `${filter}|${query}|${address ?? ''}`
  const visible = page.key === pageKey ? page.count : PAGE
  const showMore = () => setPage({ key: pageKey, count: visible + PAGE })

  // Load the next page as the list end scrolls into view.
  const hasMore = shown.length > visible
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore) return
    const io = new IntersectionObserver((hits) => {
      if (hits.some((h) => h.isIntersecting)) setPage((p) => ({ key: pageKey, count: (p.key === pageKey ? p.count : PAGE) + PAGE }))
    }, { rootMargin: '240px' })
    io.observe(el)
    return () => io.disconnect()
  }, [hasMore, visible, pageKey])

  const groups = useMemo(() => groupByDay(shown.slice(0, visible)), [shown, visible])

  function exportCsv() {
    const blob = new Blob([toCsv(shown)], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `socialpay-activity-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to see your activity</p>
        <ConnectKitButton />
      </div>
    )
  }

  // The skeleton only shows while the first look at the chain is genuinely in progress.
  const loadingFirst = entries.length === 0 && (!chain.ready || (chain.scanning && chain.daysCovered === 0))
  const unreachable = entries.length === 0 && chain.ready && !chain.scanning && chain.incomplete
  const hasTx = shown.some((e) => e.tx)

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}
      className="max-w-2xl mx-auto px-4 pt-4 pb-10 flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>Activity</h2>
          <p className="text-xs mt-0.5 tabnum" style={{ color: 'var(--muted)' }}>
            {counts.all.toLocaleString('en-US')} {counts.all === 1 ? 'entry' : 'entries'}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={exportCsv} disabled={!hasTx} aria-label="Export transactions as CSV">
          <Download size={14} /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard icon={ArrowDownLeft} tone="green" label="Received" value={formatUsdcDisplay(totals.received)} unit="USDC" />
        <StatCard icon={ArrowUpRight} tone="rose" label="Sent" value={formatUsdcDisplay(totals.sent)} unit="USDC" />
      </div>

      <SyncStatus />

      <div className="relative">
        <Search size={16} aria-hidden className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--subtle)' }} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search address, hash, memo or token"
          aria-label="Search activity"
          className="w-full h-11 pl-10 pr-10 rounded-xl text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--focus)]"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
        {query && (
          <button onClick={() => setQuery('')} aria-label="Clear search"
            className="absolute right-1 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full flex items-center justify-center hover:bg-[var(--surface-muted)]"
            style={{ color: 'var(--muted)' }}>
            <X size={15} />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1" role="tablist" aria-label="Activity type">
        {FILTERS.map((f) => {
          const active = filter === f.id
          return (
            <button key={f.id} role="tab" aria-selected={active} onClick={() => setFilter(f.id)}
              className="h-10 px-3.5 rounded-full text-sm font-semibold whitespace-nowrap flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{
                background: active ? 'var(--accent)' : 'var(--surface-strong)',
                color: active ? '#fff' : 'var(--muted)',
                border: '1px solid var(--border)',
              }}>
              {f.label}
              <span className="tabnum text-xs opacity-70">{counts[f.id]}</span>
            </button>
          )
        })}
      </div>

      {loadingFirst ? (
        <RowsSkeleton />
      ) : shown.length === 0 ? (
        <div className="rounded-3xl" style={glassCard}>
          <EmptyState
            icon={<ActivityIcon size={24} />}
            title={query || filter !== 'all' ? 'No matching activity' : unreachable ? 'Could not reach Arc' : 'Nothing here yet'}
            description={
              query || filter !== 'all'
                ? 'Try a different search or filter.'
                : unreachable
                  ? 'Your history could not be loaded just now. It retries by itself, or you can try again.'
                : chain.complete
                  ? 'This wallet has no payments, swaps or bridges on Arc yet.'
                  : 'Your payments, swaps, bridges and social activity will show up here as one timeline. Older history is still being read.'
            }
            action={(query || filter !== 'all')
              ? <Button size="sm" variant="secondary" onClick={() => { setQuery(''); setFilter('all') }}>Clear filters</Button>
              : unreachable ? <Button size="sm" variant="secondary" onClick={chain.rescan}>Try again</Button> : undefined}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h3 className="px-1 mb-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{g.label}</h3>
              <div className="rounded-3xl p-1.5 flex flex-col" style={glassCard}>
                {g.entries.map((e) => <ActivityRow key={e.id} entry={e} />)}
              </div>
            </section>
          ))}
          {hasMore && (
            <div ref={sentinel} className="flex justify-center">
              <Button variant="secondary" size="sm" onClick={showMore}>
                Show more ({(shown.length - visible).toLocaleString('en-US')} left)
              </Button>
            </div>
          )}
        </div>
      )}

      <p className="text-xs px-1 text-pretty" style={{ color: 'var(--subtle)' }}>
        Payments, swaps and bridges are read from the Arc network and confirmed by transaction hash. Posts, comments and reactions are app data stored off-chain.
      </p>
    </motion.div>
  )
}
