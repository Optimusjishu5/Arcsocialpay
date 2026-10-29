'use client'

import { useMemo, useState } from 'react'
import {
  ArrowDownLeft, ArrowUpRight, ExternalLink, FileText, Heart, MessageCircle, Repeat2, UserPlus, DollarSign, AtSign,
  Activity as ActivityIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { useAppStore } from '../store/appStore'
import { useSettings } from '../hooks/useSettings'
import { EmptyState } from './ui/EmptyState'
import { TxStatusBadge } from './ui/TxStatusBadge'
import { formatAddress, formatTimestamp, isSameAddress } from '../utils/format'
import type { NotifType } from '../types/index'
import { describeTx, txUrl } from '../utils/txPresentation'
import { useOnchainStatus } from '../hooks/useOnchainActivity'
import { Button } from './ui/Button'

type Filter = 'all' | 'payments' | 'swaps' | 'bridges' | 'social'

interface Entry {
  id: string
  kind: 'payment' | 'swap' | 'bridge' | 'social'
  at: number
  icon: LucideIcon
  title: string
  detail?: string
  amount?: { text: string; sign: '+' | '-' }
  status?: 'pending' | 'confirmed' | 'failed'
  txHash?: string
  url?: string
}

const NOTIF_ICON: Record<NotifType, LucideIcon> = {
  like: Heart, comment: MessageCircle, repost: Repeat2, follow: UserPlus,
  payment: DollarSign, mention: AtSign, message: MessageCircle,
}

const NOTIF_TEXT: Record<NotifType, string> = {
  like: 'liked your post', comment: 'commented on your post', repost: 'reposted you',
  follow: 'started following you', payment: 'paid you', mention: 'mentioned you', message: 'sent you a message',
}

const preview = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}...` : s)

export function ActivityView() {
  const { address, isConnected } = useArcAccount()
  const { txHistory, posts, comments, notifications } = useAppStore()
  const { filterNotifications } = useSettings()
  const [filter, setFilter] = useState<Filter>('all')
  const chain = useOnchainStatus()

  const entries = useMemo<Entry[]>(() => {
    if (!address) return []
    const list: Entry[] = []
    for (const t of txHistory) {
      if (!isSameAddress(t.fromAddress, address) && !isSameAddress(t.toAddress, address)) continue
      const v = describeTx(t, address)
      list.push({
        id: `tx-${t.id}`, kind: v.kind, at: t.timestamp, icon: v.icon,
        title: v.title, detail: v.detail,
        amount: v.amountText ? { text: v.amountText, sign: v.sign === '-' ? '-' : '+' } : undefined,
        status: t.status, txHash: t.txHash, url: txUrl(t),
      })
    }
    for (const p of posts) {
      if (!isSameAddress(p.authorAddress, address)) continue
      list.push({
        id: `post-${p.id}`, kind: 'social', at: p.createdAt, icon: FileText,
        title: p.repostOf ? 'You reposted' : 'You posted', detail: preview(p.content),
      })
    }
    for (const p of posts) {
      if (isSameAddress(p.authorAddress, address)) continue
      if (p.likes.some((a) => isSameAddress(a, address))) {
        list.push({ id: `like-${p.id}`, kind: 'social', at: p.createdAt, icon: Heart, title: 'You liked a post', detail: preview(p.content) })
      }
    }
    for (const c of comments) {
      if (!isSameAddress(c.authorAddress, address)) continue
      list.push({ id: `comment-${c.id}`, kind: 'social', at: c.createdAt, icon: MessageCircle, title: 'You commented', detail: preview(c.content) })
    }
    for (const n of filterNotifications(notifications)) {
      // Payment notifications duplicate the onchain record above.
      if (n.type === 'payment') continue
      list.push({
        id: `notif-${n.id}`, kind: 'social', at: n.createdAt, icon: NOTIF_ICON[n.type],
        title: `${formatAddress(n.fromAddress)} ${NOTIF_TEXT[n.type]}`, detail: n.content ? preview(n.content) : undefined,
      })
    }
    return list.sort((a, b) => b.at - a.at)
  }, [address, txHistory, posts, comments, notifications, filterNotifications])

  const shown = entries.filter((e) => filter === 'all' || e.kind === ({ payments: 'payment', swaps: 'swap', bridges: 'bridge', social: 'social' } as const)[filter])

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to see your activity</p>
        <ConnectKitButton />
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto pb-8">
      <div className="px-4 pt-4 pb-3">
        <h2 className="display font-bold text-lg mb-3" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Activity</h2>
        <div className="grid grid-cols-5 gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
          {(['all', 'payments', 'swaps', 'bridges', 'social'] as Filter[]).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className="h-9 rounded-lg text-xs sm:text-sm font-semibold capitalize transition-all"
              style={{
                background: filter === f ? 'var(--surface-strong)' : 'transparent',
                color: filter === f ? 'var(--ink)' : 'var(--muted)',
                boxShadow: filter === f ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              }}>
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pb-3 flex items-center justify-between gap-3 text-xs" style={{ color: 'var(--muted)' }}>
        <span>
          {chain.scanning
            ? `Checking the chain for your payments and swaps... ${Math.round(chain.progress * 100)}%`
            : chain.incomplete
              ? 'Some of your history could not be loaded yet (the network limits how fast it can be read). Tap Load older to continue.'
              : chain.daysCovered > 0
                ? `Payments, swaps and bridges from the last ${chain.daysCovered} day${chain.daysCovered === 1 ? '' : 's'}, read from Arc.`
                : 'Reading your history from Arc.'}
        </span>
        <Button size="sm" variant="secondary" onClick={chain.loadOlder} disabled={chain.scanning}>Load older</Button>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon={<ActivityIcon size={24} />} title="Nothing here yet"
          description="Your payments, posts, comments and reactions will show up here as one timeline." />
      ) : (
        <div className="mx-4 rounded-2xl overflow-hidden divide-y" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderColor: 'var(--border)' }}>
          {shown.map((e) => {
            const Icon = e.icon
            return (
              <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'var(--surface-muted)', color: e.amount ? (e.amount.sign === '-' ? 'var(--danger)' : 'var(--success)') : 'var(--muted)' }}>
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{e.title}</span>
                    {e.status && <TxStatusBadge status={e.status} />}
                  </div>
                  <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                    {formatTimestamp(e.at)}{e.detail ? ` · ${e.detail}` : ''}
                  </p>
                </div>
                {e.amount && (
                  <span className="tabnum font-semibold text-sm" style={{ color: e.amount.sign === '-' ? 'var(--danger)' : 'var(--success)' }}>
                    {e.amount.sign}{e.amount.text}
                  </span>
                )}
                {e.txHash && (
                  <a href={e.url ?? ''} target="_blank" rel="noopener noreferrer"
                    aria-label="View on Arc Explorer" className="p-1.5 rounded" style={{ color: 'var(--muted)' }}>
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            )
          })}
        </div>
      )}
      <p className="text-xs px-4 mt-3" style={{ color: 'var(--subtle)' }}>
        Payments are confirmed against the Arc network by transaction hash. Posts, comments and reactions are app data stored off-chain.
      </p>
    </div>
  )
}
