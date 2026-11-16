'use client'

import { useState } from 'react'
import { ConnectKitButton } from 'connectkit'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, ArrowUpDown, RefreshCw, Settings2, Sparkles } from 'lucide-react'
import { Button } from '../ui/Button'
import { formatTokenAmount, type ArcToken } from '../../lib/arcTokens'
import type { SwapProviderId } from '../../lib/swapProviders'
import { useSwapEngine } from '../../hooks/useSwapEngine'
import { cleanAmountInput, Reveal, SlippagePicker } from './SwapPanel'
import { TokenLogo } from './TokenLogo'
import { TokenPicker } from './TokenPicker'
import { Notices, QuoteDetails, TokenWithChain } from './SwapParts'

const LIFI_ONLY: readonly SwapProviderId[] = ['lifi']
const onLifi = (t: ArcToken) => t.sources.includes('lifi')
const PCTS = [25, 50, 75, 100] as const
const usd = (n?: number) => (n === undefined ? '$0.00' : `$${n < 0.01 && n > 0 ? '<0.01' : n.toFixed(2)}`)

/** "Any token": every token LI.FI can route on Arc, in an exchange form. */
export function AnyTokenView() {
  const e = useSwapEngine({ routes: LIFI_ONLY, tokenFilter: onLifi })
  const [picker, setPicker] = useState<'in' | 'out' | null>(null)
  const [settings, setSettings] = useState(false)

  if (!e.isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40dvh] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>Connect your wallet to swap any token on Arc</p>
        <ConnectKitButton />
      </div>
    )
  }

  const working = e.busy !== null
  const quickTargets = e.tokens.filter((t) => t.address.toLowerCase() !== e.tokenIn.address.toLowerCase()).slice(0, 14)
  const ready = e.fresh && !!e.selected && !e.insufficient && !e.noGas
  const label =
    e.busy === 'approve' ? 'Approve in your wallet...'
    : e.busy === 'swap' ? 'Confirm in your wallet...'
    : e.amountIn === null ? 'Enter an amount'
    : e.insufficient ? `Not enough ${e.tokenIn.symbol}`
    : e.noGas ? 'Keep 0.05 USDC for gas'
    : e.noRoute ? 'No route found'
    : ready ? 'Exchange'
    : 'Finding a route...'

  return (
    <div className="space-y-3">
      {/* Quick targets */}
      <div className="flex items-center gap-2 rounded-3xl px-3 py-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <span className="flex items-center gap-1.5 text-sm font-medium flex-shrink-0" style={{ color: 'var(--ink-2)' }}>
          <Sparkles size={15} style={{ color: 'var(--tone-to)' }} /> Swap to
        </span>
        <div className="flex gap-2 overflow-x-auto py-1 pr-2 snap-x" style={{ scrollbarWidth: 'none' }} role="listbox" aria-label="Swap to">
          {quickTargets.map((t) => {
            const active = t.address.toLowerCase() === e.tokenOut.address.toLowerCase()
            return (
              <button
                key={t.address}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => e.pick('out', t)}
                className="snap-start flex-shrink-0 flex items-center gap-2 h-10 pl-1.5 pr-3 rounded-full text-sm font-semibold transition-all active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                style={{
                  background: 'var(--surface-strong)',
                  border: `1.5px solid ${active ? 'var(--tone-to)' : 'var(--border)'}`,
                  boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--tone-from) 25%, transparent)' : 'none',
                  color: 'var(--ink)',
                }}
              >
                <TokenLogo symbol={t.symbol} logoURI={t.logoURI} address={t.address} size={26} />
                {t.symbol}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-[32px] p-5 space-y-5" data-tc="" style={{ boxShadow: '0 30px 60px -36px var(--tone-glow)' }}>
        <div className="flex items-center justify-between">
          <h3 className="display font-bold text-2xl" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Exchange</h3>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => void e.refresh()}
              disabled={e.amountIn === null || working}
              aria-label="Refresh price"
              className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-40 hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--ink)' }}
            >
              <RefreshCw size={18} className={e.quoting ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => setSettings((s) => !s)}
              aria-label="Slippage settings"
              aria-expanded={settings}
              className="w-11 h-11 rounded-full flex items-center justify-center hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--ink)' }}
            >
              <Settings2 size={20} />
            </button>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {settings && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
              <SlippagePicker value={e.slippage} onChange={e.changeSlippage} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* From / To */}
        <div className="flex items-stretch gap-2 relative">
          <TokenTile title="From" token={e.tokenIn} onClick={() => setPicker('in')} />
          <button
            type="button"
            onClick={e.flip}
            aria-label="Swap direction"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-transform active:scale-90"
            style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border-strong)', color: 'var(--ink)' }}
          >
            <ArrowRight size={16} />
          </button>
          <TokenTile title="To" token={e.tokenOut} onClick={() => setPicker('out')} />
        </div>

        {/* Send */}
        <div>
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>Send</p>
          <div className="flex items-center gap-3">
            <TokenWithChain size={56}>
              <TokenLogo symbol={e.tokenIn.symbol} logoURI={e.tokenIn.logoURI} address={e.tokenIn.address} size={56} />
            </TokenWithChain>
            <div className="flex-1 min-w-0">
              <input
                value={e.amount}
                onChange={(ev) => { const n = cleanAmountInput(ev.target.value, e.tokenIn.decimals); if (n !== null) e.changeAmount(n) }}
                inputMode="decimal" autoComplete="off" spellCheck={false} placeholder="0" aria-label="Amount to send"
                className="w-full bg-transparent outline-none text-4xl font-semibold tabnum placeholder:text-[var(--subtle)]"
                style={{ color: e.insufficient ? 'var(--danger)' : 'var(--ink)', letterSpacing: '-0.02em' }}
              />
              <div className="flex items-center justify-between gap-2 text-sm tabnum" style={{ color: 'var(--muted)' }}>
                <span className="flex items-center gap-1">{usd(e.usdIn)} <ArrowUpDown size={12} /></span>
                {e.balIn !== undefined && <span className="truncate">/ {formatTokenAmount(e.balIn, e.tokenIn.decimals, 6)}</span>}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2 mt-4">
            {PCTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => e.fillPercent(p)}
                disabled={e.balIn === undefined}
                className="h-10 rounded-full text-sm font-bold disabled:opacity-40 transition-transform active:scale-95"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
              >
                {p === 100 ? 'MAX' : `${p}%`}
              </button>
            ))}
          </div>
        </div>

        {/* You receive */}
        <Reveal show={(e.fresh && !!e.selected) || e.quoting}>
          <div className="rounded-2xl p-3 flex items-center gap-3" style={{ background: 'color-mix(in srgb, var(--tone-from) 8%, var(--surface-muted))' }}>
            <TokenLogo symbol={e.tokenOut.symbol} logoURI={e.tokenOut.logoURI} address={e.tokenOut.address} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>You receive (estimated)</p>
              {e.fresh && e.selected ? (
                <p className="text-lg font-semibold tabnum truncate" style={{ color: 'var(--ink)' }}>
                  {formatTokenAmount(e.selected.amountOut, e.tokenOut.decimals, 8)} {e.tokenOut.symbol}
                </p>
              ) : (
                <span className="block h-6 w-32 rounded-lg animate-pulse mt-1" style={{ background: 'color-mix(in srgb, var(--tone-from) 22%, var(--surface-strong))' }} />
              )}
            </div>
            {e.fresh && e.usdOut !== undefined && <span className="text-sm tabnum" style={{ color: 'var(--muted)' }}>{usd(e.usdOut)}</span>}
          </div>
        </Reveal>

        <Reveal show={e.fresh && !!e.selected}>
          {e.selected && <QuoteDetails quote={e.selected} tokenIn={e.tokenIn} tokenOut={e.tokenOut} usdIn={e.usdIn} usdOut={e.usdOut} routeName="LI.FI" />}
        </Reveal>

        <Notices
          error={e.error} doneHash={e.doneHash} noRoute={e.noRoute} tokenIn={e.tokenIn} tokenOut={e.tokenOut}
          insufficient={e.insufficient} noGas={e.noGas}
        />

        <Button className="w-full !h-14 !rounded-2xl" size="lg" loading={working || (e.quoting && e.amountIn !== null)} disabled={!ready || working} onClick={() => void e.swap()}>
          {label}
        </Button>
        <p className="text-xs text-right" style={{ color: 'var(--subtle)' }}>Powered by LI.FI. Mainnet swaps use real funds.</p>
      </div>

      <TokenPicker
        open={picker !== null}
        onClose={() => setPicker(null)}
        tokens={e.tokens}
        balances={e.balances}
        loading={e.tokensLoading}
        selected={picker === 'out' ? e.tokenOut.address : e.tokenIn.address}
        title={picker === 'out' ? 'Swap to' : 'Swap from'}
        onSelect={(t) => e.pick(picker === 'out' ? 'out' : 'in', t)}
      />
    </div>
  )
}

function TokenTile({ title, token, onClick }: { title: string; token: ArcToken; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      aria-label={`${title} token, ${token.symbol} selected`}
      className="flex-1 min-w-0 rounded-3xl p-4 text-left transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      style={{ background: 'var(--surface-strong)', border: '1.5px solid var(--border)' }}
    >
      <p className="text-sm font-bold mb-3" style={{ color: 'var(--ink)' }}>{title}</p>
      <div className="flex items-center gap-3">
        <TokenWithChain size={46}>
          <TokenLogo symbol={token.symbol} logoURI={token.logoURI} address={token.address} size={46} />
        </TokenWithChain>
        <div className="min-w-0">
          <p className="text-lg font-semibold truncate" style={{ color: 'var(--ink)' }}>{token.symbol}</p>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>Arc</p>
        </div>
      </div>
    </button>
  )
}
