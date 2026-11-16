'use client'

// What the Arc node says about a transaction: confirmed or reverted, block, fee, and the SocialPay
// events in its receipt decoded with the contract's ABI.

import { Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useVerifiedTx } from '../../hooks/useVerifiedTx'
import { formatAddress } from '../../utils/format'

function fee(usdc: string): string {
  const n = Number(usdc)
  if (!Number.isFinite(n) || n === 0) return '0'
  return n < 0.000001 ? '<0.000001' : n.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')
}

export function TxVerification({ hash }: { hash: string }) {
  const v = useVerifiedTx(hash)

  if (v.state === 'idle' || v.state === 'checking') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--muted)' }} role="status">
        <Loader2 size={12} className="animate-spin" aria-hidden /> Checking on the Arc network
      </p>
    )
  }
  if (v.state === 'not-found' || v.state === 'error') {
    return (
      <p className="text-xs" style={{ color: 'var(--muted)' }} role="status">
        {v.state === 'error' ? 'The Arc network could not be reached to check this.' : 'The Arc network does not have this transaction yet.'}
      </p>
    )
  }
  if (v.state === 'inconsistent') {
    return (
      <p className="inline-flex items-center gap-1.5 text-xs" style={{ color: 'var(--danger)' }} role="status">
        <ShieldAlert size={12} aria-hidden /> The network data for this transaction does not agree with itself, so no explorer link is shown.
      </p>
    )
  }
  const t = v.tx
  const ok = t.status === 'success'
  return (
    <div className="min-w-0 flex flex-col gap-1.5">
      <p className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: ok ? 'var(--success)' : 'var(--danger)' }}>
        <ShieldCheck size={12} aria-hidden />
        {ok ? 'Confirmed on Arc' : 'Reverted on Arc'} · block {t.blockNumber.toLocaleString('en-US')} · fee {fee(t.feeUsdc)} USDC
      </p>
      {t.socialPayEvents.length > 0 && (
        <ul className="flex flex-col gap-1">
          {t.socialPayEvents.map((e) => (
            <li key={`${e.txHash}:${e.logIndex}`} className="text-xs text-pretty" style={{ color: 'var(--ink)' }}>
              <span className="font-semibold">{e.name}</span>{' '}
              <span style={{ color: 'var(--muted)' }}>
                {e.amountUsdc !== undefined && e.sender && e.recipient
                  ? `${e.amountUsdc} USDC · ${formatAddress(e.sender)} to ${formatAddress(e.recipient)}${e.note ? ` · ${e.note}` : ''}`
                  : e.summary}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
