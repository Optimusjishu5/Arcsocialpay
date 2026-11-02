import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { SOCIAL_PAY_ABI, SOCIAL_PAY_DEPLOYED_ADDRESS } from '../../src/contracts/arcSocialPay'
import { decodeSocialPayLog, decodeSocialPayLogs, involves, isSocialPayAddress } from '../../src/lib/socialPayEvents'

// Logs the live ArcSocialPay contract emitted on Arc Mainnet, read from the chain with eth_getTransactionReceipt.
const LOG_A = {
  address: '0x3b61fc789342b02ae9da3bcece910afaad40bf54',
  topics: [
    '0xd8b698ac671a4f14720b5e36de4daa40f05f109182b33b75e09276a122bb6532',
    '0x000000000000000000000000180d51df0c75495303095df858874fccbe487c61',
    '0x000000000000000000000000ff69c7bcd38ca45d804c285b551c4988fb74463f',
  ],
  data: '0x0000000000000000000000000000000000000000000000000000000000002af800000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000',
  logIndex: 8,
  blockNumber: 29048706,
  transactionHash: '0x1f7b4ef06be7fd99e3d0b4c99b127ccd1d6530bb62be7bcc6d89eda44cf188e4',
}
const LOG_B = {
  address: '0x3b61fc789342b02ae9da3bcece910afaad40bf54',
  topics: [
    '0xd8b698ac671a4f14720b5e36de4daa40f05f109182b33b75e09276a122bb6532',
    '0x000000000000000000000000ff69c7bcd38ca45d804c285b551c4988fb74463f',
    '0x000000000000000000000000180d51df0c75495303095df858874fccbe487c61',
  ],
  data: '0x0000000000000000000000000000000000000000000000000000000000004e2000000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000000',
  logIndex: 2,
  blockNumber: 28610911,
  transactionHash: '0x38bad2eb78546c586541e04399fa44fe3c407c1964f38c126d68715d9aab96ea',
}
const ME = '0x180D51df0C75495303095DF858874fCCBe487c61'

describe('SocialPay event decoding', () => {
  test('a real Payment log decodes to sender, recipient and a 6-decimal USDC amount', () => {
    const e = decodeSocialPayLog(LOG_A)
    expect(e).not.toBeNull()
    expect(e?.name).toBe('Payment')
    expect(e?.sender).toBe(ME)
    expect(e?.recipient).toBe('0xff69c7Bcd38cA45D804c285b551C4988fB74463f')
    expect(e?.args.amount).toBe('11000')
    expect(e?.amountUsdc).toBe('0.011')
    expect(e?.note).toBe('')
    expect(e?.blockNumber).toBe(29048706)
    expect(e?.logIndex).toBe(8)
    expect(e?.txHash).toBe(LOG_A.transactionHash)
  })

  test('a second real log decodes and the wallet is matched as sender or recipient', () => {
    const e = decodeSocialPayLog(LOG_B)
    expect(e?.amountUsdc).toBe('0.02')
    expect(involves(e!, ME)).toBe(true)
    expect(involves(e!, '0x2222222222222222222222222222222222222222')).toBe(false)
  })

  test('a log from another contract is never read as a SocialPay event', () => {
    expect(isSocialPayAddress(SOCIAL_PAY_DEPLOYED_ADDRESS)).toBe(true)
    expect(decodeSocialPayLog({ ...LOG_A, address: '0x3600000000000000000000000000000000000000' })).toBeNull()
  })

  test('a log that does not match the ABI decodes to null instead of guessed values', () => {
    expect(decodeSocialPayLog({ ...LOG_A, topics: ['0x' + '11'.repeat(32)] })).toBeNull()
    expect(decodeSocialPayLog({ ...LOG_A, data: '0x1234' })).toBeNull()
    expect(decodeSocialPayLogs([LOG_A, { ...LOG_B, data: '0x' }]).map((e) => e.name)).toEqual(['Payment'])
  })
})

describe('SocialPay ABI', () => {
  // The Foundry artifact exists after `forge build`. When it does, the TypeScript ABI must match it exactly.
  const artifact = 'contracts/out/ArcSocialPay.sol/ArcSocialPay.json'
  const norm = (abi: { type: string; name?: string; stateMutability?: string; inputs?: { type: string; indexed?: boolean }[]; outputs?: { type: string }[] }[]) =>
    abi
      .filter((i) => i.type === 'event' || i.type === 'function')
      .map((i) => `${i.type} ${i.name}(${(i.inputs ?? []).map((x) => x.type + (x.indexed ? ' indexed' : '')).join(',')}) ${i.stateMutability ?? ''} ${(i.outputs ?? []).map((x) => x.type).join(',')}`)
      .sort()

  test.skipIf(!existsSync(artifact))('matches the compiled contract', () => {
    const compiled = JSON.parse(readFileSync(artifact, 'utf8')).abi
    expect(norm(SOCIAL_PAY_ABI as never)).toEqual(norm(compiled))
  })
})
