// Pure helpers for payment requests, bill splitting and recurring reminders.
// All money math is exact bigint via @/onchain-money.

import { isAddress } from 'viem'
import { parseUsdc, formatUsdc } from '@/onchain-money'
import { isValidUsdcAmount } from './format'

export const MAX_MEMO_LENGTH = 100

/** App-relative path for a payment request: /?pay=0x..&amount=5&memo=Lunch */
export function buildRequestPath(to: string, amount?: string, memo?: string, expiresAt?: number): string {
  const params = new URLSearchParams({ pay: to })
  const a = (amount ?? '').trim()
  if (a && isValidUsdcAmount(a)) params.set('amount', a)
  const m = (memo ?? '').trim().slice(0, MAX_MEMO_LENGTH)
  if (m) params.set('memo', m)
  // Expiry is a courtesy shown to the payer (unix seconds); it is not enforced onchain.
  if (expiresAt && Number.isFinite(expiresAt)) params.set('exp', String(Math.floor(expiresAt / 1000)))
  return `/?${params.toString()}`
}

export const EXPIRY_OPTIONS = [
  { value: 'none', label: 'No expiry', ms: 0 },
  { value: '1h', label: '1 hour', ms: 3_600_000 },
  { value: '24h', label: '24 hours', ms: 86_400_000 },
  { value: '7d', label: '7 days', ms: 7 * 86_400_000 },
  { value: '30d', label: '30 days', ms: 30 * 86_400_000 },
] as const

export type ExpiryChoice = (typeof EXPIRY_OPTIONS)[number]['value']

export interface PayPrefill {
  recipient?: string
  amount?: string
  memo?: string
  /** Expiry time in ms epoch, when the link carries one. */
  expiresAt?: number
}

/** Read and validate prefill values from a query string. */
export function parsePayPrefill(search: string): PayPrefill {
  const params = new URLSearchParams(search)
  const recipient = (params.get('pay') ?? '').trim()
  const amount = (params.get('amount') ?? '').trim()
  const memo = (params.get('memo') ?? '').trim().slice(0, MAX_MEMO_LENGTH)
  const expSecs = Number(params.get('exp') ?? '')
  return {
    recipient: recipient && isAddress(recipient) ? recipient : undefined,
    amount: amount && isValidUsdcAmount(amount) ? amount : undefined,
    memo: memo || undefined,
    expiresAt: Number.isSafeInteger(expSecs) && expSecs > 0 ? expSecs * 1000 : undefined,
  }
}

export interface SplitResult {
  /** What each of the other people pays (floored to 6 decimals). */
  shareRaw: bigint
  /** What the organiser covers: their own share plus any leftover dust. */
  organiserRaw: bigint
  shareText: string
  organiserText: string
}

/**
 * Split a bill equally between `people` (including the organiser). Others pay
 * the floored share; the organiser absorbs the remainder, so the parts always
 * add back up to the exact total.
 */
export function splitEqually(total: string, people: number): SplitResult | null {
  if (!Number.isInteger(people) || people < 2 || people > 50) return null
  let totalRaw: bigint
  try {
    totalRaw = parseUsdc(total.trim())
  } catch {
    return null
  }
  if (totalRaw <= 0n) return null
  const n = BigInt(people)
  const shareRaw = totalRaw / n
  if (shareRaw <= 0n) return null
  const organiserRaw = totalRaw - shareRaw * (n - 1n)
  return { shareRaw, organiserRaw, shareText: formatUsdc(shareRaw), organiserText: formatUsdc(organiserRaw) }
}

// ── Recurring reminders ─────────────────────────────────────────────────────

export type Frequency = 'once' | 'daily' | 'weekly' | 'monthly'

export interface ScheduledPayment {
  id: string
  owner: string
  recipient: string
  amount: string
  note: string
  frequency: Frequency
  /** Next due time (ms epoch). */
  nextDue: number
}

export function addInterval(ts: number, frequency: Frequency): number {
  const d = new Date(ts)
  if (frequency === 'daily') d.setDate(d.getDate() + 1)
  else if (frequency === 'weekly') d.setDate(d.getDate() + 7)
  else if (frequency === 'monthly') d.setMonth(d.getMonth() + 1)
  return d.getTime()
}

/** Next due time strictly after `now`, stepping from `from` by the frequency. */
export function advanceDue(from: number, frequency: Frequency, now = Date.now()): number {
  let next = addInterval(from, frequency)
  let guard = 0
  while (next <= now && guard < 1000) {
    next = addInterval(next, frequency)
    guard++
  }
  return next
}
