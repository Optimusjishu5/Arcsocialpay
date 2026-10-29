'use client'

import { CheckCircle2, Loader2, Pause, Play, RefreshCw, TriangleAlert } from 'lucide-react'
import { glassCard } from '../dashboard/ui'
import { useOnchainStatus } from '../../hooks/useOnchainActivity'

/** Shows how much of the wallet's history has been read from Arc, with pause and refresh. */
export function SyncStatus() {
  const s = useOnchainStatus()
  const pct = Math.round(s.coverage * 100)
  const reading = s.scanning && !s.paused && !s.complete

  let Icon = Loader2
  let title = 'Reading your history from Arc'
  let body = s.daysCovered > 0 ? `Covered the last ${s.daysCovered} day${s.daysCovered === 1 ? '' : 's'} so far (${pct}% of the chain).` : 'Looking for your payments, swaps and bridges.'
  let color = 'var(--accent)'

  if (s.complete) {
    Icon = CheckCircle2; color = 'var(--success)'
    title = 'Full history loaded'
    body = 'Every transaction since the start of the chain has been checked.'
  } else if (s.paused) {
    Icon = Pause; color = 'var(--muted)'
    title = 'Paused'
    body = `History is loaded back ${s.daysCovered} day${s.daysCovered === 1 ? '' : 's'} (${pct}% of the chain). Resume to keep reading older transactions.`
  } else if (s.incomplete && !s.scanning) {
    Icon = TriangleAlert; color = '#a16207'
    title = 'Network is busy'
    body = 'Arc limited how fast history can be read. Retrying automatically, nothing is lost.'
  } else if (!s.scanning && s.daysCovered > 0) {
    Icon = Loader2
    title = 'Up to date'
    body = `Checked back ${s.daysCovered} day${s.daysCovered === 1 ? '' : 's'} (${pct}% of the chain).`
  }

  return (
    <div className="rounded-2xl p-3.5" style={glassCard} aria-live="polite">
      <div className="flex items-start gap-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--surface-muted)', color }}>
          <Icon size={17} className={reading || (s.scanning && !s.complete && !s.paused) ? 'animate-spin' : ''} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{title}</p>
          <p className="text-xs mt-0.5 text-pretty" style={{ color: 'var(--muted)' }}>{body}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!s.complete && (s.paused ? (
            <button onClick={s.resume} aria-label="Resume reading older history"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{ color: 'var(--ink)' }}><Play size={16} /></button>
          ) : (
            <button onClick={s.pause} aria-label="Pause reading older history"
              className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{ color: 'var(--ink)' }}><Pause size={16} /></button>
          ))}
          <button onClick={s.rescan} disabled={s.scanning} aria-label="Check for new transactions"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{ color: 'var(--ink)' }}><RefreshCw size={16} /></button>
        </div>
      </div>
      {!s.saved && (
        <p className="mt-2.5 text-[11px] text-pretty" style={{ color: '#a16207' }}>
          This browser window cannot keep saved history (private mode?). History is read again each visit.
        </p>
      )}
      {!s.complete && s.coverage < 0.5 && !s.paused && (
        <p className="mt-2.5 text-[11px] text-pretty" style={{ color: 'var(--subtle)' }}>
          Arc limits how fast history can be read, so going far back can take a while. It keeps going in the background and your newest transactions are already shown.
        </p>
      )}
      {!s.complete && (
        <div className="mt-3 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }} role="progressbar"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="History coverage">
          <div className="h-full w-full rounded-full origin-left transition-transform duration-500"
            style={{ background: 'var(--accent)', transform: `scaleX(${Math.max(0.02, s.coverage)})` }} />
        </div>
      )}
    </div>
  )
}
