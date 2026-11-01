import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard, MessageSquare, DollarSign, Compass, Bell, User, Moon, Sun, Activity, Settings, ArrowLeftRight, Waypoints, Ellipsis,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { useTheme, useAppStore, appStore } from '../store/appStore'
import { useSettings } from '../hooks/useSettings'
import { Avatar } from './ui/Avatar'
import { NetworkBadge } from './ui/NetworkBadge'
import { DisconnectButton, WalletPill } from './ui/WalletPill'
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
      </div>
    </nav>
  )
}

// ── Desktop Top Bar ────────────────────────────────────────────────────────

/** Desktop header with the single wallet button at the top right. */
export function DesktopTopBar() {
  const { address, isConnected } = useArcAccount()
  return (
    <div className="hidden md:flex items-center justify-end px-6 py-3 sticky top-0 z-40"
      style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
      {isConnected && address ? <WalletPill address={address} /> : <ConnectKitButton />}
    </div>
  )
}

// ── Mobile Bottom Tab Bar ──────────────────────────────────────────────────

// Five tabs stay in the bar; Messages, Explore and the rest open from "More".
const MOBILE_TABS: NavView[] = ['home', 'pay', 'swap', 'bridge', 'activity']
const MORE_ITEMS: NavView[] = ['messages', 'explore', 'notifications', 'profile', 'settings']

export function MobileNav({ current, onNavigate }: Props) {
  const { theme } = useTheme()
  const [moreOpen, setMoreOpen] = useState(false)
  const tabs = MOBILE_TABS.map((id) => NAV_ITEMS.find((n) => n.id === id)).filter((n): n is (typeof NAV_ITEMS)[number] => !!n)
  const moreItems = MORE_ITEMS.map((id) => NAV_ITEMS.find((n) => n.id === id)).filter((n): n is (typeof NAV_ITEMS)[number] => !!n)
  const moreActive = moreOpen || MORE_ITEMS.includes(current)

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoreOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const go = (id: NavView) => { setMoreOpen(false); onNavigate(id) }
  const tabClass = 'flex flex-col items-center gap-0.5 flex-1 min-w-0 py-1 rounded-xl transition-colors relative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'

  return (
    <>
      <AnimatePresence>
        {moreOpen && (
          <motion.div
            key="more-sheet"
            className="md:hidden fixed inset-0 z-50 flex items-end"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <button type="button" aria-label="Close menu" onClick={() => setMoreOpen(false)} className="absolute inset-0" style={{ background: 'rgba(8,20,40,0.45)' }} />
            <motion.div
              role="dialog" aria-label="More"
              initial={{ y: 48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 48, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative w-full rounded-t-[28px] px-4 pt-3 safe-bottom"
              style={{ background: 'var(--surface-strong)', borderTop: '1px solid var(--border)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full" style={{ background: 'var(--border-strong)' }} />
              <p className="text-xs font-semibold uppercase tracking-wider px-1 mb-2" style={{ color: 'var(--subtle)' }}>More</p>
              <div className="grid grid-cols-3 gap-2">
                {moreItems.map(({ id, label, icon, tone }) => (
                  <button
                    key={id}
                    onClick={() => go(id)}
                    className="flex flex-col items-center gap-1.5 py-3 rounded-2xl transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                    style={{ background: current === id ? 'var(--surface-muted)' : 'var(--surface)', border: '1px solid var(--border)', color: current === id ? 'var(--accent)' : 'var(--ink)' }}
                  >
                    <GradientIcon icon={icon} tone={tone} size={36} />
                    <span className="text-xs font-semibold">{label}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 safe-bottom"
        style={{
          background: 'var(--surface)',
          borderTop: '1px solid var(--border)',
          backdropFilter: 'blur(16px)',
        }}>
        <div className="flex items-center px-2 pt-2 pb-1">
          {tabs.map(({ id, label, icon: Icon, tone }) => {
            const isActive = current === id && !moreOpen
            return (
              <button key={id} onClick={() => go(id)} aria-current={isActive ? 'page' : undefined} className={tabClass}
                style={{ color: isActive ? 'var(--accent)' : 'var(--muted)' }}>
                {isActive
                  ? <GradientIcon icon={Icon} tone={tone} size={32} />
                  : <span className="inline-flex items-center justify-center" style={{ width: 32, height: 32, color: TONES[tone][theme === 'dark' ? 0 : 1] }}><Icon size={22} /></span>}
                <span className={`text-xs font-medium ${isActive ? 'font-semibold' : ''}`}>{label}</span>
              </button>
            )
          })}
          <button onClick={() => setMoreOpen((o) => !o)} aria-haspopup="dialog" aria-expanded={moreOpen} className={tabClass}
            style={{ color: moreActive ? 'var(--accent)' : 'var(--muted)' }}>
            {moreActive
              ? <GradientIcon icon={Ellipsis} tone="indigo" size={32} />
              : <span className="inline-flex items-center justify-center" style={{ width: 32, height: 32, color: TONES.indigo[theme === 'dark' ? 0 : 1] }}><Ellipsis size={22} /></span>}
            <span className={`text-xs font-medium ${moreActive ? 'font-semibold' : ''}`}>More</span>
          </button>
        </div>
      </nav>
    </>
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
          <>
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
          <DisconnectButton size={32} />
          </>
        ) : (
          <ConnectKitButton label="Connect" />
        )}
      </div>
    </div>
  )
}
