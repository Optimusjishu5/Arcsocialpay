'use client'

import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { isValidUsdcAmount } from '../../utils/format'
import { buildRequestPath, splitEqually, MAX_MEMO_LENGTH } from '../../utils/payRequests'
import { ExpirySelect } from './ExpirySelect'
import { ShareLinkBox, fieldClass, fieldLabel, fieldStyle } from './ShareLinkBox'

export function SplitBillForm({ address }: { address: string }) {
  const [total, setTotal] = useState('')
  const [people, setPeople] = useState(3)
  const [memo, setMemo] = useState('')
  const [expiresAt, setExpiresAt] = useState<number | undefined>()

  const totalOk = isValidUsdcAmount(total)
  const split = totalOk ? splitEqually(total, people) : null

  return (
    <div className="rounded-2xl overflow-hidden" data-tc="">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Split a bill</h3>
      </div>
      <div className="p-4 space-y-4">
        <div>
          <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Total you paid</label>
          <div className="relative">
            <input type="text" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)}
              placeholder="0.00" className={`${fieldClass} h-14 pr-16 text-xl font-semibold tabnum`} style={fieldStyle} />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
          </div>
          {total.trim() !== '' && !totalOk && (
            <p className="text-xs mt-1.5" style={{ color: 'var(--danger)' }}>Enter a valid amount (max 6 decimals).</p>
          )}
        </div>

        <div>
          <label className={fieldLabel} style={{ color: 'var(--muted)' }}>People splitting (including you)</label>
          <div className="flex items-center gap-3">
            <button onClick={() => setPeople((p) => Math.max(2, p - 1))} aria-label="Fewer people"
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              data-ti="">
              <Minus size={16} />
            </button>
            <span className="display text-2xl font-bold tabnum w-12 text-center" style={{ color: 'var(--ink)' }}>{people}</span>
            <button onClick={() => setPeople((p) => Math.min(50, p + 1))} aria-label="More people"
              className="w-11 h-11 rounded-xl flex items-center justify-center"
              data-ti="">
              <Plus size={16} />
            </button>
          </div>
        </div>

        <div>
          <label className={fieldLabel} style={{ color: 'var(--muted)' }}>What is it for? (optional)</label>
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} maxLength={MAX_MEMO_LENGTH}
            placeholder="Team dinner" className={fieldClass} style={fieldStyle} />
        </div>

        <ExpirySelect onChange={setExpiresAt} />

        {split ? (
          <>
            <div className="rounded-xl p-4" data-tp="">
              <p className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>Each of the others pays</p>
              <p className="display text-3xl font-bold tabnum mt-1" style={{ color: 'var(--ink)' }}>
                {split.shareText} <span className="text-base font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
                Your own share is {split.organiserText} USDC. Any leftover fraction stays with you, so the parts always add up to the total.
              </p>
            </div>
            <ShareLinkBox path={buildRequestPath(address, split.shareText, memo, expiresAt)} label="Link to send your group"
              hint={`Everyone who opens it pays ${split.shareText} USDC to your wallet.`} />
          </>
        ) : (
          <p className="text-xs" style={{ color: 'var(--subtle)' }}>
            Enter the total to see each person's share and get one link to send your group.
          </p>
        )}
      </div>
    </div>
  )
}
