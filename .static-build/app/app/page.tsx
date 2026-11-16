'use client'

import dynamic from 'next/dynamic'

// The SocialPay app itself (wallet, pay, swap, bridge, chat). Wallet, theme and chat state live in
// the browser (localStorage), so it is drawn there only. This is the same app that used to be the
// homepage; payment links (/?pay=...) still open it directly.
const Root = dynamic(() => import('../root'), { ssr: false })

export default function AppPage() {
  return <Root />
}
