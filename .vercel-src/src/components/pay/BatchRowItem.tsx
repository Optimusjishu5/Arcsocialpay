'use client'

import { useState } from 'react'
import { isAddress } from 'viem'
import { Check, ClipboardPaste, ExternalLink, Loader2, Trash2, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Avatar } from '../ui/Avatar'
import { cleanAmountInput } from '../swap/SwapPanel'
import { ARC_CHAIN_ID } from '../../hooks/useArcWallet'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { formatAddress } from '../../utils/format'
import type { BatchRow } from '../../utils/batch'

interface Props {
  index: number
  row: BatchRow
  error: string | null
  disabled: boolean
  autoFocus?: boolean
  onChange: (patch: Partial<BatchRow>) => void
  onRemove: () => void
  /** Enter pressed in the amount box. */
  onEnter: () => void
}

/**
 * One recipient as a compact line: avatar, address, amount, remove.
 * On narrow screens the amount drops to its own full-width line.
 */
export function BatchRowItem({ index, row, error, disabled, autoFocus, onChange, onRemove, onEnter }: Props) {
  const [amountFocused, setAmountFocused] = useState(false)
  const locked = row.status !== 'queued' && row.status !== 'failed'
  const frozen = locked || disabled
  const validAddress = isAddress(row.address.trim())
  const touched = row.address !== '' || row.amount !== ''
  const showError = touched && !!error && !locked
  const sent = row.status === 'confirmed'
  const busy = row.status === 'signing' || row.status === 'confirming'

  async function paste() {
    try {
      const text = (await navigator.clipboard.readText()).trim()
      if (text) onChange({ address: text })
    } catch {
      toast.error('Clipboard is blocked. Paste the address into the box instead.')
    }
  }

  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] sm:grid-cols-[auto_minmax(0,1fr)_9.5rem_auto] gap-x-2.5 gap-y-2.5 items-start sm:items-center px-3 py-3.5 transition-colors"
      style={{ background: sent ? 'color-mix(in srgb, var(--success) 7%, transparent)' : undefined }}
    >
      <div className="relative w-9 h-9 mt-1.5 sm:mt-0 col-start-1 row-start-1">
        {validAddress ? (
          <Avatar address={row.address.trim()} size={36} />
        ) : (
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold tabnum"
            style={{ background: 'var(--surface-strong)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
            {index + 1}
          </span>
        )}
        {sent && (
          <span className="absolute -right-1 -bottom-1 w-4 h-4 rounded-full flex items-center justify-center text-white" style={{ background: 'var(--success)' }}>
            <Check size={10} strokeWidth={3} />
          </span>
        )}
      </div>

      <div className="relative min-w-0 col-span-2 sm:col-span-1 row-start-1">
        <textarea
          value={row.address}
          disabled={frozen}
          autoFocus={autoFocus}
          rows={2}
          placeholder="Paste or type the recipient address (0x...)"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault() }}
          onChange={(e) => onChange({ address: e.target.value.replace(/\s/g, '') })}
          data-ti=""
          className="block w-full h-[3.75rem] resize-none rounded-xl py-2 pl-3 pr-11 text-sm leading-snug mono break-all disabled:opacity-70"
          aria-label={`Recipient ${index + 1}`}
        />
        {!frozen && !row.address && (
          <button type="button" onClick={() => { void paste() }} aria-label="Paste address"
            className="absolute right-1.5 top-1.5 w-9 h-9 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{ color: 'var(--tone-text)' }}>
            <ClipboardPaste size={17} />
          </button>
        )}
      </div>

      <div className="col-start-1 col-span-2 row-start-2 sm:col-start-3 sm:col-span-1 sm:row-start-1 flex items-center gap-2 h-12 sm:h-[3.75rem] rounded-xl px-3 transition-shadow"
        style={{
          background: 'var(--surface-strong)',
          border: `1px solid ${showError ? 'var(--danger)' : amountFocused ? 'var(--tone-to)' : 'var(--border)'}`,
          boxShadow: amountFocused ? '0 0 0 3px color-mix(in srgb, var(--tone-from) 30%, transparent)' : 'none',
          opacity: frozen ? 0.75 : 1,
        }}>
        <input
          value={row.amount}
          disabled={frozen}
          placeholder="0.00"
          inputMode="decimal"
          autoComplete="off"
          onFocus={() => setAmountFocused(true)}
          onBlur={() => setAmountFocused(false)}
          onKeyDown={(e) => { if (e.key === 'Enter') onEnter() }}
          onChange={(e) => {
            const next = cleanAmountInput(e.target.value, 6)
            if (next !== null) onChange({ amount: next })
          }}
          aria-label={`Amount ${index + 1}`}
          className="display flex-1 min-w-0 bg-transparent outline-none text-lg font-bold tabnum text-right sm:text-right placeholder:opacity-30"
          style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
        />
        <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--subtle)' }}>USDC</span>
      </div>

      <div className="col-start-3 row-start-2 sm:col-start-4 sm:row-start-1">
        {sent ? (
          <span className="w-10 h-10 flex items-center justify-center" style={{ color: 'var(--success)' }} aria-label="Sent"><Check size={18} /></span>
        ) : (
          <button type="button" onClick={onRemove} disabled={disabled || locked} aria-label={`Remove recipient ${index + 1}`}
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{ color: 'var(--subtle)' }}>
            <Trash2 size={16} />
          </button>
        )}
      </div>

      {showError && (
        <p className="col-span-full text-xs flex items-center gap-1.5 -mt-1" style={{ color: 'var(--danger)' }} role="alert">
          <TriangleAlert size={12} /> {error}
        </p>
      )}
      {row.status !== 'queued' && (
        <p className="col-span-full text-xs flex items-center gap-1.5 flex-wrap -mt-1"
          style={{ color: row.status === 'failed' ? 'var(--danger)' : sent ? 'var(--success)' : 'var(--muted)' }} aria-live="polite">
          {busy && <Loader2 size={12} className="animate-spin" />}
          {row.status === 'signing' && 'Confirm in your wallet...'}
          {row.status === 'confirming' && 'Confirming onchain...'}
          {sent && `Sent to ${formatAddress(row.address)}`}
          {row.status === 'failed' && (row.error ?? 'Failed')}
          {row.hash && (
            <a href={buildTxExplorerUrl(ARC_CHAIN_ID, row.hash)} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--tone-text)' }}>
              <ExternalLink size={11} /> View
            </a>
          )}
        </p>
      )}
    </li>
  )
}
