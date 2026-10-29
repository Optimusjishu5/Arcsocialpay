'use client'

import { useState } from 'react'
import { EXPIRY_OPTIONS, type ExpiryChoice } from '../../utils/payRequests'
import { fieldLabel } from './ShareLinkBox'

/**
 * Pick how long a payment link stays valid. The expiry time is fixed when the
 * option is chosen (in the click handler), so the link stays stable afterwards.
 */
export function ExpirySelect({ onChange }: { onChange: (expiresAt: number | undefined) => void }) {
  const [choice, setChoice] = useState<ExpiryChoice>('none')

  return (
    <div>
      <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Link expires</label>
      <div className="grid grid-cols-5 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
        {EXPIRY_OPTIONS.map((o) => (
          <button key={o.value}
            onClick={() => {
              setChoice(o.value)
              onChange(o.ms > 0 ? Date.now() + o.ms : undefined)
            }}
            className="h-9 rounded-lg text-xs font-semibold transition-all"
            style={{
              background: choice === o.value ? 'var(--surface-strong)' : 'transparent',
              color: choice === o.value ? 'var(--ink)' : 'var(--muted)',
              boxShadow: choice === o.value ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
            {o.value === 'none' ? 'Never' : o.value}
          </button>
        ))}
      </div>
    </div>
  )
}
