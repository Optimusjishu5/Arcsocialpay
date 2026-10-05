import { CheckCircle2, Clock, XCircle, Loader2 } from 'lucide-react'
import type { TxStatus } from '../../types'

interface Props {
  status: TxStatus
  size?: 'sm' | 'md'
}

export function TxStatusBadge({ status, size = 'sm' }: Props) {
  const s = size === 'sm' ? 'text-xs px-2 py-0.5 gap-1' : 'text-sm px-3 py-1 gap-1.5'
  const iconSize = size === 'sm' ? 12 : 14

  if (status === 'confirmed') {
    return (
      <span className={`inline-flex items-center rounded-full font-medium ${s}`}
        style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
        <CheckCircle2 size={iconSize} />
        Confirmed
      </span>
    )
  }
  if (status === 'pending') {
    return (
      <span className={`inline-flex items-center rounded-full font-medium ${s}`}
        style={{ background: 'rgba(234,179,8,0.12)', color: '#a16207' }}>
        <Clock size={iconSize} />
        Pending
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center rounded-full font-medium ${s}`}
      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
      <XCircle size={iconSize} />
      Failed
    </span>
  )
}

export function TxSpinner({ text = 'Confirming...' }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--muted)' }}>
      <Loader2 size={14} className="animate-spin" />
      {text}
    </span>
  )
}
