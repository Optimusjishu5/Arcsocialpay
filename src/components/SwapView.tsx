'use client'

import { useState } from 'react'
import { ArrowLeftRight, CircleDollarSign, Sparkles } from 'lucide-react'
import { CircleSwap } from './swap/CircleSwap'
import { UniswapSwap } from './swap/UniswapSwap'
import { GradientIcon, toneVars, type Tone } from './dashboard/ui'
import type { LucideIcon } from 'lucide-react'

const TABS: { id: 'uniswap' | 'circle'; label: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
  { id: 'uniswap', label: 'Uniswap', hint: 'v3 pools on Arc', icon: Sparkles, tone: 'pink' },
  { id: 'circle', label: 'Circle', hint: 'Routed by Circle', icon: CircleDollarSign, tone: 'blue' },
]

export function SwapView() {
  const [tab, setTab] = useState<'uniswap' | 'circle'>('uniswap')
  return (
    <div className="tone-scope max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4" style={toneVars(tab === 'uniswap' ? 'pink' : 'blue')}>
      <div className="flex items-center gap-3">
        <GradientIcon icon={ArrowLeftRight} tone="violet" size={44} />
        <div>
          <h2 className="display font-bold text-xl leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Swap on Arc</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>USDC, EURC and cirBTC</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} aria-pressed={active}
              className="flex items-center gap-2.5 px-3 h-14 rounded-2xl transition-all active:scale-95 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{
                background: active ? 'var(--surface-strong)' : 'var(--surface)',
                border: `1.5px solid ${active ? 'var(--border-strong)' : 'var(--border)'}`,
                boxShadow: active ? '0 10px 24px -12px rgba(8,20,40,0.45)' : 'none',
              }}>
              <GradientIcon icon={t.icon} tone={t.tone} size={34} />
              <span className="flex flex-col leading-tight">
                <span className="text-sm font-semibold" style={{ color: active ? 'var(--ink)' : 'var(--muted)' }}>{t.label}</span>
                <span className="text-[10px]" style={{ color: 'var(--subtle)' }}>{t.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      {tab === 'uniswap' ? <UniswapSwap /> : <CircleSwap />}
    </div>
  )
}
