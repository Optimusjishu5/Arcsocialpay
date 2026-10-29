'use client'

import { useState } from 'react'
import { GitCompare, Link2, Waypoints } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CctpBridge } from './bridge/CctpBridge'
import { RouteBridge } from './bridge/RouteBridge'
import { GradientIcon, toneVars, type Tone } from './dashboard/ui'

const TABS: { id: 'compare' | 'circle'; label: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
  { id: 'compare', label: 'Compare routes', hint: 'Across, Relay, LI.FI', icon: GitCompare, tone: 'amber' },
  { id: 'circle', label: 'Circle CCTP', hint: 'Native USDC', icon: Link2, tone: 'blue' },
]

export function BridgeView() {
  const [tab, setTab] = useState<'compare' | 'circle'>('compare')
  return (
    <div className="tone-scope max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4" style={toneVars(tab === 'compare' ? 'amber' : 'blue')}>
      <div className="flex items-center gap-3">
        <GradientIcon icon={Waypoints} tone="amber" size={44} />
        <div>
          <h2 className="display font-bold text-xl leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Bridge USDC</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Move USDC to and from Arc</p>
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
      {tab === 'compare' ? <RouteBridge /> : <CctpBridge />}
    </div>
  )
}
