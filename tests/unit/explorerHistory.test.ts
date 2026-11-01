import { describe, expect, test } from 'bun:test'
import { buildRecords, emptySeen, methodLabel, readItems, streamExplorerHistory, type Feed, type Page } from '../../src/lib/explorerHistory'

const ME = '0x180D51df0C75495303095DF858874fCCBe487c61'
const YOU = '0x2222222222222222222222222222222222222222'
const ROUTER = '0x6131B5fae19EA4f9D964eAc0408E4408b66337b5'
const USDC = '0x3600000000000000000000000000000000000000'
const ARGUS = '0xeCe5cA8bF0e0c1d1c7f0A3b7a1B2c3D4e5F60718'
const T0 = '2026-11-01T10:00:00.000000Z'

const tx = (hash: string, block: number, over: Record<string, unknown> = {}) => ({
  hash, block_number: block, timestamp: T0, from: { hash: ME }, to: { hash: YOU }, value: '0', status: 'ok', method: null, ...over,
})
const tt = (hash: string, block: number, from: string, to: string, token: string, symbol: string, decimals: number, value: string) => ({
  transaction_hash: hash, block_number: block, timestamp: T0, from: { hash: from }, to: { hash: to },
  token: { address_hash: token, symbol, decimals: String(decimals) }, total: { value, decimals: String(decimals) }, type: 'token_transfer',
})

function describe1(feeds: Partial<Record<Feed, Record<string, unknown>[]>>, above = 0) {
  const s = emptySeen()
  for (const [feed, items] of Object.entries(feeds)) readItems(s, feed as Feed, items as never)
  return buildRecords(ME, s, above, new Set())
}

describe('explorer history', () => {
  test('a native USDC send is a payment of the exact amount', () => {
    const [r] = describe1({ transactions: [tx('0xa1', 100, { value: '1500000000000000000' })] }) // 1.5 USDC, 18 decimals
    expect(r.kind).toBe('payment')
    expect(r.direction).toBe('sent')
    expect(r.amount).toBe('1.5')
    expect(r.toAddress).toBe(YOU)
  })

  test('a native receive shows as received', () => {
    const [r] = describe1({ transactions: [tx('0xa2', 101, { from: { hash: YOU }, to: { hash: ME }, value: '250000000000000000' })] })
    expect(r.direction).toBe('received')
    expect(r.amount).toBe('0.25')
  })

  test('the same USDC move seen as a coin transfer and a token transfer counts once', () => {
    const recs = describe1({
      transactions: [tx('0xa3', 102, { value: '1000000000000000000' })],
      'token-transfers': [tt('0xa3', 102, ME, YOU, USDC, 'USDC', 6, '1000000')],
    })
    expect(recs).toHaveLength(1)
    expect(recs[0].amount).toBe('1')
  })

  test('a swap into a token that is not on any list is still a swap', () => {
    const recs = describe1({
      transactions: [tx('0xa4', 103, { to: { hash: ROUTER }, method: 'swap' })],
      'token-transfers': [
        tt('0xa4', 103, ME, ROUTER, USDC, 'USDC', 6, '2000000'),
        tt('0xa4', 103, ROUTER, ME, ARGUS, 'ARGUS', 18, '400000000000000000000'),
      ],
    })
    expect(recs).toHaveLength(1)
    expect(recs[0].kind).toBe('swap')
    expect(recs[0].summary).toBe('2 USDC to 400 ARGUS')
  })

  test('swap proceeds paid out as native USDC (internal call) still count as the incoming leg', () => {
    const recs = describe1({
      transactions: [tx('0xa5', 104, { to: { hash: ROUTER }, method: 'swap' })],
      'token-transfers': [tt('0xa5', 104, ME, ROUTER, ARGUS, 'ARGUS', 18, '100000000000000000000')],
      'internal-transactions': [{ transaction_hash: '0xa5', block_number: 104, timestamp: T0, from: { hash: ROUTER }, to: { hash: ME }, value: '3000000000000000000', success: true }],
    })
    expect(recs).toHaveLength(1)
    expect(recs[0].kind).toBe('swap')
    expect(recs[0].summary).toBe('100 ARGUS to 3 USDC')
  })

  test('tokens minted to the wallet are a bridge arrival', () => {
    const [r] = describe1({ 'token-transfers': [tt('0xa6', 105, '0x0000000000000000000000000000000000000000', ME, USDC, 'USDC', 6, '5000000')] })
    expect(r.kind).toBe('bridge')
    expect(r.amount).toBe('5')
  })

  test('an approval that moves nothing is listed as "other" with its method name', () => {
    const [r] = describe1({ transactions: [tx('0xa7', 106, { method: 'approve', to: { hash: USDC } })] })
    expect(r.kind).toBe('other')
    expect(r.summary).toBe('Approval')
    expect(r.status).toBe('confirmed')
  })

  test('a failed call is kept and marked failed, and a failed send does not move money', () => {
    const recs = describe1({
      transactions: [
        tx('0xa8', 107, { status: 'error', method: 'swap', to: { hash: ROUTER } }),
        tx('0xa9', 108, { status: 'error', value: '1000000000000000000' }),
      ],
    })
    const byHash = Object.fromEntries(recs.map((r) => [r.txHash, r]))
    expect(byHash['0xa8'].status).toBe('failed')
    expect(byHash['0xa8'].kind).toBe('other')
    expect(byHash['0xa9'].status).toBe('failed')
    expect(byHash['0xa9'].kind).toBe('payment')
  })

  test('the memo of a payment made through a contract is kept', () => {
    const [r] = describe1({
      transactions: [tx('0xaa', 109, { to: { hash: '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54' }, method: 'pay', decoded_input: { method_call: 'pay(address,uint256,string)', parameters: [{ name: 'memo', value: 'Lunch' }] } })],
      'token-transfers': [tt('0xaa', 109, ME, YOU, USDC, 'USDC', 6, '1000000')],
    })
    expect(r.note).toBe('Lunch')
  })

  test('the system emitter log (18 decimals) is read as plain USDC', () => {
    const [r] = describe1({ 'token-transfers': [tt('0xab', 110, YOU, ME, '0xffffFFFfFFffffffffffffffFfFFFfffFFFfFFfE', 'USDC', 18, '2000000000000000000')] })
    expect(r.amount).toBe('2')
    expect(r.direction).toBe('received')
  })

  test('method names read well', () => {
    expect(methodLabel('approve')).toBe('Approval')
    expect(methodLabel('')).toBe('Contract interaction')
    expect(methodLabel('executeBatch(bytes[])')).toBe('Execute batch')
  })
})

