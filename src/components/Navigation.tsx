import { motion } from 'framer-motion'
import {
  LayoutDashboard, MessageSquare, DollarSign, Compass, Bell, User, Moon, Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { useTheme, useAppStore } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { NetworkBadge } from './ui/NetworkBadge'
import type { NavView } from '../types/index'

interface Props {
  current: NavView
  onNavigate: (view: NavView) => void
}

const NAV_ITEMS: { id: NavView; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'pay', label: 'Pay', icon: DollarSign },
  { id: 'explore', label: 'Explore', icon: Compass },
  { id: 'notifications', label: 'Alerts', icon: Bell },
  { id: 'profile', label: 'Profile', icon: User },
]

// ── Desktop Sidebar ────────────────────────────────────────────────────────

export function DesktopNav({ current, onNavigate }: Props) {
  const { address, isConnected } = useArcAccount()
  const { theme, setTheme } = useTheme()
  const { notifications } = useAppStore()
  const unread = notifications.filter((n) => !n.read).length

  return (
    <nav className="hidden md:flex flex-col h-dvh sticky top-0 flex-shrink-0"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
      }}>
      {/* Logo */}
      <div className="px-5 py-5">
        <img src="/logofull.png" alt="SocialPay" width={120} height={48}
          style={{ height: 32, width: 'auto', objectFit: 'contain', objectPosition: 'left center' }} />
      </div>

      {/* Nav items */}
      <div className="flex-1 px-3 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = current === id
          const hasNotif = id === 'notifications' && unread > 0

          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex items-center gap-3 w-full h-11 px-3 rounded-xl transition-all relative"
              style={{
                background: isActive ? 'var(--surface-muted)' : 'transparent',
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                fontWeight: isActive ? 600 : 500,
              }}>
              <div className="relative">
                <Icon size={20} />
                {hasNotif && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs font-bold flex items-center justify-center"
                    style={{ background: 'var(--danger)', color: '#fff', fontSize: 9 }}>
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </div>
              <span className="text-sm">{label}</span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom section */}
      <div className="px-3 pb-5 space-y-3">
        <NetworkBadge />

        {/* Theme toggle */}
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center gap-3 w-full h-10 px-3 rounded-xl transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          <span className="text-sm font-medium">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>

        {/* Wallet */}
        {isConnected && address ? (
          <div className="flex items-center gap-2 p-2 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <Avatar address={address} size={32} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-medium truncate" style={{ color: 'var(--ink)' }}>
                Connected
              </div>
            </div>
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button onClick={show} className="text-xs font-medium px-2 py-1 rounded-lg transition-colors hover:bg-[var(--surface-strong)]"
                  style={{ color: 'var(--muted)' }}>
                  ···
                </button>
              )}
            </ConnectKitButton.Custom>
          </div>
        ) : (
          <ConnectKitButton />
        )}
      </div>
    </nav>
  )
}

// ── Mobile Bottom Tab Bar ──────────────────────────────────────────────────

export function MobileNav({ current, onNavigate }: Props) {
  const { notifications } = useAppStore()
  const unread = notifications.filter((n) => !n.read).length

  // Show 5 items on mobile — drop Explore (still reachable via desktop/gestures), keep Profile.
  const mobileItems = NAV_ITEMS.filter((n) => n.id !== 'explore')

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 safe-bottom"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(16px)',
      }}>
      <div className="flex items-center justify-around px-2 pt-2 pb-1">
        {mobileItems.map(({ id, label, icon: Icon }) => {
          const isActive = current === id
          const hasNotif = id === 'notifications' && unread > 0

          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl transition-colors relative min-w-0"
              style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }}>
              <div className="relative">
                <Icon size={22} />
                {hasNotif && (
                  <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full text-xs font-bold flex items-center justify-center"
                    style={{ background: 'var(--danger)', color: '#fff', fontSize: 8 }}>
                    {unread}
                  </span>
                )}
              </div>
              <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ── Mobile Top Bar ─────────────────────────────────────────────────────────

export function MobileTopBar({ title, onNavigate: _onNavigate }: { title: string; onNavigate: (view: NavView) => void }) {
  const { address, isConnected } = useArcAccount()
  const { theme, setTheme } = useTheme()

  return (
    <div className="md:hidden flex items-center justify-between px-4 py-3 sticky top-0 z-40"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
      <div className="flex items-center gap-2">
        <img src="/logo.png" alt="SocialPay logo" width={28} height={28}
          className="rounded-lg" style={{ width: 28, height: 28, objectFit: 'cover' }} />
        <span className="display font-bold text-sm" style={{ color: 'var(--ink)' }}>{title}</span>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        {isConnected && address ? (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show}>
                <Avatar address={address} size={32} />
              </button>
            )}
          </ConnectKitButton.Custom>
        ) : (
          <ConnectKitButton label="Connect" />
        )}
      </div>
    </div>
  )
}
