'use client'

import { useState } from 'react'
import { isValidUsdcAmount } from '../../utils/format'
import { buildRequestPath, MAX_MEMO_LENGTH } from '../../utils/payRequests'
import { ExpirySelect } from './ExpirySelect'
import { ShareLinkBox, fieldClass, fieldLabel, fieldStyle } from './ShareLinkBox'

export function RequestForm({ address }: { address: string }) {
  const [amount, setAmount] = useState('')
  const [memo, setMemo] = useState('')
  const amountOk = amount.trim() === '' || isValidUsdcAmount(amount)
  const [expiresAt, setExpiresAt] = useState<number | undefined>()
  const path = buildRequestPath(address, amountOk ? amount : '', memo, expiresAt)

  return (
    <div className="rounded-2xl overflow-hidden" data-tc="">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Request money</h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Amount (optional)</label>
          <div className="relative">
            <input type="text" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              placeholder="Leave empty to let them choose"
              className={`${fieldClass} pr-16 tabnum`} style={fieldStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          {!amountOk && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>Enter a valid amount (max 6 decimals).</p>
          )}
          <div className="flex gap-2 mt-2">
            {['1', '5', '10', '25'].map((v) => (
              <button key={v} onClick={() => setAmount(v)}
                className="flex-1 h-9 rounded-lg text-xs font-medium"
                data-chip="">
                ${v}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className={fieldLabel} style={{ color: 'var(--muted)' }}>What is it for? (optional)</label>
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={MAX_MEMO_LENGTH}
            placeholder="Dinner, rent, concert tickets..." className={fieldClass} style={fieldStyle} />
        </div>
        <ExpirySelect onChange={setExpiresAt} />
        <ShareLinkBox path={path} label="Your request link"
          hint={expiresAt
            ? `Expires ${new Date(expiresAt).toLocaleString()}. The payer sees a warning after that; it is a courtesy, not enforced onchain.`
            : 'Whoever opens this link lands on a ready-to-confirm payment to your wallet.'} />
      </div>
    </div>
  )
}
