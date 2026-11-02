import { describe, expect, test } from 'bun:test'
import { addPaymentNotes } from '../../src/lib/onchainActivity'
import { bridgeOutFromLogs, CCTP_TOKEN_MESSENGER, DEPOSIT_FOR_BURN_TOPIC, domainName, recallBridgeCheck } from '../../src/lib/bridgeDetect'
import { describeTx } from '../../src/utils/txPresentation'
import type { TxRecord } from '../../src/types/index'

// The CCTP DepositForBurn log of a real bridge on Arc Mainnet: wallet 0x3343...1f32 sent 3.5428 USDC to a
// bridge contract, which burned 3.515525 USDC for Arbitrum (domain 3). Read with eth_getTransactionReceipt.
const HASH = '0x4e7f994ace60ddfdb9117e6ee3198dc9d4b7ca17024ad328984ce80d1232eeeb'
const BURN_LOG = {
  address: '0x28b5a0e9c621a5badaa536219b3a228c8168cf5d',
  topics: [
    '0x0c8c1cbdc5190613ebd485511d4e2812cfa45eecb79d845893331fedad5130a5',
    '0x0000000000000000000000003600000000000000000000000000000000000000',
    '0x000000000000000000000000a4072583658fae592a3506a42431cb6316a8d40b',
    '0x00000000000000000000000000000000000000000000000000000000000007d0',
  ],
  data: '0x000000000000000000000000000000000000000000000000000000000035a48500000000000000000000000033438c16bbe26703fee57a6f40fa374323cd1f32000000000000000000000000000000000000000000000000000000000000000300000000000000000000000028b5a0e9c621a5badaa536219b3a228c8168cf5d0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000e00000000000000000000000000000000000000000000000000000000000000000',
}
const ME = '0x33438C16bBE26703Fee57A6f40Fa374323cd1F32'
const BRIDGE_CONTRACT = '0xa4072583658fae592a3506a42431cb6316a8d40b'

const sent = (amount: string, hash = HASH): Omit<TxRecord, 'id'> & { kind: 'payment' } => ({
  txHash: hash, chainId: 5042, status: 'confirmed', direction: 'sent', amount, fromAddress: ME, toAddress: BRIDGE_CONTRACT, kind: 'payment', timestamp: 1, blockNumber: 29053447,
})
const clientWith = (logs: unknown[], status: 'success' | 'reverted' = 'success') =>
  ({ getTransactionReceipt: async () => ({ status, logs }) }) as never

describe('bridge out of Arc', () => {
  test('the burn event topic and address are the CCTP ones', () => {
    expect(DEPOSIT_FOR_BURN_TOPIC).toBe(BURN_LOG.topics[0])
    expect(CCTP_TOKEN_MESSENGER.toLowerCase()).toBe(BURN_LOG.address)
  })

  test('a real burn log decodes to the burned amount and destination', () => {
    const b = bridgeOutFromLogs([BURN_LOG])
    expect(b).toEqual({ amount: 3515525n, domain: 3 })
    expect(domainName(3)).toBe('Arbitrum')
    expect(domainName(26)).toBe('Arc')
    expect(domainName(99)).toBe('another chain')
  })

  test('other logs and other contracts are not burns', () => {
    expect(bridgeOutFromLogs([])).toBeNull()
    expect(bridgeOutFromLogs([{ ...BURN_LOG, address: '0x3600000000000000000000000000000000000000' }])).toBeNull()
    expect(bridgeOutFromLogs([{ ...BURN_LOG, data: '0x12' }])).toBeNull()
  })

  test('a payment to a bridge contract that burned in the same transaction becomes a bridge out', async () => {
    const r = sent('3.5428')
    const changed = await addPaymentNotes(clientWith([BURN_LOG]), '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54', [r])
    expect(changed).toHaveLength(1)
    expect(r.kind).toBe('bridge')
    expect(r.summary).toBe('3.5428 USDC sent to Arbitrum')
    expect(recallBridgeCheck(HASH)).toBe('3')
    const view = describeTx({ ...r, id: 'x' }, ME)
    expect(view.category).toBe('bridge')
    expect(view.title).toBe('Bridged out')
  })

  test('a burn larger than what the wallet sent is somebody else\'s and is ignored', async () => {
    const hash = '0x' + '12'.repeat(32)
    const r = sent('1', hash)
    await addPaymentNotes(clientWith([BURN_LOG]), null, [r])
    expect(r.kind).toBe('payment')
    expect(recallBridgeCheck(hash)).toBe('')
  })

  test('a plain payment stays a payment, and is checked only once', async () => {
    const hash = '0x' + '34'.repeat(32)
    let reads = 0
    const client = { getTransactionReceipt: async () => { reads++; return { status: 'success', logs: [] } } } as never
    const r = sent('5', hash)
    await addPaymentNotes(client, null, [r])
    await addPaymentNotes(client, null, [sent('5', hash)])
    expect(r.kind).toBe('payment')
    expect(reads).toBe(1)
  })

  test('a received payment is never turned into a bridge out', async () => {
    const hash = '0x' + '56'.repeat(32)
    const r = { ...sent('3.5428', hash), direction: 'received' as const }
    await addPaymentNotes(clientWith([BURN_LOG]), null, [r])
    expect(r.kind).toBe('payment')
  })
})
