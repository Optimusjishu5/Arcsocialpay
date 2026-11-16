import { ArrowDown, ArrowRight, ArrowRightLeft, Cloud, Database, Globe, Layers, Link2, Smartphone, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

function Node({ icon: Icon, title, lines, accent }: { icon: LucideIcon; title: string; lines: string[]; accent?: boolean }) {
  return (
    <div className="site-card-strong p-4" style={accent ? { borderColor: 'var(--border-strong)' } : undefined}>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}>
          <Icon size={16} aria-hidden />
        </span>
        <p className="display text-sm font-semibold site-ink">{title}</p>
      </div>
      <ul className="space-y-0.5">
        {lines.map((l) => <li key={l} className="site-muted text-xs leading-relaxed">{l}</li>)}
      </ul>
    </div>
  )
}

function Lane({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="site-eyebrow mb-2">{label}</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}

function Connector({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-1" aria-hidden>
      <ArrowDown size={16} className="site-subtle" />
      <span className="site-subtle text-[11px] font-medium">{text}</span>
    </div>
  )
}

/** Layered technical architecture of SocialPay. Every box names something that exists in this repository. */
export function ArchitectureDiagram() {
  return (
    <figure className="site-card space-y-1 p-4 sm:p-6" aria-label="SocialPay technical architecture">
      <Lane label="Your device">
        <Node icon={Smartphone} title="SocialPay web app" lines={['Next.js 15, React 18, Tailwind', 'Pay, Swap, Bridge, Messages, Explore', 'src/App.tsx, src/components/']} accent />
        <Node icon={Wallet} title="Your wallet" lines={['Injected wallet via ConnectKit and wagmi', 'You sign every transaction', 'Keys never leave the wallet']} />
        <Node icon={Database} title="Browser storage" lines={['Settings, drafts, activity cache', 'Used for chat when no database is set', 'src/store/appStore.ts']} />
      </Lane>
      <Connector text="reads and writes over HTTPS and JSON-RPC" />
      <Lane label="SocialPay services (Next.js API routes)">
        <Node icon={Cloud} title="Chat and social API" lines={['app/api/conversations, messages, posts', 'Wallet-signed sessions guard private data', 'Optional Turso (LibSQL) database']} />
        <Node icon={Globe} title="Explorer and upstream proxies" lines={['app/api/explorer, tx, upstream', 'Optional Blockscout key for history', 'Token and chain lists, cached']} />
        <Node icon={Layers} title="Transaction verification" lines={['app/api/tx reads the Arc node', 'Checks receipt, transaction and logs', 'src/server/arcRpc.ts']} />
      </Lane>
      <Connector text="transactions are signed in your wallet and sent to Arc" />
      <Lane label="Arc Mainnet (chain 5042)">
        <Node icon={ArrowRightLeft} title="ArcSocialPay" lines={['pay() and tip() with a memo', 'Pulls USDC, forwards it at once, holds nothing', '0x3b61...bf54']} accent />
        <Node icon={Wallet} title="Circle USDC, EURC, cirBTC" lines={['USDC is also the gas token', '6 decimals as ERC-20, 18 as gas', 'src/lib/arcTokens.ts']} />
        <Node icon={Link2} title="Swap and bridge protocols" lines={['Uniswap v3, KyberSwap, LI.FI', 'Circle App Kit, CCTP, Across, Relay', 'Contracts called directly or via quotes']} />
      </Lane>
    </figure>
  )
}

const FLOW = [
  { title: 'Connect', text: 'Your wallet connects to Arc Mainnet.' },
  { title: 'Approve', text: 'USDC allowance for ArcSocialPay, up to the limit you chose.' },
  { title: 'Pay', text: 'pay(recipient, amount, memo) pulls USDC from you.' },
  { title: 'Deliver', text: 'The contract forwards it to the recipient in the same call.' },
  { title: 'Confirm', text: 'A Payment event is emitted and the receipt is verified.' },
]

/** The payment path through ArcSocialPay, step by step. */
export function PaymentFlowDiagram() {
  return (
    <figure className="site-card p-4 sm:p-6" aria-label="Payment flow">
      <ol className="grid gap-3 md:grid-cols-5">
        {FLOW.map((s, i) => (
          <li key={s.title} className="relative">
            <div className="site-card-strong h-full p-4">
              <span className="display mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{i + 1}</span>
              <p className="display text-sm font-semibold site-ink">{s.title}</p>
              <p className="site-muted mt-1 text-xs leading-relaxed">{s.text}</p>
            </div>
            {i < FLOW.length - 1 && (
              <ArrowRight size={16} className="site-subtle absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 md:block" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </figure>
  )
}

const BRIDGE = [
  { title: 'Burn', text: 'USDC is burned on the source chain through Circle CCTP.' },
  { title: 'Attest', text: 'Circle attests that the burn happened.' },
  { title: 'Mint', text: 'Native USDC is minted on the destination chain.' },
]

/** Native CCTP bridge flow as used by the Circle CCTP tab. */
export function BridgeFlowDiagram() {
  return (
    <figure className="site-card p-4 sm:p-6" aria-label="Circle CCTP bridge flow">
      <ol className="grid gap-3 md:grid-cols-3">
        {BRIDGE.map((s, i) => (
          <li key={s.title} className="site-card-strong p-4">
            <span className="display mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold" style={{ background: 'var(--accent)', color: 'var(--bg)' }}>{i + 1}</span>
            <p className="display text-sm font-semibold site-ink">{s.title}</p>
            <p className="site-muted mt-1 text-xs leading-relaxed">{s.text}</p>
          </li>
        ))}
      </ol>
    </figure>
  )
}
