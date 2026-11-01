import { describe, expect, test } from 'bun:test'
import { describeTx } from '../../src/utils/txPresentation'
import { buildEntries, countByFilter } from '../../src/components/activity/entries'
import { buildRequestPath, parsePayPrefill } from '../../src/utils/payRequests'
import type { TxRecord } from '../../src/types/index'

const ME = '0x1111111111111111111111111111111111111111'
const YOU = '0x2222222222222222222222222222222222222222'
const base = { chainId: 5042, amount: '1', status: 'confirmed' as const, timestamp: 1_000 }
const tx = (n: number, over: Partial<TxRecord>): TxRecord => ({
  id: `t${n}`, txHash: `0x${n}`, direction: 'sent', fromAddress: ME, toAddress: YOU, ...base, timestamp: 1_000 + n, ...over,
})

describe('transaction categories', () => {
  test('every kind lands in its own category', () => {
    const cases: [Partial<TxRecord>, string][] = [
      [{}, 'send'],
      [{ fromAddress: YOU, toAddress: ME, direction: 'received' }, 'receive'],
      [{ kind: 'swap', summary: '1 USDC to 0.9 EURC' }, 'swap'],
      [{ kind: 'bridge', summary: '1 USDC' }, 'bridge'],
      [{ kind: 'batch' }, 'batch'],
      [{ kind: 'request' }, 'request'],
      [{ kind: 'split' }, 'split'],
      [{ kind: 'schedule' }, 'schedule'],
    ]
    for (const [over, category] of cases) expect(describeTx(tx(1, over), ME).category).toBe(category)
  })

  test('old batch rows are recognised by their note, and the note is not repeated', () => {
    const v = describeTx(tx(1, { note: 'Batch transfer' }), ME)
    expect(v.category).toBe('batch')
    expect(v.detail).not.toContain('Batch transfer')
  })

  test('a received payment is never labelled as one of your own tools', () => {
    expect(describeTx(tx(1, { kind: 'request', fromAddress: YOU, toAddress: ME, direction: 'received' }), ME).category).toBe('receive')
  })

  test('counts add up to the total', () => {
    const list = [tx(1, {}), tx(2, { kind: 'batch' }), tx(3, { kind: 'batch' }), tx(4, { kind: 'swap' }), tx(5, { kind: 'split' })]
    const entries = buildEntries({ address: ME, txHistory: list, posts: [], comments: [], notifications: [] })
    const c = countByFilter(entries)
    expect(c.all).toBe(5)
    expect(c.send).toBe(1)
    expect(c.batch).toBe(2)
    expect(c.swap).toBe(1)
    expect(c.split).toBe(1)
  })
})

describe('split links', () => {
  test('a split link carries its type; a request link does not', () => {
    expect(parsePayPrefill(buildRequestPath(ME, '5', 'Dinner', undefined, 'split').slice(1)).via).toBe('split')
    expect(parsePayPrefill(buildRequestPath(ME, '5').slice(1)).via).toBe(undefined)
  })
})
