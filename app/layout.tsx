import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'SocialPay | Social Payments on Arc',
    template: '%s | SocialPay',
  },
  description:
    'SocialPay combines messaging, a social feed and native USDC payments on Arc Mainnet. Send, request, split, swap and bridge USDC from one app.',
  icons: {
    icon: '/favicon.ico',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

// Runs before first paint so a saved light theme never flashes dark, and a payment link
// (/?pay=0x...) hides the landing page while the app loads. The theme is read from the same
// storage entry the app uses ("arc-socialpay-v1").
const BOOT_SCRIPT = `(function(){try{var d=document.documentElement;var raw=localStorage.getItem('arc-socialpay-v1');var t=raw?JSON.parse(raw).theme:null;if(t==='light'){d.classList.remove('dark')}else{d.classList.add('dark')}if(/[?&]pay=/.test(location.search)){d.setAttribute('data-paylink','1')}}catch(e){}})();`

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
