import { describe, expect, test } from 'bun:test'
import { encodeFunctionData, erc20Abi } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { CHAT_DOMAIN, CHAT_TYPES, chatTypedMessage, verifyChatSignature } from '../../src/lib/chatAuth'
import { validateRouteTxs, type RouteQuote, type RouteRequest } from '../../src/lib/routeProviders'
import { minOut } from '../../src/lib/uniswapArc'

// Throwaway key used only inside this test file.
const account = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d')
const other = '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54'

describe('signed chat messages', () => {
  const fields = { id: 'm1', conversationId: 'c1', sender: account.address, content: 'hello', createdAt: 1_700_000_000_000 }

  async function sign(f: typeof fields) {
    return account.signTypedData({ domain: CHAT_DOMAIN, types: CHAT_TYPES, primaryType: 'ChatMessage', message: chatTypedMessage(f) })
  }

  test('accepts the sender signature', async () => {
    expect(await verifyChatSignature(fields, await sign(fields))).toBe(true)
  })

  test('rejects edited content, another sender, or a different message id', async () => {
    const sig = await sign(fields)
    expect(await verifyChatSignature({ ...fields, content: 'tampered' }, sig)).toBe(false)
    expect(await verifyChatSignature({ ...fields, sender: other }, sig)).toBe(false)
    expect(await verifyChatSignature({ ...fields, id: 'm2' }, sig)).toBe(false)
  })
})

describe('bridge route safety checks', () => {
  const token = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const
  const req = {
    fromChainId: 8453, toChainId: 5042, fromToken: token, toToken: '0x3600000000000000000000000000000000000000',
    amountRaw: 5_000_000n, user: account.address, recipient: account.address,
  } as RouteRequest
  const approve = (amount: bigint) => encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [other, amount] })
  const quote = (txs: RouteQuote['txs']): RouteQuote => ({
    provider: 'Relay', amountOut: 1n, txs, status: { provider: 'Relay' }, fetchedAt: 0,
  })

  test('passes an exact approval on the right chain', () => {
    const q = quote([{ label: 'Approve USDC', chainId: 8453, to: token, data: approve(5_000_000n), value: 0n, approval: true }])
    expect(validateRouteTxs(q, req)).toBeNull()
  })

  test('refuses oversized approvals, wrong tokens and wrong chains', () => {
    const base = { label: 'Approve USDC', value: 0n, approval: true as const }
    expect(validateRouteTxs(quote([{ ...base, chainId: 8453, to: token, data: approve(2n ** 255n) }]), req)).toContain('above the amount')
    expect(validateRouteTxs(quote([{ ...base, chainId: 8453, to: other, data: approve(1n) }]), req)).toContain('unexpected token')
    expect(validateRouteTxs(quote([{ ...base, chainId: 1, to: token, data: approve(1n) }]), req)).toContain('wrong chain')
  })
})

describe('uniswap slippage math', () => {
  test('minimum output is exact', () => {
    expect(minOut(1_000_000n, 50)).toBe(995_000n)
    expect(minOut(1_000_000n, 500)).toBe(950_000n)
    expect(minOut(999n, 10)).toBe(998n)
  })
})
