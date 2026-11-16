'use client'

import dynamic from 'next/dynamic'
import { useEffect, useSyncExternalStore } from 'react'
import { AppLoading } from './AppLoading'
import { Landing } from '@/site/landing/Landing'

// Wallet, theme and chat state live in the browser (localStorage), so the app is drawn there only.
// Rendering it on the server too made the first browser render differ from the server HTML
// (for example a saved light theme against the default dark one) and triggered hydration errors.
const loadRoot = () => import('./root')
const Root = dynamic(loadRoot, { ssr: false, loading: () => <AppLoading /> })

/** Payment request links look like /?pay=0x...; they keep opening the app, as before. */
function isPayLink(): boolean {
  try {
    return new URLSearchParams(window.location.search).has('pay')
  } catch {
    return false
  }
}

// The address bar is read once; nothing here changes it while the page is open.
function subscribeNever() {
  return () => {}
}

export default function Page() {
  const openApp = useSyncExternalStore(subscribeNever, isPayLink, () => false)

  // Once the landing page is up, quietly fetch the app so "Launch App" opens at once.
  // Skipped on data-saver connections.
  useEffect(() => {
    const conn = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
    if (conn?.saveData) return
    const idle = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    const run = () => { void loadRoot().catch(() => {}) }
    const id = idle ? idle(run, { timeout: 4000 }) : window.setTimeout(run, 2500)
    return () => { if (!idle) window.clearTimeout(id) }
  }, [])

  // The landing page is rendered on the server for search engines and fast first paint. A payment link
  // hides it right away (see the boot script in layout.tsx), then the app takes over.
  return openApp ? <Root /> : <Landing />
}
