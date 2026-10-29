'use client'

import { Check, CircleDashed, ExternalLink, Loader2, X } from 'lucide-react'
import { Avatar } from '../ui/Avatar'
import { ARC_CHAIN_ID } from '../../hooks/useArcWallet'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatAddress, formatUsdcDisplay } from '../../utils/format'
import { parseUsdc } from '@/onchain-money'
import type { BatchRow } from '../../utils/batch'

function rawOf(amount: string): bigint {
  try { return parseUsdc(amount.trim()) } catch { return 0n }
}

function StatusIcon({ status }: { status: BatchRow['status'] }) {
  if (status === 'confirmed') {
    return <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--success)' }}><Check size={13} strokeWidth={3} /></span>
  }
  if (status === 'failed') {
    return <span className="w-6 h-6 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--danger)' }}><X size={13} strokeWidth={3} /></span>
  }
  if (status === 'signing' || status === 'confirming') {
    return <span className="w-6 h-6 flex items-center justify-center" style={{ color: 'var(--accent)' }}><Loader2 size={18} className="animate-spin" /></span>
  }
  return <span className="w-6 h-6 flex items-center justify-center" style={{ color: 'var(--subtle)' }}><CircleDashed size={18} /></span>
}

const STATUS_TEXT: Record<BatchRow['status'], string> = {
  queued: 'Waiting',
  signing: 'Confirm in your wallet',
  confirming: 'Confirming onchain',
  confirmed: 'Sent',
  failed: 'Failed',
}

/** Read-only summary of the batch: every payment in order, with its live status once sending starts. */
export function BatchReview({ rows, balance }: { rows: BatchRow[]; balance: bigint }) {
  const remaining = rows.filter((r) => r.status !== 'confirmed')
  const after = balance - remaining.reduce((n, r) => n + rawOf(r.amount), 0n)

  return (
    <div className="mx-4 rounded-2xl overflow-hidden" data-tp="">
      <div className="px-3.5 pt-3 pb-2">
        <h4 className="display font-bold text-base" style={{ color: 'var(--ink)' }}>Review and confirm</h4>
        <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
          You will sign {remaining.length} {remaining.length === 1 ? 'payment' : 'payments'} in your wallet, one after another.
        </p>
      </div>
      <ol className="divide-y divide-[var(--border)] max-h-[min(48vh,420px)] overflow-y-auto" aria-label="Payments in this batch">
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
            <Avatar address={r.address.trim()} size={34} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold mono truncate" style={{ color: 'var(--ink)' }}>{formatAddress(r.address.trim())}</div>
              <div className="text-xs flex items-center gap-1.5 min-w-0" style={{ color: r.status === 'failed' ? 'var(--danger)' : 'var(--muted)' }} aria-live="polite">
                <span className="truncate">{r.status === 'failed' && r.error ? r.error : `${i + 1}. ${STATUS_TEXT[r.status]}`}</span>
                {r.hash && (
                  <a href={buildTxExplorerUrl(ARC_CHAIN_ID, r.hash)} target="_blank" rel="noopener noreferrer"
                    aria-label="View transaction" className="inline-flex flex-shrink-0" style={{ color: 'var(--tone-text)' }}>
                    <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="display font-bold text-sm tabnum" style={{ color: 'var(--ink)' }}>{formatUsdcDisplay(r.amount.trim())}</div>
              <div className="text-[10px] font-bold tracking-wide" style={{ color: 'var(--subtle)' }}>USDC</div>
            </div>
            <StatusIcon status={r.status} />
          </li>
        ))}
      </ol>
      <div className="flex items-center justify-between px-3.5 py-2.5 text-xs" style={{ borderTop: '1px solid var(--border)', color: 'var(--muted)' }}>
        <span>Balance after this batch</span>
        <span className="tabnum font-semibold" style={{ color: after < 0n ? 'var(--danger)' : 'var(--ink-2)' }}>
          {after < 0n ? '-' : ''}{formatUsdcDisplay(after < 0n ? -after : after)} USDC
        </span>
      </div>
    </div>
  )
}
