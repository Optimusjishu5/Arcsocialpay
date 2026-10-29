// ── Formatting utilities ────────────────────────────────────────────────────
// Money rules: all USDC validation/parsing uses bigint via @/onchain-money.
// Display helpers below are DISPLAY-ONLY (grouped strings for UI) — never use
// them or Number/parseFloat for validation or balance checks. Validation must
// use isValidUsdcAmount / validateSend (bigint exact).

import { isAddress } from 'viem'
import { Amount, parseUsdc } from '@/onchain-money'
import { USDC_DECIMALS } from '@/onchain-facts'

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const

// Canonical shared amount-shape + address-compare helpers (P1 dedupe).
// Import these instead of defining locals in PayView/MessagesView/PostCard/WalletView.
// NOTE: AMOUNT_REGEX requires a leading digit (matches legacy view locals).
// validateSend's stricter AMOUNT_SHAPE (allows ".5") remains the source of truth
// for validation; AMOUNT_REGEX is for UI pre-checks only.
export const AMOUNT_REGEX = /^\d+(\.\d{1,6})?$/

export function isSameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return a.toLowerCase() === b.toLowerCase()
}

// Single-import DISPLAY helper: Amount-aware `formatUsdc` lives in
// hooks/useArcWallet (canonical Amount path). Re-exported here so views can
// `import { formatUsdc } from '../utils/format'` instead of guessing which
// `formatUsdc` to use. Both `formatUsdc` and `formatUsdcDisplay` are
// DISPLAY-ONLY (never for validation/balances).
export { formatUsdc } from '../hooks/useArcWallet'

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

// Exact bigint validation — never Number/parseFloat.
// Handles: dust 0.000001 (1n, valid), 7 decimals (invalid), large >2^53
// (bigint exact), 1e6 notation (invalid, rejected by parseUsdc).
export function isValidUsdcAmount(value: string): boolean {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  if (trimmed === '') return false
  try {
    const raw = parseUsdc(trimmed)
    return raw > 0n
  } catch {
    return false
  }
}

// ── DISPLAY-ONLY helpers ────────────────────────────────────────────────────
// These return grouped strings for UI. Never use for validation/balances.
// They are bigint-exact (Amount.fromRaw / Amount.parse) so large >2^53,
// dust, and 1e6-notation edge cases don't lose precision like Number would.

function groupThousands(intPart: string): string {
  const sign = intPart.startsWith('-') ? '-' : ''
  const unsigned = sign ? intPart.slice(1) : intPart
  const normalized = unsigned.replace(/^0+(?=\d)/, '')
  const grouped = normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return sign + (grouped === '' ? '0' : grouped)
}

// Exact "min 2, max 6" display from an already-parsed Amount (USDC 6-dec).
// Amount.toString() is minimal exact (e.g. "1", "1.5", "0.000001"), so we only
// pad to min 2 — no Number rounding involved.
function formatExactMin2(exact: string): string {
  const sign = exact.startsWith('-') ? '-' : ''
  const unsigned = sign ? exact.slice(1) : exact
  const sep = unsigned.indexOf('.')
  const intRaw = sep === -1 ? unsigned : unsigned.slice(0, sep)
  const fracRaw = sep === -1 ? '' : unsigned.slice(sep + 1)
  const frac = fracRaw.padEnd(2, '0')
  const groupedInt = groupThousands(intRaw === '' ? '0' : intRaw)
  return `${sign}${groupedInt}.${frac}`
}

// DISPLAY-ONLY: human-readable USDC with grouping, min 2 / max 6 fraction.
// bigint input = 6-dec raw units. string input = human decimal (e.g. "1.5").
export function formatUsdcDisplay(amount: string | bigint): string {
  try {
    let amt: Amount
    if (typeof amount === 'bigint') {
      amt = Amount.fromRaw(amount, USDC_DECIMALS)
    } else {
      const trimmed = (amount ?? '').trim()
      if (trimmed === '') return '0.00'
      amt = Amount.parse(trimmed, USDC_DECIMALS)
    }
    return formatExactMin2(amt.toString())
  } catch {
    return '0.00'
  }
}

// DISPLAY-ONLY: USD currency with grouping, rounded to cents (half-up via
// bigint). Never use for validation.
function roundUsdcRawToCents(raw6: bigint): bigint {
  const divisor = 10_000n // 10^(6-2)
  const half = 5_000n
  if (raw6 >= 0n) return (raw6 + half) / divisor
  return (raw6 - half) / divisor
}

// DISPLAY-ONLY: "$1,234.56" style. bigint = raw, string = human decimal.
export function formatUsdcCurrency(amount: string | bigint): string {
  try {
    let raw: bigint
    if (typeof amount === 'bigint') {
      raw = amount
    } else {
      const trimmed = (amount ?? '').trim()
      if (trimmed === '') return '$0.00'
      raw = Amount.parse(trimmed, USDC_DECIMALS).raw
    }
    const cents = roundUsdcRawToCents(raw)
    const sign = cents < 0n ? '-' : ''
    const abs = cents < 0n ? -cents : cents
    const dollars = abs / 100n
    const centPart = (abs % 100n).toString().padStart(2, '0')
    return `${sign}$${groupThousands(dollars.toString())}.${centPart}`
  } catch {
    return '$0.00'
  }
}

