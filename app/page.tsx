'use client'

import './globals.css'
import dynamic from 'next/dynamic'

// Wallet, theme and chat state live in the browser (localStorage), so the app is drawn there only.
// Rendering it on the server too made the first browser render differ from the server HTML
// (for example a saved light theme against the default dark one) and triggered hydration errors.
const Root = dynamic(() => import('./root'), { ssr: false })

export default function Page() {
  return <Root />
}
