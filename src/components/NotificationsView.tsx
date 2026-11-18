import { useEffect, useState } from 'react'
import { POLL_NOW_EVENT } from '../hooks/usePersistentChat'
import { OPEN_CHAT_EVENT } from '../lib/incomingAlerts'
import { motion } from 'framer-motion'
import { Heart, MessageCircle, Repeat2, UserPlus, DollarSign, AtSign, Check } from 'lucide-react'
import { useArcAccount } from '../hooks/useArcWallet'
import { appStore, useAppStore, filterNotificationsForAddress } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { EmptyState } from './ui/EmptyState'
import { useSettings } from '../hooks/useSettings'
import { formatTimestamp, formatAddress } from '../utils/format'
import type { Notification, NotifType } from '../types/index'

const FILTERS: Array<{ id: 'all' | NotifType; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'payment', label: 'Payments' },
  { id: 'message', label: 'Messages' },
  { id: 'like', label: 'Likes' },
  { id: 'comment', label: 'Comments' },
  { id: 'repost', label: 'Reposts' },
  { id: 'follow', label: 'Followers' },
  { id: 'mention', label: 'Mentions' },
]

export function NotificationsView() {
  const { address, isConnected } = useArcAccount()
  const { notifications } = useAppStore()

  // Scope to current address (case-insensitive); store keeps all-local notifs
  // when no recipient field exists, so this is best-effort filtering.
  const { filterNotifications } = useSettings()
  const myNotifs = filterNotifications(filterNotificationsForAddress(notifications, address))
  const [filter, setFilter] = useState<'all' | NotifType>('all')
  const shown = filter === 'all' ? myNotifs : myNotifs.filter((n) => n.type === filter)

  useEffect(() => {
    if (isConnected) {
      appStore.markNotificationsRead()
      // Look for new messages right now, so the list is up to date when the bell is opened.
      window.dispatchEvent(new Event(POLL_NOW_EVENT))
    }
  }, [isConnected])

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100dvh-120px)]">
        <p className="text-sm" style={{ color: 'var(--muted)' }}>Connect wallet to see notifications</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto pb-8">
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
        <h2 className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Notifications</h2>
        {myNotifs.some((n) => !n.read) && (
          <button className="text-xs font-medium" style={{ color: 'var(--accent)' }}
            onClick={() => appStore.markNotificationsRead()}>
            Mark all read
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3 no-scrollbar" role="tablist" aria-label="Notification types">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? myNotifs.length : myNotifs.filter((n) => n.type === f.id).length
          const active = filter === f.id
          return (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f.id)}
              className="h-10 flex-shrink-0 rounded-full px-4 text-sm font-semibold active:scale-95 transition-transform"
              style={{
                background: active ? 'var(--accent)' : 'var(--surface-muted)',
                color: active ? 'var(--accent-ink, #fff)' : 'var(--ink)',
                border: '1px solid var(--border)',
              }}>
              {f.label}{count > 0 ? ` ${count}` : ''}
            </button>
          )
        })}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<Check size={24} />}
          title={filter === 'all' ? 'All caught up' : 'Nothing here yet'}
          description={filter === 'all' ? 'New messages, payments, likes and follows will appear here' : 'New activity of this kind will appear here'}
        />
      ) : (
        <div>
          {shown.map((notif) => (
            <NotifItem key={notif.id} notif={notif} me={address} />
          ))}
        </div>
      )}
    </div>
  )
}

function NotifItem({ notif, me }: { notif: Notification; me?: string }) {
  // Follower notices from before the server list existed only know a count, so no one is named.
  const countOnly = notif.type === 'follow' && !!me && notif.fromAddress.toLowerCase() === me.toLowerCase()
  const { icon, color, text } = getNotifMeta(notif)
  // A message alert opens its chat when tapped.
  const opensChat = notif.type === 'message' && !!notif.targetId
  const name = appStore.getProfile(notif.fromAddress)?.username || formatAddress(notif.fromAddress)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      role={opensChat ? 'button' : undefined}
      tabIndex={opensChat ? 0 : undefined}
      onClick={opensChat ? () => window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { convId: notif.targetId } })) : undefined}
      onKeyDown={opensChat ? (e) => { if (e.key === 'Enter') window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { convId: notif.targetId } })) } : undefined}
      className={`flex items-start gap-3 px-4 py-3 ${opensChat ? 'cursor-pointer active:opacity-80' : ''}`}
      style={{
        borderBottom: '1px solid var(--border)',
        background: notif.read ? 'transparent' : 'var(--surface-muted)',
      }}>
      <div className="relative flex-shrink-0">
        <Avatar address={notif.fromAddress} size={40} />
        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ background: color, color: '#fff' }}>
          {icon}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: 'var(--ink)' }}>
          {countOnly ? (
            <span className="font-semibold">{notif.content ?? 'You have a new follower'}</span>
          ) : (
            <>
              <span className="font-semibold">{name}</span>
              {' '}{text}
            </>
          )}
        </p>
        {notif.content && !countOnly && (
          <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{notif.content}</p>
        )}
        <p className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>
          {formatTimestamp(notif.createdAt)}
        </p>
      </div>
      {!notif.read && (
        <div className="w-2 h-2 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--accent)' }} />
      )}
    </motion.div>
  )
}

function getNotifMeta(notif: Notification): { icon: React.ReactNode; color: string; text: string } {
  switch (notif.type) {
    case 'like':
      return { icon: <Heart size={10} />, color: 'var(--danger)', text: 'liked your post' }
    case 'comment':
      return { icon: <MessageCircle size={10} />, color: '#0369a1', text: 'commented on your post' }
    case 'repost':
      return { icon: <Repeat2 size={10} />, color: 'var(--success)', text: 'reposted your post' }
    case 'follow':
      return { icon: <UserPlus size={10} />, color: '#7c3aed', text: 'started following you' }
    case 'payment':
      return { icon: <DollarSign size={10} />, color: 'var(--accent)', text: 'sent you USDC' }
    case 'mention':
      return { icon: <AtSign size={10} />, color: '#0d7460', text: 'mentioned you' }
    case 'message':
      return { icon: <MessageCircle size={10} />, color: 'var(--accent)', text: 'sent you a message' }
  }
}
