'use client'

import { Suspense, useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { isAddress } from 'viem'
import { useArcAccount, useUsdcBalance } from './hooks/useArcWallet'
import { usePersistentChat } from './hooks/usePersistentChat'
import { usePersistentSocial } from './hooks/usePersistentSocial'
import { usePersistentTxHistory } from './hooks/usePersistentTxHistory'
import { useOnchainActivity } from './hooks/useOnchainActivity'
import { appStore, useTheme } from './store/appStore'
import { Dashboard } from './components/Dashboard'
import {
  MessagesView, PayView, SocialFeed, ProfileView, NotificationsView, ActivityView,
  SettingsView, SwapView, BridgeView, prefetchAllViews, prefetchView,
} from './components/lazyViews'
import type { PayMode } from './components/PayView'
import { DesktopNav, DesktopTopBar, MobileNav, MobileTopBar } from './components/Navigation'
import { parsePayPrefill } from './utils/payRequests'
import { OPEN_CHAT_EVENT, OPEN_VIEW_EVENT } from './lib/incomingAlerts'
import { useActivityNotices } from './hooks/useActivityNotices'
import { useFollowSync } from './hooks/useFollowSync'
import { OPEN_PROFILE_EVENT } from './components/ui/ProfileLink'
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

/** Shown for a split second only if a screen has not finished downloading yet. */
function ViewSkeleton() {
  return (
    <div aria-hidden className="max-w-2xl mx-auto px-4 pt-4 flex flex-col gap-4">
      <div className="h-36 rounded-3xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
      <div className="h-24 rounded-3xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
      <div className="h-24 rounded-3xl animate-pulse" style={{ background: 'var(--surface-muted)' }} />
    </div>
  )
}

interface NavState {
  view: NavView
  extra?: Record<string, string>
}

export default function App() {
  const { theme } = useTheme()
  const { address, isConnected } = useArcAccount()
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
        if (prefill.via) extra.via = prefill.via
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
  // Backup to the wallet listener: nothing private stays loaded unless a wallet is connected.
  useEffect(() => { appStore.setActiveWallet(isConnected ? address : null) }, [address, isConnected])

  // Persistent social feed: posts/comments/profiles, same Turso pattern.
  usePersistentSocial(address)
  // Payments, likes, comments, mentions and followers become notifications and alerts.
  useFollowSync(address)
  useActivityNotices(address)

  // Persistent payment history: normal pay + tips render correctly everywhere.
  usePersistentTxHistory(address)
  useOnchainActivity(address)

  // Open a pay link's screen right away, and download the other screens while the browser is idle.
  useEffect(() => {
    prefetchView(nav.view)
  }, [nav.view])
  useEffect(() => prefetchAllViews(), [])

  const addressRef = useRef(address)
  useEffect(() => { addressRef.current = address }, [address])

  // Tapping a message alert (toast or system notification) opens that chat.
  useEffect(() => {
    const open = (convId: unknown) => {
      if (typeof convId === 'string' && convId) { setNav({ view: 'messages', extra: { convId } }); window.scrollTo({ top: 0, behavior: 'auto' }) }
    }
    const onEvent = (e: Event) => open((e as CustomEvent<{ convId?: string }>).detail?.convId)
    const onView = (e: Event) => {
      if ((e as CustomEvent<{ view?: string }>).detail?.view === 'notifications') { setNav({ view: 'notifications' }); window.scrollTo({ top: 0, behavior: 'auto' }) }
    }
    window.addEventListener(OPEN_VIEW_EVENT, onView)
    const onProfile = (e: Event) => {
      const who = (e as CustomEvent<{ address?: string }>).detail?.address
      if (!who) return
      // Your own picture opens your own profile.
      const mine = !!addressRef.current && who.toLowerCase() === addressRef.current.toLowerCase()
      setNav(mine ? { view: 'profile' } : { view: 'profile', extra: { address: who } })
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
    window.addEventListener(OPEN_PROFILE_EVENT, onProfile)
    const onWorker = (e: MessageEvent<{ type?: string; convId?: unknown } | null>) => { if (e.data?.type === OPEN_CHAT_EVENT) open(e.data.convId) }
    window.addEventListener(OPEN_CHAT_EVENT, onEvent)
    navigator.serviceWorker?.addEventListener('message', onWorker)
    return () => {
      window.removeEventListener(OPEN_CHAT_EVENT, onEvent)
      window.removeEventListener(OPEN_VIEW_EVENT, onView)
      window.removeEventListener(OPEN_PROFILE_EVENT, onProfile)
      navigator.serviceWorker?.removeEventListener('message', onWorker)
    }
  }, [])

  function navigate(view: NavView, extra?: Record<string, string>) {
    setNav({ view, extra })
    // Jump to the top at once: a smooth scroll makes every tap feel slow.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }

  function renderView() {
    switch (nav.view) {
      case 'home':
        return <Dashboard onNavigate={navigate} />
      case 'messages':
        return <MessagesView key={nav.extra?.convId ?? 'list'} initialConvId={nav.extra?.convId} />
      case 'pay':
        return (
          <PayView
            key={`${nav.extra?.mode ?? 'send'}-${nav.extra?.recipient ?? 'no-recipient'}-${nav.extra?.amount ?? ''}`}
            initialMode={(nav.extra?.mode as PayMode) ?? 'send'}
            initialExpiresAt={nav.extra?.exp ? Number(nav.extra.exp) : undefined}
            initialRecipient={nav.extra?.recipient && isAddress(nav.extra.recipient) ? nav.extra.recipient : undefined}
            initialAmount={nav.extra?.amount}
            initialNote={nav.extra?.memo}
            initialVia={nav.extra?.via === 'split' ? 'split' : undefined}
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
          <DesktopTopBar />

          {/* Page content */}
          <main className="app-main flex-1 pb-[calc(var(--bottomnav-h)+12px)] md:pb-0">
            {/* No exit animation: the new screen appears immediately instead of waiting for the old one to fade. */}
            <motion.div
              key={nav.view}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.1, ease: 'easeOut' }}
              className="min-h-full"
            >
              <Suspense fallback={<ViewSkeleton />}>{renderView()}</Suspense>
            </motion.div>
          </main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <MobileNav current={nav.view} onNavigate={(v) => navigate(v)} />
    </div>
  )
}
