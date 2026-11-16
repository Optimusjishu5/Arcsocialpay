import Link from 'next/link'
import { ArrowUpRight, Check, Circle, Github } from 'lucide-react'
import { ArchitectureDiagram } from '../diagrams'
import { SHIPPED, NEXT } from '../roadmap'
import { APP_URL, DOCS_URL, GITHUB_CONTRACT_URL, GITHUB_URL, OWN_CONTRACTS, explorerAddress } from '../links'

const SECURITY_POINTS = [
  'Your funds stay in your wallet. The contract pulls USDC only for the payment you sign and forwards it in the same call.',
  'The ArcSocialPay contract holds no funds, charges no fees, and has no upgrade or self-destruct path.',
  'A reentrancy lock, an owner pause switch and a two-step ownership transfer protect the contract.',
  'The contract source is public, with a 74-test Foundry suite that includes invariants for USDC conservation.',
  'Amounts use exact integer math. Receipts are checked against the Arc node before they count as confirmed.',
  'Private chat data is tied to a wallet signature, never to an address typed into a request.',
]

export function Security() {
  const contract = OWN_CONTRACTS[0]
  return (
    <section id="security" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="grid gap-8 lg:grid-cols-2">
        <div>
          <p className="site-eyebrow">Security and transparency</p>
          <h2 className="display mt-2 text-3xl font-bold site-ink text-balance sm:text-4xl">Open source, minimal contract, honest limits</h2>
          <ul className="mt-6 space-y-3">
            {SECURITY_POINTS.map((p) => (
              <li key={p} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><Check size={12} aria-hidden /></span>
                <span className="site-muted text-sm leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
          <div className="mt-6 rounded-2xl p-4 text-sm leading-relaxed site-muted" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <strong className="site-ink">No independent audit report is published for SocialPay.</strong> Start with a small amount, read the contract, and check every transaction in your wallet.
          </div>
        </div>
        <div className="site-card self-start p-6">
          <p className="site-eyebrow">Contract on Arc Mainnet</p>
          <p className="display mt-1 text-lg font-semibold site-ink">{contract.name}</p>
          <p className="mono mt-3 break-all text-xs site-muted">{contract.address}</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={explorerAddress(contract.address)} target="_blank" rel="noopener noreferrer" className="site-btn site-focus">View on Arc Explorer <ArrowUpRight size={16} aria-hidden /></a>
            <a href={GITHUB_CONTRACT_URL} target="_blank" rel="noopener noreferrer" className="site-btn-ghost site-focus">Read the source</a>
          </div>
          <Link href="/docs/security" className="site-link mt-5 inline-block text-sm font-medium">Security documentation</Link>
        </div>
      </div>
    </section>
  )
}

export function Architecture() {
  return (
    <section id="architecture" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="mb-8 max-w-2xl">
        <p className="site-eyebrow">Architecture</p>
        <h2 className="display mt-2 text-3xl font-bold site-ink text-balance sm:text-4xl">Wallet-first, with a thin service layer</h2>
        <p className="site-muted mt-3 text-pretty">Payments go from your wallet to Arc. SocialPay services handle chat, social data and receipt checks, never your funds.</p>
      </div>
      <ArchitectureDiagram />
    </section>
  )
}

export function Roadmap() {
  return (
    <section id="roadmap" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-16 sm:px-6 sm:pb-24">
      <div className="max-w-2xl">
        <p className="site-eyebrow">Roadmap</p>
        <h2 className="display mt-2 text-3xl font-bold site-ink text-balance sm:text-4xl">What exists today, and where it can go</h2>
        <p className="site-muted mt-3 text-pretty">Shipped items are live in the app. The next list holds goals, not dated promises.</p>
      </div>
      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <div className="site-card p-6">
          <p className="display text-lg font-semibold site-ink">Shipped</p>
          <ul className="mt-4 space-y-4">
            {SHIPPED.map((i) => (
              <li key={i.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center rounded-full" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}><Check size={12} aria-hidden /></span>
                <div><p className="text-sm font-semibold site-ink">{i.title}</p><p className="site-muted text-sm leading-relaxed">{i.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
        <div className="site-card p-6">
          <p className="display text-lg font-semibold site-ink">Next</p>
          <ul className="mt-4 space-y-4">
            {NEXT.map((i) => (
              <li key={i.title} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-5 w-5 flex-none items-center justify-center site-subtle"><Circle size={14} aria-hidden /></span>
                <div><p className="text-sm font-semibold site-ink">{i.title}</p><p className="site-muted text-sm leading-relaxed">{i.text}</p></div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="site-card relative overflow-hidden p-8 text-center sm:p-14">
        <h2 className="display text-3xl font-bold site-ink text-balance sm:text-4xl">Ready to pay with a conversation?</h2>
        <p className="site-muted mx-auto mt-3 max-w-xl text-pretty">Open the app, connect a wallet and send your first USDC payment on Arc. Or read how everything works first.</p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link href={APP_URL} className="site-btn site-focus">Launch App <ArrowUpRight size={16} aria-hidden /></Link>
          <Link href={DOCS_URL} className="site-btn-ghost site-focus">Documentation</Link>
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="site-btn-ghost site-focus"><Github size={16} aria-hidden /> GitHub</a>
        </div>
      </div>
    </section>
  )
}
