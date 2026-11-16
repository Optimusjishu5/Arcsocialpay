'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { BestPriceView } from './swap/BestPriceView'
import { AnyTokenView } from './swap/AnyTokenView'
import { CircleSwap } from './swap/CircleSwap'
import { toneVars } from './dashboard/ui'

type Mode = 'best' | 'any' | 'circle'

const MODES: { id: Mode; title: string; hint: string }[] = [
  { id: 'best', title: 'Best price', hint: 'Kyber + Uniswap' },
  { id: 'any', title: 'Any token', hint: 'LI.FI routing' },
  { id: 'circle', title: 'Circle swap', hint: 'Stablecoins' },
]

export function SwapView() {
  const [mode, setMode] = useState<Mode>('best')

  return (
    <div className="tone-scope max-w-lg mx-auto px-4 pt-4 pb-8 space-y-4" style={toneVars('indigo')}>
      <div className="flex justify-center">
        <span
          className="inline-flex items-center gap-2 h-9 px-4 rounded-full text-sm font-semibold"
          style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--tone-text, var(--ink))' }}
        >
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--success)' }} aria-hidden />
          Arc Mainnet · real funds, real fees
        </span>
      </div>

      <div
        role="tablist"
        aria-label="Swap mode"
        className="grid grid-cols-3 gap-1 p-1.5 rounded-full"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
      >
        {MODES.map((m) => {
          const active = mode === m.id
          return (
            <button
              key={m.id}
              role="tab"
              aria-selected={active}
              onClick={() => setMode(m.id)}
              className="relative h-14 min-w-0 px-1 rounded-full flex flex-col items-center justify-center leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{ color: active ? '#fff' : 'var(--ink)' }}
            >
              {active && (
                <motion.span
                  layoutId="swap-mode-pill"
                  className="absolute inset-0 rounded-full"
                  style={{ background: 'linear-gradient(135deg, #4f6bff, #3b4fe8)', boxShadow: '0 10px 22px -10px rgba(59,79,232,0.7)' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              )}
              <span className="relative max-w-full truncate text-[13px] sm:text-sm font-bold">{m.title}</span>
              <span className="relative max-w-full truncate text-[10px] sm:text-[11px]" style={{ opacity: active ? 0.85 : 0.6 }}>{m.hint}</span>
            </button>
          )
        })}
      </div>

      {mode === 'best' && <BestPriceView key="best" />}
      {mode === 'any' && <AnyTokenView key="any" />}
      {mode === 'circle' && <CircleSwap key="circle" />}
    </div>
  )
}
