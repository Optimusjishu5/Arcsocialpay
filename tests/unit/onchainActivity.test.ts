import { describe, expect, test } from 'bun:test'
import { classifyActivity, type PayLog, type TransferLog } from '../../src/lib/onchainActivity'
import { UNI_TOKENS } from '../../src/lib/uniswapArc'

const ME = '0x1111111111111111111111111111111111111111'
const OTHER = '0x2222222222222222222222222222222222222222'
const POOL = '0x3333333333333333333333333333333333333333'
const ZERO = '0x0000000000000000000000000000000000000000'
const USDC = UNI_TOKENS[0].address.toLowerCase()
const EURC = UNI_TOKENS[1].address.toLowerCase()

const t = (txHash: string, token: string, from: string, to: string, value: bigint, blockNumber = 100): TransferLog => ({
  txHash, blockNumber: BigInt(blockNumber), token, from, to, value,
})

describe('classifyActivity', () => {
  test('a plain USDC transfer is a payment sent or received', () => {
    const out = classifyActivity(ME, [t('0xa', USDC, ME, OTHER, 5_000_000n), t('0xb', USDC, OTHER, ME, 2_500_000n)], [], UNI_TOKENS, 5042)
    const sent = out.find((r) => r.txHash === '0xa')!
    const got = out.find((r) => r.txHash === '0xb')!
    expect(sent.direction).toBe('sent')
    expect(sent.amount).toBe('5')
    expect(sent.toAddress.toLowerCase()).toBe(OTHER)
    expect(got.direction).toBe('received')
    expect(got.amount).toBe('2.5')
    expect(out.every((r) => r.status === 'confirmed')).toBe(true)
  })

  test('paying through the contract carries the memo', () => {
    const pay: PayLog = { txHash: '0xc', blockNumber: 101n, sender: ME, recipient: OTHER, amount: 1_000_000n, text: 'lunch', kind: 'payment' }
    const out = classifyActivity(ME, [t('0xc', USDC, ME, OTHER, 1_000_000n, 101)], [pay], UNI_TOKENS, 5042)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('payment')
    expect(out[0].note).toBe('lunch')
  })

  test('sending one token and getting another back in one transaction is a swap', () => {
    const out = classifyActivity(ME, [
      t('0xd', USDC, ME, POOL, 10_000_000n),
      t('0xd', EURC, POOL, ME, 8_970_000n),
    ], [], UNI_TOKENS, 5042)
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('swap')
    expect(out[0].summary).toContain('USDC')
    expect(out[0].summary).toContain('EURC')
    expect(out[0].symbol).toBe('USDC')
  })

  test('tokens minted from the zero address are a bridge arrival', () => {
    const out = classifyActivity(ME, [t('0xe', USDC, ZERO, ME, 20_000_000n)], [], UNI_TOKENS, 5042)
    expect(out[0].kind).toBe('bridge')
    expect(out[0].direction).toBe('received')
  })

  test('sending to yourself is ignored', () => {
    expect(classifyActivity(ME, [t('0xf', USDC, ME, ME, 1n)], [], UNI_TOKENS, 5042)).toHaveLength(0)
  })

  test('other tokens keep their own symbol and decimals', () => {
    const btc = UNI_TOKENS[2]
    const out = classifyActivity(ME, [t('0x10', btc.address.toLowerCase(), OTHER, ME, 150_000n)], [], UNI_TOKENS, 5042)
    expect(out[0].symbol).toBe('cirBTC')
    expect(out[0].amount).toBe('0.0015')
  })
})

import { FAST_WINDOW, SCAN_WINDOW, SYSTEM_EMITTER, logSources, planWindows, toTransferLog } from '../../src/lib/onchainActivity'

const topic = (a: string) => `0x${a.slice(2).toLowerCase().padStart(64, '0')}`
const TRANSFER = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

describe('native USDC (system emitter) logs', () => {
  test('a plain native send becomes a 6-decimal USDC payment', () => {
    // 2.5 USDC in the 18-decimal native unit
    const log = toTransferLog({
      address: SYSTEM_EMITTER, topics: [TRANSFER, topic(ME), topic(OTHER)],
      data: `0x${(2_500_000_000_000_000_000n).toString(16)}`, blockNumber: '0x64', transactionHash: '0xnative',
    })!
    expect(log.token.toLowerCase()).toBe(USDC)
    expect(log.value).toBe(2_500_000n)
    const out = classifyActivity(ME, [log], [], UNI_TOKENS, 5042)
    expect(out).toHaveLength(1)
    expect(out[0].amount).toBe('2.5')
    expect(out[0].direction).toBe('sent')
  })

  test('dust below one millionth and empty logs are dropped', () => {
    expect(toTransferLog({ address: SYSTEM_EMITTER, topics: [TRANSFER, topic(ME), topic(OTHER)], data: '0x1', blockNumber: '0x1', transactionHash: '0xa' })).toBeNull()
    expect(toTransferLog({ address: SYSTEM_EMITTER, topics: [TRANSFER], data: '0x1', blockNumber: '0x1', transactionHash: '0xa' })).toBeNull()
  })

  test('other tokens are read from their own contract; USDC only from the system emitter', () => {
    const sources = logSources(UNI_TOKENS).map((a) => a.toLowerCase())
    expect(sources).toContain(SYSTEM_EMITTER.toLowerCase())
    expect(sources).not.toContain(USDC) // its ERC-20 log duplicates the system log
    expect(sources).toContain(EURC)
  })
})

describe('planWindows', () => {
  test('covers the range exactly once, newest first, with no gaps or overlaps', () => {
    const w = planWindows(1_000n, 1_000_000n, 600_000n)
    expect(w[0].hi).toBe(1_000_000n)
    expect(w[w.length - 1].lo).toBe(1_000n)
    for (let i = 1; i < w.length; i++) expect(w[i].hi).toBe(w[i - 1].lo - 1n)
    expect(w.filter((x) => x.fast).every((x) => x.lo >= 600_000n && x.hi - x.lo + 1n <= BigInt(FAST_WINDOW))).toBe(true)
    expect(w.filter((x) => !x.fast).every((x) => x.hi < 600_000n && x.hi - x.lo + 1n <= BigInt(SCAN_WINDOW))).toBe(true)
  })

  test('without a fast RPC every window is small', () => {
    const w = planWindows(0n, 50_000n, null)
    expect(w.every((x) => !x.fast && x.hi - x.lo + 1n <= BigInt(SCAN_WINDOW))).toBe(true)
    expect(w[w.length - 1].lo).toBe(0n)
  })

  test('a single block works', () => {
    expect(planWindows(5n, 5n, null)).toEqual([{ lo: 5n, hi: 5n, fast: false }])
  })
})
