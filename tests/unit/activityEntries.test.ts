import { describe, expect, test } from 'bun:test'
import { buildEntries, dayLabel, groupByDay, matchesQuery, toCsv } from '../../src/components/activity/entries'
import type { TxRecord } from '../../src/types/index'

const ME = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const STRANGER = '0x3333333333333333333333333333333333333333'

const tx = (n: number, over: Partial<TxRecord> = {}): TxRecord => ({
  id: `id${n}`, txHash: `0x${n.toString(16).padStart(64, '0')}`, chainId: 5042, direction: 'sent', amount: '1.5',
  fromAddress: ME, toAddress: OTHER, status: 'confirmed', timestamp: 1_700_000_000_000 + n * 1000, ...over,
})

const base = { address: ME, posts: [], comments: [], notifications: [] }

describe('buildEntries', () => {
  test('keeps every transaction for the wallet, newest first, with no cap', () => {
    const txHistory = Array.from({ length: 600 }, (_, i) => tx(i + 1))
    const out = buildEntries({ ...base, txHistory })
    expect(out).toHaveLength(600)
    expect(out[0].at).toBeGreaterThan(out[599].at)
  })

  test('ignores other wallets and duplicate hashes', () => {
    const a = tx(1)
    const out = buildEntries({
      ...base,
      txHistory: [a, { ...a, id: 'dup', txHash: a.txHash.toUpperCase().replace('0X', '0x') }, tx(2, { fromAddress: STRANGER, toAddress: OTHER })],
    })
    expect(out).toHaveLength(1)
  })
})

describe('search, grouping and export', () => {
  test('search matches addresses, hashes and notes', () => {
    const [e] = buildEntries({ ...base, txHistory: [tx(7, { note: 'lunch money' })] })
    expect(matchesQuery(e, 'lunch')).toBe(true)
    expect(matchesQuery(e, OTHER.slice(2, 10))).toBe(true)
    expect(matchesQuery(e, 'nothing like this')).toBe(false)
    expect(matchesQuery(e, '')).toBe(true)
  })

  test('days are labelled and grouped', () => {
    const now = new Date(2026, 9, 29, 12)
    expect(dayLabel(now.getTime() - 3_600_000, now)).toBe('Today')
    expect(dayLabel(now.getTime() - 86_400_000, now)).toBe('Yesterday')
    const groups = groupByDay(buildEntries({ ...base, txHistory: [tx(1), tx(2), tx(3, { timestamp: 1_600_000_000_000 })] }))
    expect(groups).toHaveLength(2)
    expect(groups[0].entries).toHaveLength(2)
  })

  test('CSV has a header row and one row per transaction, quoting commas', () => {
    const csv = toCsv(buildEntries({ ...base, txHistory: [tx(1, { note: 'a, b' })] }))
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('"a, b"')
  })
})