export function formatTimestamp(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (secs < 60) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatFullTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatChatTime(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const isToday = now.toDateString() === date.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; code?: number }
  const message = e?.message?.toLowerCase() ?? ''
  if (e?.code === 4001 || message.includes('user rejected') || message.includes('user denied')) {
    return 'Transaction cancelled.'
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient USDC balance. Please add funds and try again.'
  }
  if (message.includes('nonce')) {
    return 'Transaction nonce error. Please try again.'
  }
  if (message.includes('reverted')) {
    const reasonMatch = message.match(/reason="([^"]+)"/)
    return reasonMatch ? `Transaction failed: ${reasonMatch[1]}` : 'Transaction failed. Please try again.'
  }
  if (message.includes('network') || message.includes('timeout') || message.includes('rpc')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (message.includes('gas')) {
    return 'Gas estimation failed. You may not have enough USDC for fees.'
  }
  return 'Something went wrong. Please try again.'
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function getAvatarColor(seed: string): string {
  const colors = [
    '#1a5ca8', '#0d7460', '#7c3aed', '#b45309', '#0369a1',
    '#047857', '#9333ea', '#c2410c', '#155e75', '#1e40af',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return colors[hash % colors.length]
}

export function getInitials(name: string, address?: string): string {
  if (name && name !== address?.slice(0, 6)) {
    return name.slice(0, 2).toUpperCase()
  }
  return address ? address.slice(2, 4).toUpperCase() : '??'
}

// ── Shared send validator (bigint-exact) ────────────────────────────────────

export interface ValidateSendInput {
  recipient: string
  amountStr: string
  balanceRaw: bigint
  myAddress?: string | null
  usdcAddress?: string | null
}

export interface ValidateSendResult {
  ok: boolean
  error?: string
  /** Parsed 6-dec raw amount when ok === true. */
  raw?: bigint
}

// Strict shape pre-check: plain decimals only, max 6 fraction digits.
// Rejects 1e6 / 1E6 / negative / 7+ decimals. Allows ".5" style dust input;
// parseUsdc below remains the source of truth.
const AMOUNT_SHAPE = /^(?:\d+(?:\.\d{1,6})?|\.\d{1,6})$/

export function validateSend(input: ValidateSendInput): ValidateSendResult {
  const recipient = (input.recipient ?? '').trim()
  const amountStr = (input.amountStr ?? '').trim()
  const balanceRaw = input.balanceRaw
  const myAddress = (input.myAddress ?? '').trim()
  const usdcAddress = (input.usdcAddress ?? '').trim()

  if (!recipient || !isAddress(recipient)) {
    return { ok: false, error: 'Enter a valid Arc address (0x...)' }
  }
  if (recipient.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
    return { ok: false, error: 'Cannot send to zero address' }
  }
  if (myAddress && recipient.toLowerCase() === myAddress.toLowerCase()) {
    return { ok: false, error: 'Cannot send to your own address' }
  }
  if (usdcAddress && recipient.toLowerCase() === usdcAddress.toLowerCase()) {
    return { ok: false, error: 'Cannot send to USDC contract address' }
  }
  if (!amountStr) {
    return { ok: false, error: 'Enter a valid amount' }
  }
  if (!AMOUNT_SHAPE.test(amountStr)) {
    // Give the precise "too many decimals" message when the shape is otherwise numeric.
    const dot = amountStr.indexOf('.')
    if (dot !== -1 && /^[0-9]*\.?[0-9]+$/.test(amountStr) && amountStr.slice(dot + 1).length > 6) {
      return { ok: false, error: 'Too many decimal places (max 6)' }
    }
    try {
      parseUsdc(amountStr)
    } catch (e) {
      const code = (e as { code?: string })?.code
      if (code === 'TOO_MANY_FRACTION_DIGITS') {
        return { ok: false, error: 'Too many decimal places (max 6)' }
      }
      return { ok: false, error: 'Enter a valid amount' }
    }
    return { ok: false, error: 'Enter a valid amount' }
  }

  let raw: bigint
  try {
    raw = parseUsdc(amountStr)
  } catch (e) {
    const code = (e as { code?: string })?.code
    if (code === 'TOO_MANY_FRACTION_DIGITS') {
      return { ok: false, error: 'Too many decimal places (max 6)' }
    }
    return { ok: false, error: 'Enter a valid amount' }
  }
  if (raw <= 0n) {
    return { ok: false, error: 'Enter a valid amount' }
  }
  if (typeof balanceRaw !== 'bigint') {
    return { ok: false, error: 'Enter a valid amount' }
  }
  // Exact bigint balance compare — never Number(balance)/1e6.
  if (raw > balanceRaw) {
    return { ok: false, error: `Insufficient balance. You have ${formatUsdcDisplay(balanceRaw)} USDC.` }
  }
  return { ok: true, raw }
}

// ── maxSendable (balance - feeBuffer, floored at 0) ─────────────────────────
// On Arc gas is paid in USDC, so "MAX" must leave a fee buffer. Pure bigint,
// no Number. feeBufferRaw defaults to 0 (caller passes e.g. 10_000n = $0.01).
export function maxSendable(balanceRaw: bigint, feeBufferRaw = 0n): bigint {
  if (typeof balanceRaw !== 'bigint') return 0n
  if (typeof feeBufferRaw !== 'bigint' || feeBufferRaw < 0n) feeBufferRaw = 0n
  return balanceRaw > feeBufferRaw ? balanceRaw - feeBufferRaw : 0n
}

// DISPLAY-ONLY: max-sendable as human string (exact, grouped via formatUsdcDisplay path).
export function maxSendableDisplay(balanceRaw: bigint, feeBufferRaw = 0n): string {
  try {
    const raw = maxSendable(balanceRaw, feeBufferRaw)
    return Amount.fromRaw(raw, USDC_DECIMALS).toString()
  } catch {
    return '0'
  }
}

// Alias so callers can use the onchain-money name without a second import.
// Same implementation as `maxSendable` above (and onchain-money's maxSendableRaw):
// pure bigint, floored at 0. Pair with formatUsdcDisplay for MAX buttons.
export const maxSendableRaw = maxSendable
