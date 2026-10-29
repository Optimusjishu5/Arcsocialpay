import { AtSign, DollarSign, FileText, Heart, MessageCircle, Repeat2, UserPlus, type LucideIcon } from 'lucide-react'
import type { Comment, Notification, NotifType, Post, TxRecord } from '../../types/index'
import type { Tone } from '../dashboard/ui'
import { describeTx, txUrl } from '../../utils/txPresentation'
import { formatAddress, isSameAddress } from '../../utils/format'

export type EntryKind = 'payment' | 'swap' | 'bridge' | 'social'
export type Filter = 'all' | 'payments' | 'swaps' | 'bridges' | 'social'

export const FILTERS: { id: Filter; label: string; kind?: EntryKind }[] = [
  { id: 'all', label: 'All' },
  { id: 'payments', label: 'Payments', kind: 'payment' },
  { id: 'swaps', label: 'Swaps', kind: 'swap' },
  { id: 'bridges', label: 'Bridges', kind: 'bridge' },
  { id: 'social', label: 'Social', kind: 'social' },
]

export interface Entry {
  id: string
  kind: EntryKind
  at: number
  icon: LucideIcon
  tone: Tone
  title: string
  detail?: string
  amount?: { text: string; sign: '+' | '-' }
  /** The onchain record behind this entry. Missing for social activity. */
  tx?: TxRecord
  url?: string
}

const NOTIF_ICON: Record<NotifType, LucideIcon> = {
  like: Heart, comment: MessageCircle, repost: Repeat2, follow: UserPlus,
  payment: DollarSign, mention: AtSign, message: MessageCircle,
}

const NOTIF_TONE: Record<NotifType, Tone> = {
  like: 'rose', comment: 'blue', repost: 'teal', follow: 'indigo', payment: 'green', mention: 'amber', message: 'violet',
}

const NOTIF_TEXT: Record<NotifType, string> = {
  like: 'liked your post', comment: 'commented on your post', repost: 'reposted you',
  follow: 'started following you', payment: 'paid you', mention: 'mentioned you', message: 'sent you a message',
}

export const preview = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n)}...` : s)

interface Sources {
  address: string
  txHistory: TxRecord[]
  posts: Post[]
  comments: Comment[]
  notifications: Notification[]
}

/**
 * One list of transactions for a wallet from every place they are kept: the app's own list
 * (pending sends first, so a live status wins) and the permanent chain history. Each
 * transaction appears once, newest first. Nothing is capped or dropped.
 */
export function mergeWalletTransactions(address: string | undefined, ...lists: TxRecord[][]): TxRecord[] {
  if (!address) return []
  const seen = new Set<string>()
  const out: TxRecord[] = []
  for (const list of lists) {
    for (const t of list) {
      if (!isSameAddress(t.fromAddress, address) && !isSameAddress(t.toAddress, address)) continue
      const key = t.txHash.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(t)
    }
  }
  return out.sort((a, b) => b.timestamp - a.timestamp || (b.blockNumber ?? 0) - (a.blockNumber ?? 0))
}

/** Every transaction for the wallet (nothing is dropped) plus social activity, newest first. */
export function buildEntries({ address, txHistory, posts, comments, notifications }: Sources): Entry[] {
  const list: Entry[] = []
  const seen = new Set<string>()
  for (const t of txHistory) {
    if (!isSameAddress(t.fromAddress, address) && !isSameAddress(t.toAddress, address)) continue
    const key = t.txHash.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const v = describeTx(t, address)
    list.push({
      id: `tx-${key}`, kind: v.kind, at: t.timestamp, icon: v.icon, tone: v.tone,
      title: v.title, detail: v.detail,
      amount: v.amountText ? { text: v.amountText, sign: v.sign === '-' ? '-' : '+' } : undefined,
      tx: t, url: txUrl(t),
    })
  }
  for (const p of posts) {
    if (isSameAddress(p.authorAddress, address)) {
      list.push({
        id: `post-${p.id}`, kind: 'social', at: p.createdAt, icon: FileText, tone: 'violet',
        title: p.repostOf ? 'You reposted' : 'You posted', detail: preview(p.content),
      })
    } else if (p.likes.some((a) => isSameAddress(a, address))) {
      list.push({ id: `like-${p.id}`, kind: 'social', at: p.createdAt, icon: Heart, tone: 'rose', title: 'You liked a post', detail: preview(p.content) })
    }
  }
  for (const c of comments) {
    if (!isSameAddress(c.authorAddress, address)) continue
    list.push({ id: `comment-${c.id}`, kind: 'social', at: c.createdAt, icon: MessageCircle, tone: 'blue', title: 'You commented', detail: preview(c.content) })
  }
  for (const n of notifications) {
    // Payment notifications duplicate the onchain record above.
    if (n.type === 'payment') continue
    list.push({
      id: `notif-${n.id}`, kind: 'social', at: n.createdAt, icon: NOTIF_ICON[n.type], tone: NOTIF_TONE[n.type],
      title: `${formatAddress(n.fromAddress)} ${NOTIF_TEXT[n.type]}`, detail: n.content ? preview(n.content) : undefined,
    })
  }
  // Newest first; entries from the same moment keep chain order (later block first).
  return list.sort((a, b) => b.at - a.at || (b.tx?.blockNumber ?? 0) - (a.tx?.blockNumber ?? 0))
}

export function matchesQuery(e: Entry, q: string): boolean {
  if (!q) return true
  const hay = [
    e.title, e.detail, e.amount?.text,
    e.tx?.txHash, e.tx?.fromAddress, e.tx?.toAddress, e.tx?.note, e.tx?.symbol, e.tx?.summary,
  ].filter(Boolean).join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).every((part) => hay.includes(part))
}

/** "Today", "Yesterday", or a full date, used as the heading above each day's entries. */
export function dayLabel(ts: number, now = new Date()): string {
  const d = new Date(ts)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', {
    weekday: diffDays < 7 ? 'long' : undefined, month: 'short', day: 'numeric',
    year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  })
}

export function groupByDay(entries: Entry[]): { label: string; entries: Entry[] }[] {
  const groups: { label: string; entries: Entry[] }[] = []
  for (const e of entries) {
    const label = dayLabel(e.at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(e)
    else groups.push({ label, entries: [e] })
  }
  return groups
}

const csvCell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)

/** CSV of every onchain transaction in the list. */
export function toCsv(entries: Entry[]): string {
  const rows = [['Date (UTC)', 'Type', 'Direction', 'Amount', 'Token', 'From', 'To', 'Status', 'Note', 'Block', 'Transaction hash']]
  for (const e of entries) {
    const t = e.tx
    if (!t) continue
    rows.push([
      new Date(t.timestamp).toISOString(), t.kind ?? 'payment', t.direction, t.amount, t.symbol ?? 'USDC',
      t.fromAddress, t.toAddress, t.status, t.note ?? t.summary ?? '', t.blockNumber !== undefined ? String(t.blockNumber) : '', t.txHash,
    ])
  }
  return rows.map((r) => r.map(csvCell).join(',')).join('\n')
}
