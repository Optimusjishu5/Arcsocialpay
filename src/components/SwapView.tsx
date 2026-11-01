'use client'

import { useState } from 'react'
import { ArrowLeftRight, CircleDollarSign, Layers, Link2, Route, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CircleSwap } from './swap/CircleSwap'
import { ProviderSwap } from './swap/ProviderSwap'
import { CctpBridge } from './bridge/CctpBridge'
import { GradientIcon, toneVars, type Tone } from './dashboard/ui'

type TabId = 'uniswap' | 'kyber' | 'lifi' | 'circle' | 'cctp'

const TABS: { id: TabId; label: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
  { id: 'uniswap', label: 'Uniswap', hint: 'v3 pools on Arc', icon: Sparkles, tone: 'pink' },
  { id: 'kyber', label: 'KyberSwap', hint: 'Best route', icon: Layers, tone: 'teal' },
  { id: 'lifi', label: 'LI.FI', hint: 'Aggregator', icon: Route, tone: 'violet' },
  { id: 'circle', label: 'Circle', hint: 'USDC, EURC, cirBTC', icon: CircleDollarSign, tone: 'blue' },
  { id: 'cctp', label: 'Circle CCTP', hint: '1:1 native USDC', icon: Link2, tone: 'indigo' },
]

export function SwapView() {
  const [tab, setTab] = useState<TabId>('uniswap')
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  return (
    <div className="tone-scope max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4" style={toneVars(active.tone)}>
      <div className="flex items-center gap-3">
        <GradientIcon icon={ArrowLeftRight} tone="violet" size={44} />
        <div>
          <h2 className="display font-bold text-xl leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Swap on Arc</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Every token on Arc, priced by the route you choose</p>
        </div>
      </div>

      <div role="tablist" aria-label="Swap route" className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 snap-x" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((t) => {
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className="snap-start flex-shrink-0 flex items-center gap-2.5 px-3 h-14 min-w-[148px] rounded-2xl transition-all active:scale-95 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{
                background: isActive ? 'var(--surface-strong)' : 'var(--surface)',
                border: `1.5px solid ${isActive ? 'var(--border-strong)' : 'var(--border)'}`,
                boxShadow: isActive ? '0 10px 24px -12px rgba(8,20,40,0.45)' : 'none',
              }}
            >
              <GradientIcon icon={t.icon} tone={t.tone} size={34} />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: isActive ? 'var(--ink)' : 'var(--muted)' }}>{t.label}</span>
                <span className="text-[10px] whitespace-nowrap" style={{ color: 'var(--subtle)' }}>{t.hint}</span>
              </span>
            </button>
          )
        })}
      </div>

      {tab === 'uniswap' && <ProviderSwap key="uniswap" providerId="uniswap" />}
      {tab === 'kyber' && <ProviderSwap key="kyber" providerId="kyber" />}
      {tab === 'lifi' && <ProviderSwap key="lifi" providerId="lifi" />}
      {tab === 'circle' && <CircleSwap />}
      {tab === 'cctp' && <CctpBridge />}
    </div>
  )
}
