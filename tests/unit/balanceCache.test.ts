import { beforeEach, describe, expect, test } from 'bun:test'

// Minimal browser storage for the test.
const store = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, v) },
    removeItem: (k: string) => { store.delete(k) },
  },
}

const { readBalance, saveBalance } = await import('../../src/lib/balanceCache')
const A = '0x180D51df0C75495303095DF858874fCCBe487c61'

describe('balance cache', () => {
  beforeEach(() => store.clear())

  test('returns nothing when no balance was saved (never a fake zero)', () => {
    expect(readBalance(A)).toBeUndefined()
    expect(readBalance(undefined)).toBeUndefined()
  })

  test('remembers a balance exactly, whatever the address casing', () => {
    saveBalance(A, 123_456_789_012_345_678n)
    expect(readBalance(A.toLowerCase())).toBe(123_456_789_012_345_678n)
  })

  test('a saved zero is a real zero, and bad data is ignored', () => {
    saveBalance(A, 0n)
    expect(readBalance(A)).toBe(0n)
    store.set(`socialpay:balance:v1:${A.toLowerCase()}`, '{"raw":"-5"}')
    expect(readBalance(A)).toBeUndefined()
    store.set(`socialpay:balance:v1:${A.toLowerCase()}`, 'not json')
    expect(readBalance(A)).toBeUndefined()
  })
})
