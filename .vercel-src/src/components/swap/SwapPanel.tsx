'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowDown, ChevronDown } from 'lucide-react'
import { TONES, type Tone } from '../dashboard/ui'

// Shared pieces of the swap screens: big amount cards, token pills, a flip
// button that spins, a slippage picker and an animated details panel.

export const TOKEN_TONE: Record<string, Tone> = { USDC: 'blue', EURC: 'indigo', cirBTC: 'amber' }

/**
 * Cleans what the user types into an amount box. Returns the accepted text, or
 * null when the keystroke should be ignored (letters, a second dot, too many decimals).
 */
export function cleanAmountInput(raw: string, decimals: number): string | null {
  const typed = raw.replace(',', '.').replace(/\s/g, '')
  if (typed === '') return ''
  if (!/^\d*\.?\d*$/.test(typed)) return null
  const v = typed.startsWith('.') ? `0${typed}` : typed
  const [whole, frac] = v.split('.')
  if (frac !== undefined && frac.length > decimals) return null
  // "007" becomes "7" but "0.5" and "0" stay as typed.
  if (frac === undefined && whole.length > 1 && whole.startsWith('0')) return whole.replace(/^0+/, '') || '0'
  return v
}

function TokenBadge({ symbol, size = 30 }: { symbol: string; size?: number }) {
  const [from, to] = TONES[TOKEN_TONE[symbol] ?? 'blue']
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: `linear-gradient(135deg, ${from}, ${to})`,
        boxShadow: `0 6px 14px -6px ${to}, inset 0 1px 0 rgba(255,255,255,0.4)`,
      }}
    >
      {symbol === 'cirBTC' ? 'B' : symbol.charAt(0)}
    </span>
  )
}

function TokenPill({ value, tokens, onChange }: { value: string; tokens: readonly string[]; onChange: (t: string) => void }) {
  return (
    <div className="relative flex-shrink-0">
      <div
        className="flex items-center gap-2 h-12 pl-2 pr-9 rounded-full font-semibold text-base transition-transform active:scale-95"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}
      >
        <TokenBadge symbol={value} />
        {value}
      </div>
      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--muted)' }} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Choose token"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {tokens.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </div>
  )
}

const PCTS = [25, 50, 75, 100] as const

interface AmountCardProps {
  label: string
  value: string
  symbol: string
  tokens: readonly string[]
  onToken: (t: string) => void
  /** Present for the "You pay" card; omit for the read-only "You receive" card. */
  onChange?: (v: string) => void
  decimals?: number
  balanceText?: string
  onPct?: (pct: number) => void
  /** Show a shimmer in place of the number while a price is loading. */
  loading?: boolean
  /** Fade the number (it belongs to an older price). */
  dim?: boolean
  invalid?: boolean
}

export function AmountCard({
  label, value, symbol, tokens, onToken, onChange, decimals = 6, balanceText, onPct, loading, dim, invalid,
}: AmountCardProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [focused, setFocused] = useState(false)
  const editable = !!onChange
  const size = value.length > 14 ? 'text-2xl' : value.length > 9 ? 'text-3xl' : 'text-4xl'

  return (
    <div
      onClick={() => inputRef.current?.focus()}
      className="rounded-3xl p-4 transition-all duration-200"
      style={{
        background: 'color-mix(in srgb, var(--tone-from, #5fbeff) 7%, var(--surface-muted))',
        border: `1.5px solid ${invalid ? 'var(--danger)' : focused ? 'var(--tone-to)' : 'color-mix(in srgb, var(--tone-to, #2563eb) 22%, var(--border))'}`,
        boxShadow: focused ? '0 0 0 4px color-mix(in srgb, var(--tone-from, #5fbeff) 28%, transparent)' : 'none',
      }}
    >
      <div className="flex items-center justify-between gap-2 mb-2 min-h-[24px]">
        <label htmlFor={id} className="text-xs font-semibold uppercase tracking-wider">{label}</label>
        {editable && balanceText && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <span className="text-xs tabnum mr-1" style={{ color: 'var(--muted)' }}>{balanceText}</span>
            {onPct && PCTS.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => onPct(p)}
                data-chip=""
                className="h-6 px-2 rounded-full text-[11px]"
              >
                {p === 100 ? 'Max' : `${p}%`}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0 h-14 flex items-center">
          {editable ? (
            <input
              id={id}
              ref={inputRef}
              value={value}
              onChange={(e) => {
                const next = cleanAmountInput(e.target.value, decimals)
                if (next !== null) onChange(next)
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              placeholder="0"
              aria-label={label}
              className={`w-full bg-transparent outline-none font-semibold tabnum ${size}`}
              style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}
            />
          ) : loading && !value ? (
            <span className="block h-9 w-40 rounded-xl animate-pulse" style={{ background: 'color-mix(in srgb, var(--tone-from) 22%, var(--surface-strong))' }} />
          ) : (
            <output
              id={id}
              className={`block w-full truncate font-semibold tabnum transition-opacity duration-200 ${size}`}
              style={{ color: value ? 'var(--ink)' : 'var(--subtle)', opacity: dim || loading ? 0.45 : 1, letterSpacing: '-0.02em' }}
            >
              {value || '0'}
            </output>
          )}
        </div>
        <TokenPill value={symbol} tokens={tokens} onChange={onToken} />
      </div>
    </div>
  )
}

/** Round button between the two cards. Spins half a turn every time it is pressed. */
export function FlipButton({ onFlip }: { onFlip: () => void }) {
  const [turns, setTurns] = useState(0)
  return (
    <div className="relative z-10 flex justify-center -my-5">
      <motion.button
        type="button"
        aria-label="Swap direction"
        onClick={() => { setTurns((n) => n + 1); onFlip() }}
        animate={{ rotate: turns * 180 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.9 }}
        className="w-11 h-11 rounded-full flex items-center justify-center text-white"
        style={{
          background: 'linear-gradient(135deg, var(--tone-from), var(--tone-to))',
          border: '4px solid var(--surface)',
          boxShadow: '0 10px 22px -8px var(--tone-glow)',
        }}
      >
        <ArrowDown size={18} strokeWidth={2.6} />
      </motion.button>
    </div>
  )
}

const SLIPPAGE_OPTIONS = [10, 50, 100, 300, 500] as const // basis points: 0.1% to 5%

export function SlippagePicker({ value, onChange }: { value: number; onChange: (bps: number) => void }) {
  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block">Max slippage</label>
      <div className="relative grid grid-cols-5 gap-1 p-1 rounded-2xl" style={{ background: 'var(--surface-muted)' }}>
        {SLIPPAGE_OPTIONS.map((bps) => {
          const active = value === bps
          return (
            <button
              key={bps}
              type="button"
              onClick={() => onChange(bps)}
              className="relative h-10 rounded-xl text-xs font-semibold transition-colors"
              style={{ color: active ? '#fff' : 'var(--muted)' }}
            >
              {active && (
                <motion.span
                  layoutId="slippage-active"
                  className="absolute inset-0 rounded-xl"
                  style={{ background: 'linear-gradient(135deg, var(--tone-from), var(--tone-to))', boxShadow: '0 8px 16px -10px var(--tone-glow)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{bps / 100}%</span>
            </button>
          )
        })}
      </div>
      <AnimatePresence initial={false}>
        {value > 100 && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-xs mt-1.5 overflow-hidden"
            style={{ color: 'var(--danger)' }}
          >
            High slippage lets the price move against you before the swap settles.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  )
}

/** Panel that slides open when content appears and closed when it goes away. */
export function Reveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="reveal"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22 }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
