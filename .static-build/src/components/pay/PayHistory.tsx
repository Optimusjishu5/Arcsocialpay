'use client'

import { useState } from 'react'
import { History } from 'lucide-react'
import { useWalletActivity } from '../../hooks/useWalletActivity'
import { useOnchainStatus } from '../../hooks/useOnchainActivity'
import { ActivityRow } from '../activity/ActivityRow'
import { Button } from '../ui/Button'

const PAGE = 20

/** Every transaction of the connected wallet, exactly as recorded, newest first. */
export function PayHistory({ address }: { address: string }) {
  const { entries } = useWalletActivity(address)
  const chain = useOnchainStatus()
  const [count, setCount] = useState(PAGE)

  // Only onchain transactions belong here; posts and reactions live in Activity.
  const txEntries = entries.filter((e) => e.tx)
  const shown = txEntries.slice(0, count)
  const loading = txEntries.length === 0 && (!chain.ready || chain.scanning)

  return (
    <div className="rounded-2xl overflow-hidden" data-tc="">
      <div className="px-4 py-3 flex items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>History</h3>
        <span className="text-xs tabnum" style={{ color: 'var(--muted)' }}>
          {txEntries.length.toLocaleString('en-US')} {txEntries.length === 1 ? 'transaction' : 'transactions'}
        </span>
      </div>

      {txEntries.length === 0 ? (
        <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
          <History size={20} aria-hidden style={{ color: 'var(--subtle)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>
            {loading ? 'Loading your transactions...' : 'No payments, swaps or bridges for this wallet yet.'}
          </p>
        </div>
      ) : (
        <div className="p-1.5 flex flex-col">
          {shown.map((e) => <ActivityRow key={e.id} entry={e} />)}
          {txEntries.length > shown.length && (
            <div className="flex justify-center py-3">
              <Button variant="secondary" size="sm" onClick={() => setCount((c) => c + PAGE)}>
                Show more ({(txEntries.length - shown.length).toLocaleString('en-US')} left)
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
