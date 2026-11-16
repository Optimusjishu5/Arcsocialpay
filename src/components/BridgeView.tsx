'use client'

import { useState } from 'react'
import { Link2, Route, Waypoints } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { CctpBridge } from './bridge/CctpBridge'
import { RouteBridge } from './bridge/RouteBridge'
import { GradientIcon, toneVars, type Tone } from './dashboard/ui'

type TabId = 'routes' | 'circle'

const TABS: { id: TabId; label: string; hint: string; icon: LucideIcon; tone: Tone }[] = [
  { id: 'routes', label: 'Best route', hint: 'LI.FI · Across · Relay', icon: Route, tone: 'violet' },
  { id: 'circle', label: 'Circle CCTP', hint: 'Native USDC, 1:1', icon: Link2, tone: 'blue' },
]

export function BridgeView() {
  const [tab, setTab] = useState<TabId>('routes')
  const active = TABS.find((t) => t.id === tab) ?? TABS[0]
  return (
    <div className="tone-scope max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4" style={toneVars(active.tone)}>
      <div className="flex items-center gap-3">
        <GradientIcon icon={Waypoints} tone="amber" size={44} />
        <div>
          <h2 className="display font-bold text-xl leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Bridge USDC</h2>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>Move USDC to and from Arc</p>
        </div>
      </div>
      <div role="tablist" aria-label="Bridge route" className="grid grid-cols-2 gap-2">
        {TABS.map((t) => {
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setTab(t.id)}
              className="flex min-w-0 items-center gap-2.5 px-3 h-14 rounded-2xl transition-all active:scale-95 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{
                background: isActive ? 'var(--surface-strong)' : 'var(--surface)',
                border: `1.5px solid ${isActive ? 'var(--border-strong)' : 'var(--border)'}`,
                boxShadow: isActive ? '0 10px 24px -12px rgba(8,20,40,0.45)' : 'none',
              }}
            >
              <GradientIcon icon={t.icon} tone={t.tone} size={34} />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-semibold" style={{ color: isActive ? 'var(--ink)' : 'var(--muted)' }}>{t.label}</span>
                <span className="truncate text-[10px]" style={{ color: 'var(--subtle)' }}>{t.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
      {tab === 'routes' && <RouteBridge />}
      {tab === 'circle' && <CctpBridge />}
    </div>
  )
}
