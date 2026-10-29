'use client'

import { useEffect, useState } from 'react'
import { isAddress } from 'viem'
import { CalendarClock, Trash2 } from 'lucide-react'
import { Button } from '../ui/Button'
import { useScheduledPayments } from '../../hooks/useScheduledPayments'
import { formatAddress, isSameAddress, isValidUsdcAmount, formatUsdcDisplay } from '../../utils/format'
import { MAX_MEMO_LENGTH, type Frequency, type ScheduledPayment } from '../../utils/payRequests'
import { fieldClass, fieldLabel, fieldStyle } from './ShareLinkBox'

const FREQUENCIES: { value: Frequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function toLocalInput(ts: number): string {
  const d = new Date(ts - new Date(ts).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

function describeDue(ts: number): string {
  return new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

interface Props {
  address: string
  onPayNow: (item: ScheduledPayment) => void
}

export function ScheduleForm({ address, onPayNow }: Props) {
  const { items, add, remove } = useScheduledPayments(address)
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [frequency, setFrequency] = useState<Frequency>('monthly')
  const [due, setDue] = useState(() => toLocalInput(Date.now() + 24 * 3_600_000))
  const [error, setError] = useState('')
  const [now, setNow] = useState(() => Date.now())

  // Keep "Due now" badges current while the tab stays open.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  function submit() {
    setError('')
    if (!isAddress(recipient)) return setError('Enter a valid Arc address (0x...)')
    if (isSameAddress(recipient, address)) return setError('Cannot schedule a payment to your own address')
    if (!isValidUsdcAmount(amount)) return setError('Enter a valid amount (max 6 decimals)')
    const nextDue = new Date(due).getTime()
    if (Number.isNaN(nextDue)) return setError('Pick a date and time')
    if (nextDue <= Date.now()) return setError('Pick a time in the future')
    add({ owner: address, recipient, amount: amount.trim(), note: note.trim(), frequency, nextDue })
    setRecipient('')
    setAmount('')
    setNote('')
  }


  return (
    <div className="space-y-4">
      <div className="rounded-2xl overflow-hidden" data-tc="">
        <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Schedule a payment</h3>
        </div>
        <div className="p-4 space-y-4">
          <div>
            <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Recipient address</label>
            <input type="text" value={recipient} onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder="0x..." className={`${fieldClass} mono`} style={fieldStyle} />
          </div>
          <div>
            <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Amount</label>
            <div className="relative">
              <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00" className={`${fieldClass} pr-16 tabnum`} style={fieldStyle} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>
          </div>
          <div>
            <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Repeat</label>
            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
              {FREQUENCIES.map((f) => (
                <button key={f.value} onClick={() => setFrequency(f.value)}
                  className="h-9 rounded-lg text-xs font-semibold transition-all"
                  style={{
                    background: frequency === f.value ? 'var(--surface-strong)' : 'transparent',
                    color: frequency === f.value ? 'var(--ink)' : 'var(--muted)',
                    boxShadow: frequency === f.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                  }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={fieldLabel} style={{ color: 'var(--muted)' }}>{frequency === 'once' ? 'Due' : 'First due'}</label>
            <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)}
              className={fieldClass} style={fieldStyle} />
          </div>
          <div>
            <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={MAX_MEMO_LENGTH}
              placeholder="Rent, subscription..." className={fieldClass} style={fieldStyle} />
          </div>
          {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
          <Button className="w-full" size="lg" onClick={submit}>Save reminder</Button>
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Payments are never sent automatically. When one is due, you review it and confirm in your wallet. Reminders are saved in this browser only.
          </p>
        </div>
      </div>

      {items.length > 0 && (
        <div className="rounded-2xl overflow-hidden" data-tc="">
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Upcoming</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {items.map((s) => {
              const isDue = s.nextDue <= now
              return (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: isDue ? 'var(--danger-bg)' : 'var(--surface-muted)', color: isDue ? 'var(--danger)' : 'var(--muted)' }}>
                    <CalendarClock size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                      <span className="tabnum">{formatUsdcDisplay(s.amount)}</span> USDC to {formatAddress(s.recipient)}
                    </p>
                    <p className="text-xs" style={{ color: isDue ? 'var(--danger)' : 'var(--muted)' }}>
                      {isDue ? 'Due now' : describeDue(s.nextDue)} · {s.frequency === 'once' ? 'one time' : s.frequency}
                    </p>
                  </div>
                  <Button size="sm" variant={isDue ? 'primary' : 'secondary'} onClick={() => onPayNow(s)}>Pay</Button>
                  <button onClick={() => remove(s.id)} aria-label="Delete reminder"
                    className="p-2 rounded-lg" style={{ color: 'var(--muted)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
