'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Copy, ExternalLink } from 'lucide-react'
import { GradientIcon } from '../dashboard/ui'
import { TxStatusBadge } from '../ui/TxStatusBadge'
import { copyText } from '../../utils/copy'
import { formatAddress, formatFullTimestamp, formatTimestamp } from '../../utils/format'
import type { Entry } from './entries'

const KIND_LABEL = { payment: 'Payment', swap: 'Swap', bridge: 'Bridge', social: 'Social' } as const

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{label}</dt>
      <dd className="text-sm mt-0.5 min-w-0" style={{ color: 'var(--ink)' }}>{children}</dd>
    </div>
  )
}

function CopyValue({ value, shown, label }: { value: string; shown: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => { void copyText(value, `${label} copied`) }}
      aria-label={`Copy ${label.toLowerCase()}`}
      className="inline-flex items-center gap-1.5 max-w-full rounded-md -mx-1 px-1 py-0.5 text-left font-mono text-[13px] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
    >
      <span className="truncate">{shown}</span>
      <Copy size={12} className="flex-shrink-0" style={{ color: 'var(--subtle)' }} />
    </button>
  )
}

export function ActivityRow({ entry: e }: { entry: Entry }) {
  const [open, setOpen] = useState(false)
  const t = e.tx
  const failed = t?.status === 'failed'
  const amountColor = failed ? 'var(--subtle)' : e.amount?.sign === '-' ? 'var(--danger)' : 'var(--success)'
  const panelId = `activity-${e.id}`

  return (
    <div className="rounded-2xl transition-colors hover:bg-[var(--surface-muted)]/60">
      <div className="flex items-center gap-1 pr-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex flex-1 min-w-0 items-center gap-3 p-3 min-h-[60px] text-left rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <GradientIcon icon={e.icon} tone={e.tone} size={40} />
          <span className="flex-1 min-w-0">
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{e.title}</span>
              {t && t.status !== 'confirmed' && <TxStatusBadge status={t.status} />}
            </span>
            <span className="block text-xs truncate mt-0.5" style={{ color: 'var(--muted)' }}>
              {e.detail ? `${e.detail} · ` : ''}{formatTimestamp(e.at)}
            </span>
          </span>
          {e.amount && (
            <span className="tabnum font-bold text-sm whitespace-nowrap" style={{ color: amountColor, textDecoration: failed ? 'line-through' : undefined }}>
              {e.amount.sign}{e.amount.text}
            </span>
          )}
          {t && (
            <ChevronDown size={16} aria-hidden className="flex-shrink-0 transition-transform duration-200"
              style={{ color: 'var(--subtle)', transform: open ? 'rotate(180deg)' : undefined }} />
          )}
        </button>
        {e.url && t && (
          <a href={e.url} target="_blank" rel="noopener noreferrer" aria-label="View on Arc Explorer"
            className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{ color: 'var(--muted)' }}>
            <ExternalLink size={15} />
          </a>
        )}
      </div>

      {open && t && (
        <motion.dl
          id={panelId}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="grid grid-cols-2 gap-x-4 gap-y-3 mx-3 mb-3 p-3 rounded-xl"
          style={{ background: 'var(--surface-muted)' }}
        >
          <Field label="Status"><TxStatusBadge status={t.status} /></Field>
          <Field label="Type">{KIND_LABEL[e.kind]}</Field>
          <Field label="Time">{formatFullTimestamp(t.timestamp)}</Field>
          <Field label="Amount">{t.amount} {t.symbol ?? 'USDC'}</Field>
          {t.kind !== 'swap' && t.kind !== 'bridge' && (
            <>
              <Field label="From"><CopyValue value={t.fromAddress} shown={formatAddress(t.fromAddress)} label="Address" /></Field>
              <Field label="To"><CopyValue value={t.toAddress} shown={formatAddress(t.toAddress)} label="Address" /></Field>
            </>
          )}
          {t.blockNumber !== undefined && <Field label="Block"><span className="tabnum">{t.blockNumber.toLocaleString('en-US')}</span></Field>}
          {(t.note || t.summary) && <Field label={t.note ? 'Note' : 'Summary'}><span className="break-words">{t.note ?? t.summary}</span></Field>}
          <div className="col-span-2 min-w-0">
            <Field label="Transaction hash"><CopyValue value={t.txHash} shown={formatAddress(t.txHash)} label="Hash" /></Field>
          </div>
        </motion.dl>
      )}
    </div>
  )
}
