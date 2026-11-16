// How much USDC the app approves the SocialPay contract to pull, so payments within that limit
// need no further approval transaction.
//
// The limit is saved as text: "exact" (approve each payment's own amount) or a USDC amount such as "100".

import { parseUsdc } from '@/onchain-money'

export const EXACT = 'exact'
export const DEFAULT_LIMIT = '100'
/** Highest limit the app accepts, in USDC. */
export const MAX_LIMIT_USDC = 1_000_000

export const LIMIT_PRESETS: readonly { value: string; label: string }[] = [
  { value: EXACT, label: 'Exact' },
  { value: '50', label: '$50' },
  { value: '100', label: '$100' },
  { value: '500', label: '$500' },
  { value: '1000', label: '$1,000' },
]

const MAX_RAW = BigInt(MAX_LIMIT_USDC) * 10n ** 6n

export type ParsedLimit = { ok: true; value: string; raw: bigint } | { ok: false; error: string }

/** Checks a limit typed by the user. "exact" is valid and means no extra allowance (raw 0). */
export function parseLimit(input: string): ParsedLimit {
  const text = input.trim().replace(/^\$/, '').replace(/,/g, '')
  if (text.toLowerCase() === EXACT) return { ok: true, value: EXACT, raw: 0n }
  if (!text) return { ok: false, error: 'Enter an amount' }
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, error: 'Use digits only, like 250 or 12.5' }
  let raw: bigint
  try {
    raw = parseUsdc(text)
  } catch {
    return { ok: false, error: 'At most 6 decimal places' }
  }
  if (raw <= 0n) return { ok: false, error: 'Must be more than 0' }
  if (raw > MAX_RAW) return { ok: false, error: `At most $${MAX_LIMIT_USDC.toLocaleString('en-US')}` }
  return { ok: true, value: text.replace(/^0+(?=\d)/, '').replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), raw }
}

/** The limit in raw USDC units (6 decimals); 0 for "exact" or anything unreadable. */
export function limitToRaw(limit: string): bigint {
  const p = parseLimit(limit)
  return p.ok ? p.raw : 0n
}

/** What to approve for a payment: the limit, or the payment itself when it is larger (or the limit is "exact"). */
export function approvalAmount(paymentRaw: bigint, limitRaw: bigint): bigint {
  return limitRaw > paymentRaw ? limitRaw : paymentRaw
}
