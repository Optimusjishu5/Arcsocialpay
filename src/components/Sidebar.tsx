import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import {
  Home, Compass, MessageCircle, Bell, Wallet, User,
  Users, Settings, Moon, Sun, PenSquare, LogOut, type LucideProps,
} from 'lucide-react'
import { useStore, actions, shortAddress } from '../store'
import type { ActiveView } from '../types'
import { motion } from 'framer-motion'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

const NAV_ITEMS: { view: ActiveView; label: string; Icon: LucideIcon }[] = [
  { view: 'feed', label: 'Home', Icon: Home },
  { view: 'explore', label: 'Explore', Icon: Compass },
  { view: 'messages', label: 'Messages', Icon: MessageCircle },
  { view: 'notifications', label: 'Notifications', Icon: Bell },
  { view: 'wallet', label: 'Wallet', Icon: Wallet },
  { view: 'communities', label: 'Communities', Icon: Users },
  { view: 'profile', label: 'Profile', Icon: User },
]

export default function Sidebar() {
  const activeView = useStore(s => s.activeView)
  const theme = useStore(s => s.theme)
  const currentUserId = useStore(s => s.currentUserId)
  const currentUser = useStore(s => s.currentUserId ? s.users[s.currentUserId] : undefined)
  const unreadNotifs = useStore(s => s.notifications.filter(n => !n.read).length)
  const unreadMessages = useStore(s => Object.values(s.conversations).reduce((acc, c) => acc + c.unreadCount, 0))
  const { address, isConnected } = useAccount()

  return (
    <aside
      className="hidden md:flex flex-col fixed left-0 top-0 h-full z-40 border-r"
      style={{
        width: 'var(--sidebar-w)',
        background: 'var(--surface-strong)',
        backdropFilter: 'blur(20px)',
        borderColor: 'var(--border)',
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-4 flex items-center gap-3">
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center font-bold text-sm"
          style={{ background: 'var(--accent)', color: theme === 'dark' ? 'var(--bg)' : '#fff' }}
        >
          A
        </div>
        <div>
          <div className="display font-bold text-base leading-tight" style={{ color: 'var(--ink)' }}>
            ArcSocial
          </div>
          <div className="text-xs" style={{ color: 'var(--subtle)' }}>
            Arc Testnet
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scroll-area">
        {NAV_ITEMS.map(({ view, label, Icon }) => {
          const active = activeView === view
          const badge = view === 'notifications' ? unreadNotifs : view === 'messages' ? unreadMessages : 0
          return (
            <button
              key={view}
              onClick={() => actions.navigate(view)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all relative"
              style={{
                color: active ? 'var(--accent)' : 'var(--ink-2)',
                background: active ? 'var(--accent-soft)' : 'transparent',
              }}
            >
              <span className="relative">
                <Icon size={20} strokeWidth={active ? 2.5 : 2} />
                {badge > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: 'var(--danger)', color: '#fff' }}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {label}
              {active && (
                <motion.div
                  layoutId="sidebar-active"
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </nav>

      {/* Compose */}
      <div className="px-4 py-3">
        <button
          onClick={() => {
            if (!currentUserId) return
            actions.openComposer()
          }}
          disabled={!currentUserId}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-40"
          style={{ background: 'var(--accent)', color: theme === 'dark' ? 'var(--bg)' : '#fff' }}
        >
          <PenSquare size={16} />
          New Post
        </button>
      </div>

      {/* Bottom: wallet connect + settings + theme */}
      <div
        className="px-4 pb-6 pt-3 border-t space-y-2"
        style={{ borderColor: 'var(--border)' }}
      >
        {/* Theme toggle */}
        <div className="flex items-center justify-between px-1">
          <span className="text-xs" style={{ color: 'var(--subtle)' }}>Appearance</span>
          <button
            onClick={() => actions.setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
          >
            {theme === 'dark' ? <Sun size={13} /> : <Moon size={13} />}
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>

        {/* Settings */}
        <button
          onClick={() => actions.navigate('settings')}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all"
          style={{ color: 'var(--muted)' }}
        >
          <Settings size={16} />
          Settings
        </button>

        {/* Wallet connect */}
        <div className="pt-1">
          {isConnected && address ? (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: 'var(--surface-muted)' }}
            >
              {currentUser?.avatarUrl && (
                <img src={currentUser.avatarUrl} alt="" className="w-7 h-7 rounded-full" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>
                  {currentUser?.displayName ?? shortAddress(address)}
                </div>
                <div className="text-[11px] mono" style={{ color: 'var(--subtle)' }}>
                  {shortAddress(address)}
                </div>
              </div>
              <ConnectKitButton.Custom>
                {({ show }) => (
                  <button onClick={show} className="p-1 rounded-lg transition-all hover:opacity-70">
                    <LogOut size={14} style={{ color: 'var(--muted)' }} />
                  </button>
                )}
              </ConnectKitButton.Custom>
            </div>
          ) : (
            <ConnectKitButton.Custom>
              {({ show }) => (
                <button
                  onClick={show}
                  className="w-full py-2 rounded-xl text-sm font-semibold transition-all border"
                  style={{
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  }}
                >
                  Connect Wallet
                </button>
              )}
            </ConnectKitButton.Custom>
          )}
        </div>
      </div>
    </aside>
  )
}
