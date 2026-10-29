'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { isAddress } from 'viem'
import { useArcAccount, useUsdcBalance } from './hooks/useArcWallet'
import { usePersistentChat } from './hooks/usePersistentChat'
import { usePersistentSocial } from './hooks/usePersistentSocial'
import { usePersistentTxHistory } from './hooks/usePersistentTxHistory'
import { useOnchainActivity } from './hooks/useOnchainActivity'
import { appStore, useTheme } from './store/appStore'
import { Dashboard } from './components/Dashboard'
import { MessagesView } from './components/MessagesView'
import { PayView, type PayMode } from './components/PayView'
import { SocialFeed } from './components/SocialFeed'
import { ProfileView } from './components/ProfileView'
import { NotificationsView } from './components/NotificationsView'
import { ActivityView } from './components/ActivityView'
import { SettingsView } from './components/SettingsView'
import { SwapView } from './components/SwapView'
import { BridgeView } from './components/BridgeView'
import { DesktopNav, MobileNav, MobileTopBar } from './components/Navigation'
import { parsePayPrefill } from './utils/payRequests'
import type { NavView } from './types/index'

const VIEW_TITLES: Record<NavView, string> = {
  home: 'SocialPay',
  messages: 'Messages',
  pay: 'Payments',
  swap: 'Swap',
  bridge: 'Bridge',
  explore: 'Explore',
  activity: 'Activity',
  notifications: 'Notifications',
  profile: 'Profile',
  settings: 'Settings',
}

interface NavState {
  view: NavView
  extra?: Record<string, string>
}

export default function App() {
  const { theme } = useTheme()
  const { address } = useArcAccount()
  const [nav, setNav] = useState<NavState>({ view: 'home' })
  const [payPrefillApplied, setPayPrefillApplied] = useState(false)

  // Handle ?pay= query param for payment request links (client-only, SSR-safe).
  // Validate with isAddress (checksummed, case-insensitive) before prefilling.
  useEffect(() => {
    if (payPrefillApplied || typeof window === 'undefined') return
    try {
      // Optional &amount= and &memo= are validated before they prefill the form.
      const prefill = parsePayPrefill(window.location.search)
      if (prefill.recipient) {
        const extra: Record<string, string> = { mode: 'send', recipient: prefill.recipient }
        if (prefill.amount) extra.amount = prefill.amount
        if (prefill.memo) extra.memo = prefill.memo
        if (prefill.expiresAt) extra.exp = String(prefill.expiresAt)
        setNav({ view: 'pay', extra })
      }
    } catch {
      // ignore malformed URLs — fall through to home
    }
    setPayPrefillApplied(true)
  }, [payPrefillApplied])

  // Apply theme class to <html>
  useEffect(() => {
    if (typeof document === 'undefined') return
    const html = document.documentElement
    if (theme === 'dark') {
      html.classList.add('dark')
    } else {
      html.classList.remove('dark')
    }
  }, [theme])

  // Start reading the balance as soon as a wallet connects, so it is ready before any page needs it.
  useUsdcBalance(address)

  // Ensure profile on connect
  useEffect(() => {
    if (address) {
      appStore.ensureProfile(address)
    }
  }, [address])

  // Persistent chat: hydrate from Turso + write-through when configured.
  // No-op (localStorage only) when TURSO_* env vars are missing.
  usePersistentChat(address)

  // Persistent social feed: posts/comments/profiles, same Turso pattern.
  usePersistentSocial(address)

  // Persistent payment history: normal pay + tips render correctly everywhere.
  usePersistentTxHistory(address)
  useOnchainActivity(address)

  function navigate(view: NavView, extra?: Record<string, string>) {
    setNav({ view, extra })
    // Scroll to top on navigation
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
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
            key={`${nav.extra?.mode ?? 'send'}-${nav.extra?.recipient ?? 'no-recipient'}-${nav.extra?.amount ?? ''}`}
            initialMode={(nav.extra?.mode as PayMode) ?? 'send'}
            initialExpiresAt={nav.extra?.exp ? Number(nav.extra.exp) : undefined}
            initialRecipient={nav.extra?.recipient && isAddress(nav.extra.recipient) ? nav.extra.recipient : undefined}
            initialAmount={nav.extra?.amount}
            initialNote={nav.extra?.memo}
            onNavigate={navigate}
          />
        )
      case 'explore':
        return <SocialFeed />
      case 'swap':
        return <SwapView />
      case 'bridge':
        return <BridgeView />
      case 'activity':
        return <ActivityView />
      case 'settings':
        return <SettingsView />
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
