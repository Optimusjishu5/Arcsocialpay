'use client'

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, RefreshCw, Wallet } from 'lucide-react'
import { useOnchainStatus } from '../../hooks/useOnchainActivity'
import { ActivityRow } from '../activity/ActivityRow'
import { CATEGORY_META, FILTERS, countByFilter, type Entry, type Filter } from '../activity/entries'
import { EmptyRow, GradientIcon, Section, TONES } from './ui'

/** How many of the newest entries are listed here; the Activity page has the rest. */
const RECENT_LIMIT = 25

interface Props {
  entries: Entry[]
  onViewAll: () => void
  onSend: () => void
}

/**
 * Dashboard timeline: every Send, Receive, Swap, Bridge, Batch, Request, Schedule and Split
 * (plus social activity) read from Arc, with a count per type that doubles as a filter.
 */
export function RecentActivity({ entries, onViewAll, onSend }: Props) {
  const chain = useOnchainStatus()
  const [filter, setFilter] = useState<Filter>('all')
  const counts = useMemo(() => countByFilter(entries), [entries])
  const txCount = useMemo(() => entries.reduce((n, e) => n + (e.tx ? 1 : 0), 0), [entries])

  // A type with nothing in it disappears, so the chip row only shows what the wallet has done.
  const chips = FILTERS.filter((f) => f.id === 'all' || counts[f.id] > 0)
  const active: Filter = counts[filter] > 0 ? filter : 'all'
  const category = FILTERS.find((f) => f.id === active)?.category
  const filtered = useMemo(() => (category ? entries.filter((e) => e.category === category) : entries), [entries, category])
  const recent = filtered.slice(0, RECENT_LIMIT)

  const syncing = chain.scanning && !chain.complete
  const partial = chain.source === 'nodes' && !chain.complete
  const total = `${txCount.toLocaleString('en-US')} ${txCount === 1 ? 'transaction' : 'transactions'}`
  const sub = syncing
    ? `Reading your history from ${chain.source === 'explorer' ? 'the Arc explorer' : 'Arc'}...${txCount > 0 ? ` ${total} so far` : ''}`
    : txCount === 0 ? 'Arc Mainnet'
    : partial ? `${total} found so far. Older history is still loading from Arc nodes.`
    : `${total} on Arc, same as the explorer`

  return (
    <Section
      title="Recent activity"
      icon={Activity}
      tone="blue"
      action={entries.length > 0 ? (
        <button onClick={onViewAll} className="text-xs font-semibold px-3 h-8 rounded-full transition-colors hover:bg-[var(--surface-muted)]" style={{ color: 'var(--accent)' }}>
          View all {entries.length.toLocaleString('en-US')}
        </button>
      ) : undefined}
    >
      <div className="px-2 pb-2 flex items-center gap-1.5 text-xs tabnum" style={{ color: 'var(--muted)' }} aria-live="polite">
        {syncing && <RefreshCw size={12} className="animate-spin" aria-hidden />}
        {!syncing && txCount > 0 && <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} aria-hidden />}
        <span>{sub}</span>
      </div>

      {entries.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-2 pb-3 -mt-0.5" style={{ scrollbarWidth: 'none' }} role="tablist" aria-label="Activity type">
          {chips.map((f) => {
            const on = active === f.id
            const meta = f.category ? CATEGORY_META[f.category] : null
            const [from, to] = meta ? TONES[meta.tone] : ['#5fbeff', '#2563eb']
            const Icon = meta?.icon
            return (
              <button
                key={f.id}
                role="tab"
                aria-selected={on}
                onClick={() => setFilter(f.id)}
                className="flex-shrink-0 h-9 pl-2.5 pr-3 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                style={{
                  background: on ? `linear-gradient(135deg, ${from}, ${to})` : 'var(--surface-strong)',
                  color: on ? '#fff' : 'var(--ink-2)',
                  border: `1px solid ${on ? 'transparent' : 'var(--border)'}`,
                  boxShadow: on ? `0 8px 16px -10px ${to}` : 'none',
                }}
              >
                {Icon ? <Icon size={14} aria-hidden style={{ color: on ? '#fff' : to }} /> : null}
                {f.label}
                <span
                  className="tabnum min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ background: on ? 'rgba(255,255,255,0.25)' : 'var(--surface-muted)', color: on ? '#fff' : 'var(--muted)' }}
                >
                  {counts[f.id].toLocaleString('en-US')}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {recent.length === 0 ? (
        chain.scanning || !chain.ready ? (
          <div className="flex flex-col gap-1 pb-2" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <GradientIcon icon={Activity} tone="blue" size={40} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 rounded" style={{ background: 'var(--surface-muted)' }} />
                  <div className="h-2.5 w-40 rounded" style={{ background: 'var(--surface-muted)' }} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyRow icon={Wallet} text="No activity yet" cta="Send your first payment" onCta={onSend} />
        )
      ) : (
        <div className="max-h-[30rem] overflow-y-auto overscroll-contain pr-0.5" role="list" aria-label="Recent activity">
          <AnimatePresence initial={false} mode="popLayout">
            {recent.map((e) => (
              <motion.div key={e.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
                <ActivityRow entry={e} />
              </motion.div>
            ))}
          </AnimatePresence>
          {filtered.length > recent.length && (
            <button onClick={onViewAll}
              className="w-full h-11 mt-1 rounded-2xl text-sm font-semibold transition-colors hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--accent)' }}>
              See {(filtered.length - recent.length).toLocaleString('en-US')} more in Activity
            </button>
          )}
        </div>
      )}
    </Section>
  )
}
