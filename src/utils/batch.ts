// Batch transfer helpers: CSV parsing and row validation (exact bigint math).

import { isAddress } from 'viem'
import { parseUsdc } from '@/onchain-money'
import { ZERO_ADDRESS, isSameAddress } from './format'

export const MAX_BATCH_ROWS = 50

export type RowStatus = 'queued' | 'signing' | 'confirming' | 'confirmed' | 'failed'

export interface BatchRow {
  id: string
  address: string
  amount: string
  status: RowStatus
  hash?: string
  error?: string
}

export interface RawRow {
  address: string
  amount: string
}

/**
 * Parse "address,amount" lines. Accepts comma, semicolon or tab separators and
 * an optional header line. Blank lines are skipped.
 */
export function parseBatchCsv(text: string): RawRow[] {
  const rows: RawRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const parts = trimmed.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ''))
    if (parts.length < 2) {
      rows.push({ address: parts[0] ?? '', amount: '' })
      continue
    }
    // Skip a header such as "address,amount".
    if (rows.length === 0 && !isAddress(parts[0]) && /address|wallet|recipient/i.test(parts[0])) continue
    rows.push({ address: parts[0], amount: parts[1] })
  }
  return rows
}

/** Returns an error message for a row, or null when it is valid. */
export function validateRow(
  row: RawRow,
  ctx: { myAddress?: string; usdcAddress: string },
): string | null {
  const addr = row.address.trim()
  if (!isAddress(addr)) return 'Invalid address'
  if (addr.toLowerCase() === ZERO_ADDRESS.toLowerCase()) return 'Zero address'
  if (addr.toLowerCase() === ctx.usdcAddress.toLowerCase()) return 'USDC contract address'
  if (isSameAddress(addr, ctx.myAddress)) return 'Your own address'
  const amt = row.amount.trim()
  if (!/^\d+(\.\d{1,6})?$/.test(amt)) return 'Invalid amount (max 6 decimals)'
  try {
    if (parseUsdc(amt) <= 0n) return 'Amount must be above 0'
  } catch {
    return 'Invalid amount'
  }
  return null
}

/** Exact total in raw 6-decimal units across rows that parse. */
export function totalRaw(rows: RawRow[]): bigint {
  let sum = 0n
  for (const r of rows) {
    try {
      sum += parseUsdc(r.amount.trim())
    } catch {
      /* invalid rows are reported by validateRow */
    }
  }
  return sum
}
