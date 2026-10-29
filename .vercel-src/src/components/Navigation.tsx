import { motion } from 'framer-motion'
import {
  LayoutDashboard, MessageSquare, DollarSign, Compass, Bell, User, Moon, Sun, Activity, Settings, ArrowLeftRight, Waypoints,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { useTheme, useAppStore, appStore } from '../store/appStore'
import { useSettings } from '../hooks/useSettings'
import { Avatar } from './ui/Avatar'
import { NetworkBadge } from './ui/NetworkBadge'
import { GradientIcon, TONES, type Tone } from './dashboard/ui'
import type { NavView } from '../types/index'

interface Props {
  current: NavView
  onNavigate: (view: NavView) => void
}

const NAV_ITEMS: { id: NavView; label: string; icon: LucideIcon; tone: Tone }[] = [
  { id: 'home', label: 'Home', icon: LayoutDashboard, tone: 'blue' },
  { id: 'messages', label: 'Messages', icon: MessageSquare, tone: 'violet' },
  { id: 'pay', label: 'Pay', icon: DollarSign, tone: 'green' },
  { id: 'swap', label: 'Swap', icon: ArrowLeftRight, tone: 'indigo' },
  { id: 'bridge', label: 'Bridge', icon: Waypoints, tone: 'amber' },
  { id: 'explore', label: 'Explore', icon: Compass, tone: 'rose' },
  { id: 'activity', label: 'Activity', icon: Activity, tone: 'teal' },
  { id: 'notifications', label: 'Alerts', icon: Bell, tone: 'pink' },
  { id: 'profile', label: 'Profile', icon: User, tone: 'blue' },
  { id: 'settings', label: 'Settings', icon: Settings, tone: 'indigo' },
]

// ── Desktop Sidebar ────────────────────────────────────────────────────────

export function DesktopNav({ current, onNavigate }: Props) {
  const { address, isConnected } = useArcAccount()
  const { theme, setTheme } = useTheme()
  const { notifications } = useAppStore()
  const { filterNotifications } = useSettings()
  const unread = filterNotifications(notifications).filter((n) => !n.read).length

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
        {NAV_ITEMS.map(({ id, label, icon, tone }) => {
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
                <GradientIcon icon={icon} tone={tone} size={30} />
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
  const { theme } = useTheme()
  // Seven tabs on mobile; the bar scrolls sideways on narrow screens. Alerts, Settings and Profile live in the top bar.
  const mobileItems = NAV_ITEMS.filter((n) => ['home', 'messages', 'pay', 'swap', 'bridge', 'explore', 'activity'].includes(n.id))

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 safe-bottom"
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        backdropFilter: 'blur(16px)',
      }}>
      <div className="flex items-center px-2 pt-2 pb-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
        {mobileItems.map(({ id, label, icon: Icon, tone }) => {
          const isActive = current === id

          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className="flex flex-col items-center gap-0.5 flex-1 py-1 rounded-xl transition-colors relative min-w-[64px]"
              style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }}>
              <div className="relative">
                {isActive
                  ? <GradientIcon icon={Icon} tone={tone} size={32} />
                  : <span className="inline-flex items-center justify-center" style={{ width: 32, height: 32, color: TONES[tone][theme === 'dark' ? 0 : 1] }}><Icon size={22} /></span>}
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

/** Ring color around a profile picture: the profile's chosen color, or blue until one is picked. */
function profileTone(addr: string): Tone {
  const picked = appStore.getProfile(addr)?.accent
  return picked && picked in TONES ? (picked as Tone) : 'blue'
}

export function MobileTopBar({ title, onNavigate }: { title: string; onNavigate: (view: NavView) => void }) {
  const { address, isConnected } = useArcAccount()
  const { theme, setTheme } = useTheme()
  const { notifications } = useAppStore()
  const { filterNotifications } = useSettings()
  const unread = filterNotifications(notifications).filter((n) => !n.read).length

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
        <button onClick={() => onNavigate('notifications')} aria-label="Alerts"
          className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          <Bell size={16} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-3.5 h-3.5 px-0.5 rounded-full font-bold flex items-center justify-center"
              style={{ background: 'var(--danger)', color: '#fff', fontSize: 8 }}>
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
        <button onClick={() => onNavigate('settings')} aria-label="Settings"
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          <Settings size={16} />
        </button>
        {isConnected && address ? (
          <button onClick={() => onNavigate('profile')} aria-label="Your profile" className="transition-transform hover:scale-105 active:scale-95">
            <span
              className="block rounded-full p-[2px]"
              style={{
                background: `linear-gradient(135deg, ${TONES[profileTone(address)][0]}, ${TONES[profileTone(address)][1]})`,
                boxShadow: `0 6px 14px -6px ${TONES[profileTone(address)][1]}`,
              }}
            >
              <span className="block rounded-full p-[2px]" style={{ background: 'var(--bg)' }}>
                <Avatar address={address} size={28} />
              </span>
            </span>
          </button>
        ) : (
          <ConnectKitButton label="Connect" />
        )}
      </div>
    </div>
  )
}
