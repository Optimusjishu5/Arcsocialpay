'use client'

import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, Info } from 'lucide-react'
import { Button } from '../ui/Button'
import { formatTokenAmount } from '../../lib/arcTokens'
import type { SwapProviderId } from '../../lib/swapProviders'
import { useSwapEngine } from '../../hooks/useSwapEngine'
import { AmountCard, FlipButton, Reveal, SlippagePicker } from './SwapPanel'
import { TokenPicker } from './TokenPicker'
import { Notices, QuoteDetails, ROUTE_META, RouteIcon } from './SwapParts'

const ALL_ROUTES: readonly SwapProviderId[] = ['kyber', 'uniswap']
const usd = (n?: number) => (n === undefined ? undefined : `≈ $${n < 0.01 && n > 0 ? '<0.01' : n.toFixed(2)}`)

/**
 * "Best price": asks KyberSwap and Uniswap at once, picks the route that
 * pays the most, and lets you choose another route if you prefer.
 */
export function BestPriceView({ routes = ALL_ROUTES }: { routes?: readonly SwapProviderId[] }) {
  const e = useSwapEngine({ routes })
  const [picker, setPicker] = useState<'in' | 'out' | null>(null)
  const [showSlippage, setShowSlippage] = useState(false)
  const names = routes.map((r) => ROUTE_META[r].name)

  if (!e.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to swap on Arc</p>
        <ConnectKitButton />
      </div>
    )
  }

  const working = e.busy !== null
  const label =
    e.busy === 'approve' ? 'Approve in your wallet...'
    : e.busy === 'swap' ? 'Confirm the swap in your wallet...'
    : e.amountIn === null ? 'Enter an amount'
    : e.insufficient ? `Not enough ${e.tokenIn.symbol}`
    : e.noGas ? 'Keep 0.05 USDC for gas'
    : e.noRoute ? 'No route found'
    : e.fresh && e.selected ? `Swap ${e.tokenIn.symbol} for ${e.tokenOut.symbol}`
    : 'Finding the best price...'
  const ready = e.fresh && !!e.selected && !e.insufficient && !e.noGas

  return (
    <div className="space-y-3">
      <div className="rounded-[32px] p-3 space-y-3" data-tc="" style={{ boxShadow: '0 30px 60px -36px var(--tone-glow)' }}>
        <div>
          <AmountCard
            label="Sell"
            value={e.amount}
            symbol={e.tokenIn.symbol}
            token={e.tokenIn}
            tokens={[]}
            onOpenPicker={() => setPicker('in')}
            onToken={() => undefined}
            decimals={e.tokenIn.decimals}
            invalid={e.insufficient || e.noGas}
            onChange={e.changeAmount}
            balanceText={e.balIn !== undefined ? `${formatTokenAmount(e.balIn, e.tokenIn.decimals, 4)} ${e.tokenIn.symbol}` : undefined}
            onPct={e.balIn !== undefined ? e.fillPercent : undefined}
            subText={usd(e.usdIn)}
          />
          <FlipButton onFlip={e.flip} />
          <AmountCard
            label="Receive"
            value={e.fresh && e.selected ? formatTokenAmount(e.selected.amountOut, e.tokenOut.decimals, 8) : ''}
            symbol={e.tokenOut.symbol}
            token={e.tokenOut}
            tokens={[]}
            onOpenPicker={() => setPicker('out')}
            onToken={() => undefined}
            loading={e.quoting && !e.selected}
            dim={!e.fresh && !!e.results}
            balanceText={e.balOut !== undefined ? `${formatTokenAmount(e.balOut, e.tokenOut.decimals, 4)} ${e.tokenOut.symbol}` : undefined}
            subText={e.fresh ? usd(e.usdOut) : undefined}
          />
        </div>

        {/* Every route's price, best first. Routes still loading show a placeholder; tap a price to use that route. */}
        <Reveal show={routes.length > 1 && e.amountIn !== null && (e.fresh || e.quoting)}>
          <div className="space-y-1.5" role="radiogroup" aria-label="Swap route">
            {(e.fresh ? (e.results ?? []) : []).slice().sort((a, b) => Number((b.quote?.amountOut ?? -1n) - (a.quote?.amountOut ?? -1n))).map((r, i) => {
              const q = r.quote
              const active = !!q && e.selectedId === r.id
              const allIn = !e.quoting || (e.results?.length ?? 0) >= routes.length
              return (
                <button
                  key={r.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!q || working}
                  onClick={() => q && e.setChoice(r.id)}
                  className="w-full flex items-center gap-3 p-2.5 rounded-2xl text-left transition-all disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                  style={{
                    background: active ? 'color-mix(in srgb, var(--tone-from) 12%, var(--surface-strong))' : 'var(--surface)',
                    border: `1.5px solid ${active ? 'var(--tone-to)' : 'var(--border)'}`,
                    opacity: q ? 1 : 0.55,
                  }}
                >
                  <RouteIcon id={r.id} size={30} />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {ROUTE_META[r.id].name}
                      {q && i === 0 && allIn && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>Best</span>}
                    </span>
                    {!q && <span className="block text-[11px] truncate" style={{ color: 'var(--muted)' }}>{r.error}</span>}
                  </span>
                  {q && <span className="tabnum text-sm font-semibold" style={{ color: 'var(--ink)' }}>{formatTokenAmount(q.amountOut, e.tokenOut.decimals, 6)} {e.tokenOut.symbol}</span>}
                </button>
              )
            })}
            {e.quoting && routes.filter((r) => !(e.fresh && e.results?.some((x) => x.id === r))).map((r) => (
              <div key={`wait-${r}`} className="w-full flex items-center gap-3 p-2.5 rounded-2xl" style={{ background: 'var(--surface)', border: '1.5px solid var(--border)' }} aria-busy="true">
                <RouteIcon id={r} size={30} />
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{ROUTE_META[r].name}</span>
                <span className="h-5 w-24 rounded-lg animate-pulse" style={{ background: 'color-mix(in srgb, var(--tone-from) 22%, var(--surface-strong))' }} />
              </div>
            ))}
            {e.choice !== 'auto' && (
              <button type="button" onClick={() => e.setChoice('auto')} className="text-xs underline" style={{ color: 'var(--muted)' }}>Use the best price automatically</button>
            )}
          </div>
        </Reveal>

        <Reveal show={e.fresh && !!e.selected && e.selectedId !== undefined}>
          {e.selected && e.selectedId && (
            <QuoteDetails quote={e.selected} tokenIn={e.tokenIn} tokenOut={e.tokenOut} usdIn={e.usdIn} usdOut={e.usdOut} routeName={ROUTE_META[e.selectedId].name} />
          )}
        </Reveal>

        <Notices
          error={e.error} doneHash={e.doneHash} noRoute={e.noRoute} tokenIn={e.tokenIn} tokenOut={e.tokenOut}
          insufficient={e.insufficient} noGas={e.noGas}
        />

        <button
          type="button"
          onClick={() => setShowSlippage((s) => !s)}
          aria-expanded={showSlippage}
          className="w-full flex items-center justify-between px-1 text-xs"
          style={{ color: 'var(--muted)' }}
        >
          <span>Max slippage <span className="tabnum font-semibold" style={{ color: 'var(--ink)' }}>{e.slippage / 100}%</span></span>
          <ChevronDown size={14} style={{ transform: showSlippage ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </button>
        <AnimatePresence initial={false}>
          {showSlippage && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <SlippagePicker value={e.slippage} onChange={e.changeSlippage} />
            </motion.div>
          )}
        </AnimatePresence>

        <Button
          className="w-full !h-14 !rounded-full"
          size="lg"
          loading={working || (e.quoting && !e.selected)}
          disabled={!ready || working}
          onClick={() => void e.swap()}
        >
          {label}
        </Button>
      </div>

      <p className="flex items-start gap-2 px-2 text-xs text-center justify-center" style={{ color: 'var(--muted)' }}>
        <Info size={13} className="flex-shrink-0 mt-0.5" />
        <span>
          {routes.length > 1 ? `Best price across ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]} on Arc.` : `Priced by ${names[0]} on Arc.`}{' '}
          You sign every step in your own wallet. Mainnet swaps use real funds, and you are subject to each provider's terms.
        </span>
      </p>

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        tokens={e.tokens}
        balances={e.balances}
        loading={e.tokensLoading}
        selected={picker === 'out' ? e.tokenOut.address : e.tokenIn.address}
        allowCustom={routes.includes('uniswap') && routes.length === 1}
        title={picker === 'out' ? 'Receive' : 'Sell'}
        onSelect={(t) => e.pick(picker === 'out' ? 'out' : 'in', t)}
      />
    </div>
  )
}

