import { describe, expect, test } from 'bun:test'

const store = new Map<string, string>()
;(globalThis as unknown as { window: unknown }).window = {
  localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) }, removeItem: (k: string) => { store.delete(k) } },
  addEventListener: () => {},
}
;(globalThis as unknown as { localStorage: unknown }).localStorage = (globalThis as unknown as { window: { localStorage: unknown } }).window.localStorage

const { appStore } = await import('../../src/store/appStore')

const ME = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const chain = (hash: string, over: Record<string, unknown> = {}) => ({
  txHash: hash, chainId: 5042, direction: 'sent' as const, amount: '5', fromAddress: ME, toAddress: OTHER,
  status: 'confirmed' as const, timestamp: 2_000_000, blockNumber: 99, ...over,
})

describe('syncChainRecords', () => {
  test('adds records the browser does not know yet, newest first', () => {
    const n = appStore.syncChainRecords([chain('0xaaa', { timestamp: 1000 }), chain('0xbbb', { timestamp: 3000 })])
    expect(n).toBe(2)
    const hist = appStore.getState().txHistory
    expect(hist[0].txHash).toBe('0xbbb')
  })

  test('a pending send is corrected to the exact chain details but keeps its memo', () => {
    appStore.createPendingTxRecord({ txHash: '0xccc', chainId: 5042, direction: 'sent', amount: '5.0', fromAddress: ME, toAddress: OTHER, note: 'lunch', timestamp: 111 })
    const n = appStore.syncChainRecords([chain('0xCCC', { amount: '5', timestamp: 2_500_000, blockNumber: 1234 })])
    expect(n).toBe(1)
    const rec = appStore.getState().txHistory.find((t) => t.txHash.toLowerCase() === '0xccc')!
    expect(rec.status).toBe('confirmed')
    expect(rec.amount).toBe('5')
    expect(rec.timestamp).toBe(2_500_000)
    expect(rec.blockNumber).toBe(1234)
    expect(rec.note).toBe('lunch')
    expect(appStore.getState().txHistory.filter((t) => t.txHash.toLowerCase() === '0xccc')).toHaveLength(1)
  })

  test('syncing the same records again changes nothing', () => {
    expect(appStore.syncChainRecords([chain('0xaaa', { timestamp: 1000 }), chain('0xbbb', { timestamp: 3000 })])).toBe(0)
  })
})
