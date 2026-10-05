import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useArcAccount } from './hooks/useArcWallet'
import { appStore, useTheme } from './store/appStore'
import { Dashboard } from './components/Dashboard'
import { MessagesView } from './components/MessagesView'
import { PayView } from './components/PayView'
import { SocialFeed } from './components/SocialFeed'
import { ProfileView } from './components/ProfileView'
import { NotificationsView } from './components/NotificationsView'
import { DesktopNav, MobileNav, MobileTopBar } from './components/Navigation'
import type { NavView } from './types'

const VIEW_TITLES: Record<NavView, string> = {
  home: 'Arc SocialPay',
  messages: 'Messages',
  pay: 'Payments',
  explore: 'Explore',
  notifications: 'Notifications',
  profile: 'Profile',
}

interface NavState {
  view: NavView
  extra?: Record<string, string>
}

export default function App() {
  const { theme } = useTheme()
  const { address } = useArcAccount()
  const [nav, setNav] = useState<NavState>(() => {
    // Handle pay= query param for payment requests
    const params = new URLSearchParams(window.location.search)
    const payTo = params.get('pay')
    if (payTo && /^0x[0-9a-fA-F]{40}$/.test(payTo)) {
      return { view: 'pay', extra: { mode: 'send', recipient: payTo } }
    }
    return { view: 'home' }
  })

  // Apply theme class to <html>
  useEffect(() => {
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [theme])

  // Ensure profile on connect
  useEffect(() => {
    if (address) {
      appStore.ensureProfile(address)
    }
  }, [address])

  function navigate(view: NavView, extra?: Record<string, string>) {
    setNav({ view, extra })
    // Scroll to top on navigation
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function renderView() {
    switch (nav.view) {
      case 'home':
        return <Dashboard onNavigate={navigate} />
      case 'messages':
        return <MessagesView initialConvId={nav.extra?.convId} />
      case 'pay':
        return (
          <PayView
            initialMode={(nav.extra?.mode as 'send' | 'receive') ?? 'send'}
            onNavigate={navigate}
          />
        )
      case 'explore':
        return <SocialFeed />
      case 'notifications':
        return <NotificationsView />
      case 'profile':
        return (
          <ProfileView
            viewAddress={nav.extra?.address}
            onNavigate={navigate}
          />
        )
      default:
        return <Dashboard onNavigate={navigate} />
    }
  }

  return (
    <div
      className="min-h-dvh"
      style={{
        background: theme === 'dark'
          ? 'linear-gradient(180deg, #0d1b2f 0%, #0d1b2f 58%, #122d45 100%)'
          : 'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)',
        color: 'var(--ink)',
      }}
    >
      <div className="flex">
        {/* Desktop Sidebar */}
        <DesktopNav current={nav.view} onNavigate={(v) => navigate(v)} />

        {/* Main content */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile top bar */}
          <MobileTopBar title={VIEW_TITLES[nav.view]} onNavigate={navigate} />

          {/* Page content */}
          <main className="flex-1 pb-16 md:pb-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={nav.view}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="min-h-full"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav current={nav.view} onNavigate={(v) => navigate(v)} />
    </div>
  )
}
