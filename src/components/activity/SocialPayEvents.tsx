'use client'

// Tips and payments that went through the SocialPay contract, as the contract itself logged them.
// Each one is decoded with the contract's ABI and checked against the Arc network's receipt.

import { Loader2, ShieldCheck, ShieldQuestion } from 'lucide-react'
import { glassCard } from '../dashboard/ui'
import { Button } from '../ui/Button'
import { ExplorerLinks } from '../ui/ExplorerLinks'
import { useSocialPayEvents } from '../../hooks/useSocialPayEvents'
import { formatAddress, formatTimestamp, isSameAddress } from '../../utils/format'

export function SocialPayEvents({ address }: { address: string | undefined }) {
  const s = useSocialPayEvents(address)
  if (!address || s.unavailable) return null

  return (
    <section aria-label="SocialPay contract events" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>SocialPay contract events</h3>
        {s.source && (
          <span className="text-[11px]" style={{ color: 'var(--subtle)' }}>
            read from the Arc node, confirmed on Arc
          </span>
        )}
      </div>

      <div className="rounded-3xl p-1.5 flex flex-col" style={glassCard}>
        {s.loading && s.events.length === 0 ? (
          <p className="flex items-center gap-2 p-4 text-sm" style={{ color: 'var(--muted)' }} role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden /> Reading contract events from Arc
          </p>
        ) : s.events.length === 0 ? (
          <p className="p-4 text-sm text-pretty" style={{ color: 'var(--muted)' }}>
            {s.error || (s.hasOlder ? 'No events in the newest blocks yet. Load older events to keep looking.' : 'No tips or payments from this wallet have gone through the SocialPay contract.')}
          </p>
        ) : (
          s.events.map((e) => {
            const sent = e.sender ? isSameAddress(e.sender, address) : false
            const other = sent ? e.recipient : e.sender
            return (
              <div key={`${e.txHash}:${e.logIndex}`} className="flex items-center gap-1 pr-1 rounded-2xl hover:bg-[var(--surface-muted)]/60">
                <div className="flex-1 min-w-0 p-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>
                      {e.name === 'Tip' ? (sent ? 'Tip sent' : 'Tip received') : sent ? 'Payment sent' : 'Payment received'}
                    </span>
                    {e.verified ? (
                      <span title="Confirmed by the Arc network's receipt" aria-label="Confirmed by the Arc network" style={{ color: 'var(--success)' }}><ShieldCheck size={13} /></span>
                    ) : (
                      <span title="Not confirmed against the Arc network yet" aria-label="Not confirmed against the Arc network yet" style={{ color: 'var(--subtle)' }}><ShieldQuestion size={13} /></span>
                    )}
                  </div>
                  <p className="text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
                    {other ? `${sent ? 'To' : 'From'} ${formatAddress(other)}` : ''}
                    {e.note ? ` · ${e.name === 'Tip' ? 'Post' : ''} ${e.note}`.trimEnd() : ''}
                    {` · ${e.timestamp ? formatTimestamp(e.timestamp) : `block ${e.blockNumber.toLocaleString('en-US')}`}`}
                  </p>
                </div>
                {e.amountUsdc !== undefined && (
                  <span className="tabnum font-bold text-sm whitespace-nowrap" style={{ color: sent ? 'var(--danger)' : 'var(--success)' }}>
                    {sent ? '-' : '+'}{e.amountUsdc}
                  </span>
                )}
                <ExplorerLinks hash={e.txHash} trusted={e.verified} variant="icon" />
              </div>
            )
          })
        )}
        {s.hasOlder && (
          <div className="flex justify-center p-2">
            <Button size="sm" variant="secondary" onClick={s.loadOlder} disabled={s.loadingOlder}>
              {s.loadingOlder ? 'Reading older blocks' : 'Load older events'}
            </Button>
          </div>
        )}
      </div>
      {s.error && s.events.length > 0 && <p className="text-xs px-1" style={{ color: 'var(--danger)' }}>{s.error}</p>}
      {s.note && <p className="text-xs px-1 text-pretty" style={{ color: 'var(--subtle)' }}>{s.note}</p>}
    </section>
  )
}
