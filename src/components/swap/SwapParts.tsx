'use client'

import type { ReactNode } from 'react'
import { AlertCircle, Check, ExternalLink, Layers, Route, Sparkles } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ARC_CHAIN_ID } from '../../chains'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { GradientIcon, type Tone } from '../dashboard/ui'
import { Reveal } from './SwapPanel'
import { formatTokenAmount, type ArcToken } from '../../lib/arcTokens'
import type { SwapProviderId, SwapQuote } from '../../lib/swapProviders'
import { LogoImg } from '../ui/LogoImg'

export const ROUTE_META: Record<SwapProviderId, { name: string; icon: LucideIcon; tone: Tone }> = {
  uniswap: { name: 'Uniswap', icon: Sparkles, tone: 'pink' },
  kyber: { name: 'KyberSwap', icon: Layers, tone: 'teal' },
  lifi: { name: 'LI.FI', icon: Route, tone: 'violet' },
}

export function Row({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="flex justify-between gap-3">
      <span style={{ color: 'var(--ink-2)' }}>{label}</span>
      <span className="tabnum text-right" style={{ color: tone === 'bad' ? 'var(--danger)' : 'var(--ink)' }}>{value}</span>
    </div>
  )
}

/** Rate and value-check rows shared by both swap screens. */
export function QuoteDetails({ quote, tokenIn, tokenOut, usdIn, usdOut, routeName }: {
  quote: SwapQuote
  tokenIn: ArcToken
  tokenOut: ArcToken
  usdIn?: number
  usdOut?: number
  routeName: string
}) {
  const inNum = Number(quote.amountIn) / 10 ** tokenIn.decimals
  const outNum = Number(quote.amountOut) / 10 ** tokenOut.decimals
  const rate = inNum > 0 ? outNum / inNum : 0
  // How far the received value is from the market value of what you sell.
  const diff = usdIn && usdOut ? (usdOut / usdIn - 1) * 100 : undefined
  return (
    <div className="rounded-2xl p-3 space-y-1.5 text-xs" data-tp="">
      <Row label="Route" value={routeName} />
      <Row label="Rate" value={`1 ${tokenIn.symbol} ≈ ${rate >= 1000 ? rate.toFixed(2) : rate.toPrecision(5).replace(/\.?0+$/, '')} ${tokenOut.symbol}`} />
      {diff !== undefined && (
        <Row label="Value vs market" value={`${diff >= 0 ? '+' : ''}${diff.toFixed(2)}%`} tone={diff < -2 ? 'bad' : undefined} />
      )}
      <Row label="Minimum received" value={`${formatTokenAmount(quote.minOut, tokenOut.decimals, 8)} ${tokenOut.symbol}`} />
      {quote.details.filter((d) => d.label !== 'Route').map((d) => <Row key={d.label} label={d.label} value={d.value} />)}
      <p style={{ color: 'var(--subtle)' }}>Rates can move before the swap runs.</p>
    </div>
  )
}

export function Notices({ error, doneHash, warning, noRoute, tokenIn, tokenOut, insufficient, noGas }: {
  error: string
  doneHash: string
  warning?: ReactNode
  noRoute: boolean
  tokenIn: ArcToken
  tokenOut: ArcToken
  insufficient: boolean
  noGas: boolean
}) {
  return (
    <>
      <Reveal show={insufficient}>
        <p className="text-xs" style={{ color: 'var(--danger)' }}>Insufficient {tokenIn.symbol} balance.</p>
      </Reveal>
      <Reveal show={noGas}>
        <p className="text-xs" style={{ color: 'var(--danger)' }}>Arc fees are paid in USDC. Leave at least 0.05 USDC in your wallet for gas.</p>
      </Reveal>
      <Reveal show={noRoute && !error}>
        <p className="text-sm" style={{ color: 'var(--danger)' }}>
          No route can swap {tokenIn.symbol} to {tokenOut.symbol} at this size right now. Try a smaller amount or another pair.
        </p>
      </Reveal>
      <Reveal show={!!error}>
        <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
          <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
        </div>
      </Reveal>
      <Reveal show={!!doneHash}>
        <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
          <Check size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            Swap confirmed.{' '}
            <a href={buildTxExplorerUrl(ARC_CHAIN_ID, doneHash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline">
              Explorer <ExternalLink size={12} />
            </a>
          </span>
        </div>
      </Reveal>
      {warning}
    </>
  )
}

export function RouteIcon({ id, size = 32 }: { id: SwapProviderId; size?: number }) {
  const m = ROUTE_META[id]
  return <GradientIcon icon={m.icon} tone={m.tone} size={size} />
}

/** Token logo with a small Arc badge in the corner, like the reference design. */
export function TokenWithChain({ children, size }: { children: ReactNode; size: number }) {
  const badge = Math.round(size * 0.42)
  return (
    <span className="relative inline-flex flex-shrink-0">
      {children}
      <span
        className="absolute -bottom-0.5 -right-0.5 rounded-full overflow-hidden"
        style={{ width: badge, height: badge, border: '2px solid var(--surface-strong)', background: 'var(--surface-strong)' }}
      >
        <LogoImg src="/chains/arc.svg" size={badge - 4} fallback={<span className="block w-full h-full rounded-full" style={{ background: 'var(--tone-to)' }} />} />
      </span>
    </span>
  )
}
