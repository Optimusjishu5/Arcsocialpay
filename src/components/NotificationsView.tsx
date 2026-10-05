import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Heart, MessageCircle, Repeat2, UserPlus, DollarSign, AtSign, Check } from 'lucide-react'
import { useArcAccount } from '../hooks/useArcWallet'
import { appStore, useAppStore, filterNotificationsForAddress } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { EmptyState } from './ui/EmptyState'
import { formatTimestamp, formatAddress } from '../utils/format'
import type { Notification } from '../types/index'

export function NotificationsView() {
  const { address, isConnected } = useArcAccount()
  const { notifications } = useAppStore()

  // Scope to current address (case-insensitive); store keeps all-local notifs
  // when no recipient field exists, so this is best-effort filtering.
  const myNotifs = filterNotificationsForAddress(notifications, address)

  useEffect(() => {
    if (isConnected) {
      appStore.markNotificationsRead()
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

      {myNotifs.length === 0 ? (
        <EmptyState
          icon={<Check size={24} />}
          title="All caught up"
          description="Notifications about likes, follows, payments and more will appear here"
        />
      ) : (
        <div>
          {myNotifs.map((notif) => (
            <NotifItem key={notif.id} notif={notif} />
          ))}
        </div>
      )}
    </div>
  )
}

function NotifItem({ notif }: { notif: Notification }) {
  const { icon, color, text } = getNotifMeta(notif)

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 px-4 py-3"
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
          <span className="font-semibold">{formatAddress(notif.fromAddress)}</span>
          {' '}{text}
        </p>
        {notif.content && (
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
  }
}
