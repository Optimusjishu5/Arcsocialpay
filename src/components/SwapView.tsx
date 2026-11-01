'use client'

import { useState } from 'react'
import { ArrowLeft, CircleDollarSign, Link2 } from 'lucide-react'
import { BestPriceView } from './swap/BestPriceView'
import { AnyTokenView } from './swap/AnyTokenView'
import { CircleSwap } from './swap/CircleSwap'
import { CctpBridge } from './bridge/CctpBridge'
import { toneVars } from './dashboard/ui'

type Mode = 'best' | 'any'
type Extra = 'circle' | 'cctp' | null

const MODES: { id: Mode; title: string; hint: string }[] = [
  { id: 'best', title: 'Best price', hint: 'KyberSwap + Uniswap + LI.FI' },
  { id: 'any', title: 'Any token', hint: 'Full LI.FI routing' },
]

export function SwapView() {
  const [mode, setMode] = useState<Mode>('best')
  const [extra, setExtra] = useState<Extra>(null)

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

      {extra === null ? (
        <>
          <div role="tablist" aria-label="Swap mode" className="relative grid grid-cols-2 gap-1 p-1.5 rounded-full" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
            {MODES.map((m) => {
              const active = mode === m.id
              return (
                <button
                  key={m.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setMode(m.id)}
                  className="relative h-14 rounded-full flex flex-col items-center justify-center leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  style={{ color: active ? '#fff' : 'var(--ink)' }}
                >
                  {active && (
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{ background: 'linear-gradient(135deg, #4f6bff, #3b4fe8)', boxShadow: '0 10px 22px -10px rgba(59,79,232,0.7)' }}
                    />
                  )}
                  <span className="relative text-base font-bold">{m.title}</span>
                  <span className="relative text-[11px]" style={{ opacity: active ? 0.85 : 0.6 }}>{m.hint}</span>
                </button>
              )
            })}
          </div>

          {mode === 'best' ? <BestPriceView key="best" /> : <AnyTokenView key="any" />}

          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <span className="text-xs" style={{ color: 'var(--subtle)' }}>More routes</span>
            <button
              onClick={() => setExtra('circle')}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold"
              style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            >
              <CircleDollarSign size={14} /> Circle swap
            </button>
            <button
              onClick={() => setExtra('cctp')}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs font-semibold"
              style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}
            >
              <Link2 size={14} /> Circle CCTP 1:1 USDC
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            onClick={() => setExtra(null)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold"
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          >
            <ArrowLeft size={14} /> Back to swap
          </button>
          {extra === 'circle' ? <CircleSwap /> : <CctpBridge />}
        </>
      )}
    </div>
  )
}
