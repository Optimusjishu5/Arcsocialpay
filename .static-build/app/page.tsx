'use client'

import dynamic from 'next/dynamic'
import { useSyncExternalStore } from 'react'
import { Landing } from '@/site/landing/Landing'

// Wallet, theme and chat state live in the browser (localStorage), so the app is drawn there only.
// Rendering it on the server too made the first browser render differ from the server HTML
// (for example a saved light theme against the default dark one) and triggered hydration errors.
const Root = dynamic(() => import('./root'), { ssr: false })

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

  // The landing page is rendered on the server for search engines and fast first paint. A payment link
  // hides it right away (see the boot script in layout.tsx), then the app takes over.
  return openApp ? <Root /> : <Landing />
}
