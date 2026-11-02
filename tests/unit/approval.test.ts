import { describe, expect, test } from 'bun:test'
import { approvalAmount, limitToRaw, parseLimit, MAX_LIMIT_USDC } from '../../src/utils/approval'

const USDC = (n: number) => BigInt(Math.round(n * 1e6))

describe('approval amount', () => {
  test('a payment under the limit approves the whole limit, once', () => {
    expect(approvalAmount(USDC(5), USDC(100))).toBe(USDC(100))
  })
  test('a payment above the limit approves exactly the payment', () => {
    expect(approvalAmount(USDC(250), USDC(100))).toBe(USDC(250))
  })
  test('a payment equal to the limit approves exactly that', () => {
    expect(approvalAmount(USDC(100), USDC(100))).toBe(USDC(100))
  })
  test('"exact" approves just the payment', () => {
    expect(approvalAmount(USDC(5), limitToRaw('exact'))).toBe(USDC(5))
  })
})

describe('limit input', () => {
  test('presets and typed amounts parse to exact 6-decimal units', () => {
    expect(limitToRaw('100')).toBe(100_000_000n)
    expect(limitToRaw('$1,000')).toBe(1_000_000_000n)
    expect(limitToRaw('12.5')).toBe(12_500_000n)
    expect(limitToRaw('0.000001')).toBe(1n)
  })
  test('exact means no extra allowance', () => {
    expect(parseLimit('exact')).toEqual({ ok: true, value: 'exact', raw: 0n })
    expect(parseLimit(' EXACT ')).toEqual({ ok: true, value: 'exact', raw: 0n })
  })
  test('amounts are stored tidy', () => {
    const p = parseLimit('0250.500')
    expect(p.ok && p.value).toBe('250.5')
  })
  test('bad input is rejected with a reason', () => {
    for (const bad of ['', 'abc', '-5', '0', '0.0', '1e3', '1.0000001', '12,5x']) expect(parseLimit(bad).ok).toBe(false)
    expect(limitToRaw('abc')).toBe(0n)
  })
  test('the cap is enforced', () => {
    expect(parseLimit(String(MAX_LIMIT_USDC)).ok).toBe(true)
    expect(parseLimit(String(MAX_LIMIT_USDC + 1)).ok).toBe(false)
  })
})
