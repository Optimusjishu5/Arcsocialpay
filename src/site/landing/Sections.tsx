import Link from 'next/link'
import { ArrowLeftRight, CalendarClock, CircleDollarSign, Compass, FileText, History, MessageSquare, SplitSquareHorizontal, Waypoints } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Feature { icon: LucideIcon; title: string; text: string; href: string }

const FEATURES: Feature[] = [
  { icon: CircleDollarSign, title: 'Send and receive USDC', text: 'Pay any address in USDC. Add a memo that is recorded onchain with the payment.', href: '/docs/send-receive-usdc' },
  { icon: SplitSquareHorizontal, title: 'Batch and split', text: 'Pay up to 50 recipients from a CSV, or split a bill into shareable payment links.', href: '/docs/batch-split-payments' },
  { icon: CalendarClock, title: 'Requests and reminders', text: 'Share a payment request link with an optional amount, note and expiry. Set recurring reminders.', href: '/docs/requests-scheduling' },
  { icon: MessageSquare, title: 'Chat with in-chat pay', text: 'Direct messages and groups where a payment is one tap away. Private chats are protected by wallet signatures.', href: '/docs/messaging-social' },
  { icon: Compass, title: 'Social feed and tips', text: 'Posts, likes, comments, reposts and follows, with USDC tips sent to authors.', href: '/docs/messaging-social' },
  { icon: ArrowLeftRight, title: 'Swap on Arc', text: 'Compare Uniswap v3 and KyberSwap, route any token with LI.FI, or swap stablecoins with Circle App Kit.', href: '/docs/swap-integration' },
  { icon: Waypoints, title: 'Bridge USDC', text: 'Move USDC with Circle CCTP, or compare Across, Relay and LI.FI routes side by side.', href: '/docs/bridge-integration' },
  { icon: History, title: 'Full activity history', text: 'Your complete Arc history in one searchable list, with day groups and CSV export.', href: '/docs/user-guide' },
]

export function Features() {
  return (
    <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="max-w-2xl">
        <p className="site-eyebrow">Key features</p>
        <h2 className="display mt-2 text-3xl font-bold site-ink text-balance sm:text-4xl">Everything a payment needs, and a way to talk about it</h2>
      </div>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <li key={f.title}>
            <Link href={f.href} className="site-card site-focus group flex h-full flex-col p-5 transition-transform hover:-translate-y-1">
              <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}>
                <f.icon size={20} aria-hidden />
              </span>
              <h3 className="display text-base font-semibold site-ink">{f.title}</h3>
              <p className="site-muted mt-1.5 text-sm leading-relaxed">{f.text}</p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

interface Integration { name: string; kind: 'Circle' | 'Arc' | 'Third party'; text: string }

const INTEGRATIONS: Integration[] = [
  { name: 'USDC, EURC and cirBTC', kind: 'Circle', text: 'Circle tokens on Arc. USDC is the unit for every payment and the gas token.' },
  { name: 'Circle App Kit: CCTP bridge', kind: 'Circle', text: 'Native USDC bridging with burn, attestation and mint, including Circle forwarding for delivery.' },
  { name: 'Circle App Kit: swap', kind: 'Circle', text: 'Stablecoin swaps between USDC, EURC and cirBTC on Arc.' },
  { name: 'Arc Mainnet', kind: 'Arc', text: 'Chain ID 5042, USDC gas, Arc Explorer for every receipt link.' },
  { name: 'Uniswap v3 and KyberSwap', kind: 'Third party', text: 'Best-price swap quotes and execution on Arc.' },
  { name: 'LI.FI, Across and Relay', kind: 'Third party', text: 'Cross-chain routes and any-token swap routing, compared before you sign.' },
]

export function Integrations() {
  return (
    <section id="integrations" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="site-card p-6 sm:p-10">
        <div className="max-w-2xl">
          <p className="site-eyebrow">Integrations</p>
          <h2 className="display mt-2 text-3xl font-bold site-ink text-balance">Built on Circle and Arc, open to the best routes</h2>
          <p className="site-muted mt-3 text-pretty">Each integration below is used in the app today. Third-party services are labelled as such. Mentioning a service does not imply a partnership.</p>
        </div>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {INTEGRATIONS.map((i) => (
            <li key={i.name} className="site-card-strong p-4">
              <span className="site-eyebrow">{i.kind}</span>
              <p className="display mt-1 text-sm font-semibold site-ink">{i.name}</p>
              <p className="site-muted mt-1 text-xs leading-relaxed">{i.text}</p>
            </li>
          ))}
        </ul>
        <Link href="/docs/circle-integrations" className="site-btn-ghost site-focus mt-6 inline-flex">
          <FileText size={16} aria-hidden /> Read the Circle integration guide
        </Link>
      </div>
    </section>
  )
}

const STEPS = [
  { title: 'Connect your wallet', text: 'Use an injected wallet such as MetaMask. SocialPay asks it to switch to Arc Mainnet. Nothing is custodied.' },
  { title: 'Approve once', text: 'Allow the ArcSocialPay contract to move USDC up to a limit you pick in Settings, or approve each payment exactly.' },
  { title: 'Pay, chat or move money', text: 'Send USDC with a memo, tip a post, pay inside a chat, swap or bridge. You review the details before signing.' },
  { title: 'See the receipt', text: 'Each transaction is checked against the Arc node and linked to Arc Explorer, then added to your activity.' },
]

export function HowItWorks() {
  return (
    <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="max-w-2xl">
        <p className="site-eyebrow">How SocialPay works</p>
        <h2 className="display mt-2 text-3xl font-bold site-ink text-balance sm:text-4xl">Four steps from wallet to receipt</h2>
      </div>
      <ol className="mt-10 grid gap-4 md:grid-cols-4">
        {STEPS.map((s, i) => (
          <li key={s.title} className="site-card p-5">
            <span className="display inline-flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{i + 1}</span>
            <h3 className="display mt-4 text-base font-semibold site-ink">{s.title}</h3>
            <p className="site-muted mt-1.5 text-sm leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  )
}
