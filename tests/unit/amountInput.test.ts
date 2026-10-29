import { describe, expect, test } from 'bun:test'
import { cleanAmountInput } from '../../src/components/swap/SwapPanel'

describe('cleanAmountInput', () => {
  test('accepts normal amounts', () => {
    expect(cleanAmountInput('12.5', 6)).toBe('12.5')
    expect(cleanAmountInput('0', 6)).toBe('0')
    expect(cleanAmountInput('5.', 6)).toBe('5.')
    expect(cleanAmountInput('', 6)).toBe('')
  })
  test('turns a comma into a dot and adds a leading zero', () => {
    expect(cleanAmountInput('1,5', 6)).toBe('1.5')
    expect(cleanAmountInput('.5', 6)).toBe('0.5')
  })
  test('rejects letters, a second dot and too many decimals', () => {
    expect(cleanAmountInput('1a', 6)).toBeNull()
    expect(cleanAmountInput('1.2.3', 6)).toBeNull()
    expect(cleanAmountInput('1.1234567', 6)).toBeNull()
    expect(cleanAmountInput('-1', 6)).toBeNull()
  })
  test('trims leading zeros', () => {
    expect(cleanAmountInput('007', 6)).toBe('7')
    expect(cleanAmountInput('00', 6)).toBe('0')
  })
})
