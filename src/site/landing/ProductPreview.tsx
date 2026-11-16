import { ArrowDownUp, Check, Send, SplitSquareHorizontal, Users } from 'lucide-react'

// Schematic previews of the real screens. They show layout only: no balances, names, hashes or amounts.

function Bar({ w, strong }: { w: string; strong?: boolean }) {
  return <span className="block h-2.5 rounded-full" style={{ width: w, background: strong ? 'var(--border-strong)' : 'var(--border)' }} />
}

function Frame({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="site-card-strong flex flex-col overflow-hidden" style={{ boxShadow: '0 30px 60px -36px rgba(8,20,40,0.55)' }}>
      <div className="flex items-center gap-1.5 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--border-strong)' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--border-strong)' }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--border-strong)' }} />
        <span className="site-subtle ml-2 text-xs font-medium">{label}</span>
      </div>
      <div className="flex-1 p-4">{children}</div>
    </div>
  )
}

function Dashboard() {
  return (
    <Frame label="Dashboard">
      <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, var(--accent), var(--accent-hover))', color: 'var(--bg)' }}>
        <p className="text-xs font-medium opacity-80">USDC balance</p>
        <p className="display mt-1 text-3xl font-bold tabnum">Your balance</p>
        <p className="mt-1 text-xs opacity-75">Read from Arc when you connect a wallet</p>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        {[Send, ArrowDownUp, Users, SplitSquareHorizontal].map((Icon, i) => (
          <span key={i} className="flex h-11 items-center justify-center rounded-xl" style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}>
            <Icon size={16} aria-hidden />
          </span>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="h-8 w-8 rounded-full" style={{ background: 'var(--surface-muted)' }} />
            <div className="flex-1 space-y-1.5"><Bar w="55%" strong /><Bar w="35%" /></div>
            <Bar w="14%" strong />
          </div>
        ))}
      </div>
    </Frame>
  )
}

function Pay() {
  return (
    <Frame label="Pay">
      <p className="site-eyebrow">Recipient</p>
      <div className="mt-1.5 flex h-11 items-center rounded-xl px-3 mono text-xs site-subtle" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>0x... or a SocialPay profile</div>
      <p className="site-eyebrow mt-4">Amount</p>
      <div className="mt-1.5 flex h-14 items-center justify-between rounded-xl px-3" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <span className="display text-2xl font-semibold site-subtle tabnum">0.00</span>
        <span className="text-sm font-semibold site-muted">USDC</span>
      </div>
      <p className="site-eyebrow mt-4">Note</p>
      <div className="mt-1.5 flex h-11 items-center rounded-xl px-3 text-xs site-subtle" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>Optional memo, recorded onchain</div>
      <div className="site-btn mt-5 w-full select-none" aria-hidden>Review payment</div>
    </Frame>
  )
}

function Chat() {
  return (
    <Frame label="Messages">
      <div className="space-y-3">
        <div className="max-w-[70%] space-y-1.5 rounded-2xl rounded-bl-md p-3" style={{ background: 'var(--surface-muted)' }}><Bar w="90%" strong /><Bar w="60%" /></div>
        <div className="ml-auto max-w-[75%] space-y-1.5 rounded-2xl rounded-br-md p-3" style={{ background: 'var(--accent)' }}>
          <span className="block h-2.5 rounded-full" style={{ width: '85%', background: 'color-mix(in srgb, var(--bg) 55%, transparent)' }} />
          <span className="block h-2.5 rounded-full" style={{ width: '50%', background: 'color-mix(in srgb, var(--bg) 35%, transparent)' }} />
        </div>
        <div className="ml-auto flex max-w-[75%] items-center gap-2 rounded-2xl p-3" style={{ background: 'var(--success-bg)', border: '1px solid var(--border)' }}>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full" style={{ background: 'var(--success)', color: 'var(--bg)' }}><Check size={14} aria-hidden /></span>
          <div className="space-y-1.5"><p className="text-xs font-semibold site-ink">USDC payment card</p><Bar w="90px" /></div>
        </div>
        <div className="max-w-[60%] space-y-1.5 rounded-2xl rounded-bl-md p-3" style={{ background: 'var(--surface-muted)' }}><Bar w="80%" strong /></div>
      </div>
    </Frame>
  )
}

export function ProductPreview() {
  return (
    <section id="product" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-2xl text-center">
        <p className="site-eyebrow">Product</p>
        <h2 className="display mt-2 text-3xl font-bold site-ink text-balance sm:text-4xl">Pay, chat and move money in one place</h2>
        <p className="site-muted mt-3 text-pretty">
          A look at the layout of the dashboard, the Pay screen and Messages. These previews are schematic and show no real balances or addresses. Launch the app to use the live screens.
        </p>
      </div>
      <div className="mt-10 grid gap-5 md:grid-cols-3">
        <Dashboard />
        <Pay />
        <Chat />
      </div>
    </section>
  )
}