describe('streaming', () => {
  // Three feeds with different depths; the stream must wait for all of them before describing a block.
  function fakeFetcher(data: Record<Feed, Record<string, unknown>[][]>) {
    return async (feed: Feed, _a: string, cursor: Record<string, string> | null): Promise<Page> => {
      const i = cursor ? Number(cursor.p) : 0
      const items = (data[feed][i] ?? []) as never
      return { items, next: data[feed][i + 1] ? { p: String(i + 1) } : null }
    }
  }

  test('a swap whose legs arrive on different pages is described once, as a swap', async () => {
    const swapTx = tx('0xb1', 200, { to: { hash: ROUTER }, method: 'swap' })
    const data = {
      transactions: [[tx('0xb2', 210, { value: '1000000000000000000' }), swapTx], [tx('0xb0', 150, { value: '1000000000000000000' })]],
      'token-transfers': [[tt('0xb1', 200, ME, ROUTER, USDC, 'USDC', 6, '1000000')], [tt('0xb1', 199, ROUTER, ME, ARGUS, 'ARGUS', 18, '9000000000000000000')]],
      'internal-transactions': [[]],
    }
    // Make the token-transfers leg of the swap arrive on page 2 (same block, lower index).
    data['token-transfers'] = [[tt('0xb1', 200, ME, ROUTER, USDC, 'USDC', 6, '1000000')], [tt('0xb1', 200, ROUTER, ME, ARGUS, 'ARGUS', 18, '9000000000000000000')]]
    const got: string[] = []
    const res = await streamExplorerHistory(ME, { fetchPage: fakeFetcher(data), onRecords: (r) => got.push(...r.map((x) => `${x.txHash}:${x.kind}`)) })
    expect(res.complete).toBe(true)
    expect(got.filter((g) => g.startsWith('0xb1'))).toEqual(['0xb1:swap'])
    expect(got.sort()).toEqual(['0xb0:payment', '0xb1:swap', '0xb2:payment'])
  })

  test('an empty wallet completes with nothing', async () => {
    const res = await streamExplorerHistory(ME, { fetchPage: async () => ({ items: [], next: null }), onRecords: () => { throw new Error('no records expected') } })
    expect(res.complete).toBe(true)
    expect(res.count).toBe(0)
  })

  test('an unreachable explorer is an error, not an empty history', async () => {
    await expect(streamExplorerHistory(ME, { fetchPage: async () => { throw new Error('down') }, onRecords: () => undefined })).rejects.toThrow('down')
  })
})
