import { describe, expect, test } from 'bun:test'
import { classifyActivity, type TransferLog } from '../../src/lib/onchainActivity'
import { parseMemo, tagMemo } from '../../src/utils/memoTags'
import { buildRecords, emptySeen, readItems } from '../../src/lib/explorerHistory'
import { CANCEL_AFTER_MS, reconcileStoredTxHistory } from '../../src/hooks/useTxHistory'
import { appStore } from '../../src/store/appStore'
import type { TxRecord } from '../../src/types/index'

const ME = '0x180D51df0C75495303095DF858874fCCBe487c61'
const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const C = '0x3333333333333333333333333333333333333333'
const USDC = '0x3600000000000000000000000000000000000000'
const TOKENS = [{ symbol: 'USDC', address: USDC, decimals: 6 }]
const t = (hash: string, from: string, to: string, value: bigint): TransferLog => ({ txHash: hash, blockNumber: 10n, token: USDC, from, to, value })

describe('memo tags', () => {
  test('round trip', () => {
    expect(tagMemo('split', 'Dinner')).toBe('[split] Dinner')
    expect(tagMemo('request', '')).toBe('[request]')
    expect(tagMemo(undefined, ' hi ')).toBe('hi')
    expect(parseMemo('[split] Dinner')).toEqual({ kind: 'split', note: 'Dinner' })
    expect(parseMemo('[Request]')).toEqual({ kind: 'request', note: undefined })
    expect(parseMemo('Lunch')).toEqual({ note: 'Lunch' })
    expect(parseMemo('[unknown] x')).toEqual({ note: '[unknown] x' })
    expect(parseMemo(undefined)).toEqual({})
  })
})

describe('batch payments are recognised onchain', () => {
  test('one transaction paying three people is one batch of 3 recipients', () => {
    const [r] = classifyActivity(ME, [t('0xb', ME, A, 1_000_000n), t('0xb', ME, B, 2_000_000n), t('0xb', ME, C, 500_000n)], [], TOKENS, 5042)
    expect(r.kind).toBe('batch')
    expect(r.amount).toBe('3.5')
    expect(r.summary).toBe('3 recipients')
    expect(r.toAddress).toBe(B)
  })
  test('one recipient is a plain send', () => {
    const [r] = classifyActivity(ME, [t('0xc', ME, A, 1_000_000n)], [], TOKENS, 5042)
    expect(r.kind).toBe('payment')
  })
  test('the receiving side of a batch sees one received payment', () => {
    const [r] = classifyActivity(A, [t('0xb', ME, A, 1_000_000n), t('0xb', ME, B, 2_000_000n)], [], TOKENS, 5042)
    expect(r.kind).toBe('payment')
    expect(r.direction).toBe('received')
  })
})

describe('memo tags from the explorer', () => {
  test('a tagged contract payment is a split, with the typed note kept', () => {
    const s = emptySeen()
    readItems(s, 'transactions', [{ hash: '0xd', block_number: 5, timestamp: '2026-11-01T10:00:00Z', from: { hash: ME }, to: { hash: '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54' }, value: '0', status: 'ok', method: 'pay', decoded_input: { parameters: [{ name: 'memo', value: '[split] Dinner' }] } }])
    readItems(s, 'token-transfers', [{ transaction_hash: '0xd', block_number: 5, timestamp: '2026-11-01T10:00:00Z', from: { hash: ME }, to: { hash: A }, token: { address_hash: USDC, symbol: 'USDC', decimals: '6' }, total: { value: '1000000', decimals: '6' } }])
    const [r] = buildRecords(ME, s, 0, new Set())
    expect(r.kind).toBe('split')
    expect(r.note).toBe('Dinner')
  })
})

describe('cancelled payments', () => {
  const base: TxRecord = { id: 'x', txHash: '0xdead', chainId: 5042, direction: 'sent', amount: '1', fromAddress: ME, toAddress: A, status: 'pending', timestamp: Date.now() - CANCEL_AFTER_MS - 60_000 }
  const notFound = () => { const e = new Error('Transaction could not be found.'); e.name = 'TransactionNotFoundError'; throw e }
  const receiptMissing = () => { const e = new Error('Transaction receipt could not be found.'); e.name = 'TransactionReceiptNotFoundError'; throw e }

  // Records which updates the reconciler asks the store for, without touching real saved data.
  async function run(client: Parameters<typeof reconcileStoredTxHistory>[0], list: TxRecord[]) {
    const updates: { hash: string; status?: string }[] = []
    const original = appStore.updateTxRecord
    appStore.updateTxRecord = ((hash: string, u: Partial<TxRecord>) => { updates.push({ hash, status: u.status }) }) as typeof appStore.updateTxRecord
    try { await reconcileStoredTxHistory(client, list) } finally { appStore.updateTxRecord = original }
    return updates
  }

  test('a payment the network never saw, after a long wait, is cancelled', async () => {
    const u = await run({ getTransactionReceipt: async () => receiptMissing(), getTransaction: async () => notFound() }, [base])
    expect(u).toEqual([{ hash: '0xdead', status: 'cancelled' }])
  })

  test('a recent one, or an RPC hiccup, stays pending', async () => {
    const recent = { ...base, txHash: '0xbeef', timestamp: Date.now() }
    expect(await run({ getTransactionReceipt: async () => receiptMissing(), getTransaction: async () => notFound() }, [recent])).toEqual([])
    expect(await run({ getTransactionReceipt: async () => { throw new Error('network down') } }, [base])).toEqual([])
  })

  test('processing bridges and other-chain records are left alone', async () => {
    let calls = 0
    await run({ getTransactionReceipt: async () => { calls++; return receiptMissing() } }, [{ ...base, status: 'processing' }, { ...base, chainId: 1 }])
    expect(calls).toBe(0)
  })
})
