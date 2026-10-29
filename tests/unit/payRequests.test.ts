import { describe, expect, test } from 'bun:test'
import { advanceDue, buildRequestPath, parsePayPrefill, splitEqually } from '../../src/utils/payRequests'
import { MAX_BATCH_ROWS, parseBatchCsv, totalRaw, validateRow } from '../../src/utils/batch'

const ME = '0x180D51df0C75495303095DF858874fCCBe487c61'
const OTHER = '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54'
const USDC = '0x3600000000000000000000000000000000000000'

describe('payment request links', () => {
  test('round-trips address, amount, memo and expiry', () => {
    const exp = Date.UTC(2030, 0, 1)
    const path = buildRequestPath(ME, '12.5', 'Lunch', exp)
    const parsed = parsePayPrefill(path.slice(path.indexOf('?')))
    expect(parsed.recipient).toBe(ME)
    expect(parsed.amount).toBe('12.5')
    expect(parsed.memo).toBe('Lunch')
    expect(parsed.expiresAt).toBe(exp)
  })

  test('drops invalid amounts, addresses and expiries', () => {
    const parsed = parsePayPrefill('?pay=nope&amount=1e6&exp=abc')
    expect(parsed.recipient).toBeUndefined()
    expect(parsed.amount).toBeUndefined()
    expect(parsed.expiresAt).toBeUndefined()
  })

  test('caps memo length', () => {
    const parsed = parsePayPrefill(`?pay=${ME}&memo=${'x'.repeat(500)}`)
    expect(parsed.memo?.length).toBe(100)
  })
})

describe('split bill', () => {
  test('parts always add up to the total', () => {
    const s = splitEqually('10', 3)
    expect(s).not.toBeNull()
    expect(s!.shareRaw * 2n + s!.organiserRaw).toBe(10_000_000n)
    expect(s!.shareText).toBe('3.333333')
    expect(s!.organiserText).toBe('3.333334')
  })

  test('rejects bad input', () => {
    expect(splitEqually('0', 3)).toBeNull()
    expect(splitEqually('10', 1)).toBeNull()
    expect(splitEqually('abc', 3)).toBeNull()
    expect(splitEqually('0.000001', 3)).toBeNull()
  })
})

describe('recurring reminders', () => {
  test('advanceDue lands strictly in the future', () => {
    const now = Date.UTC(2026, 5, 15)
    const next = advanceDue(Date.UTC(2026, 0, 1), 'weekly', now)
    expect(next).toBeGreaterThan(now)
    expect(next - now).toBeLessThanOrEqual(7 * 86_400_000 + 3_600_000)
  })
})

describe('batch transfer parsing', () => {
  test('parses csv with header, separators and blank lines', () => {
    const rows = parseBatchCsv(`address,amount\n${ME},5\n\n${OTHER};2.25\n`)
    expect(rows).toEqual([{ address: ME, amount: '5' }, { address: OTHER, amount: '2.25' }])
    expect(totalRaw(rows)).toBe(7_250_000n)
  })

  test('validates each row', () => {
    const ctx = { myAddress: ME, usdcAddress: USDC }
    expect(validateRow({ address: OTHER, amount: '1' }, ctx)).toBeNull()
    expect(validateRow({ address: 'zzz', amount: '1' }, ctx)).toBe('Invalid address')
    expect(validateRow({ address: ME, amount: '1' }, ctx)).toBe('Your own address')
    expect(validateRow({ address: USDC, amount: '1' }, ctx)).toBe('USDC contract address')
    expect(validateRow({ address: OTHER, amount: '0' }, ctx)).toBe('Amount must be above 0')
    expect(validateRow({ address: OTHER, amount: '1.1234567' }, ctx)).toBe('Invalid amount (max 6 decimals)')
    expect(MAX_BATCH_ROWS).toBe(50)
  })
})
