// Uniswap v3 on Arc Mainnet (chain 5042). Addresses come from Uniswap's
// published Arc deployment (@uniswap/sdk-core ARC_ADDRESSES) and were checked
// against live bytecode on Arc before use. Quotes and swaps go straight to the
// contracts, so no API key is needed.

import { encodeFunctionData, parseAbi, type PublicClient } from 'viem'

export const UNISWAP_ARC = {
  factory: '0xf0db7b58379503491d857dB50AC9ece64c653918',
  quoter: '0x7dfd4f31be6814d2906bde155c3e1b146eac1468',
  swapRouter02: '0x53bf6b0684ec7ef91e1387da3d1a1769bc5a6f77',
} as const

export interface UniToken { symbol: string; address: `0x${string}`; decimals: number }

export const UNI_TOKENS: UniToken[] = [
  { symbol: 'USDC', address: '0x3600000000000000000000000000000000000000', decimals: 6 },
  { symbol: 'EURC', address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1', decimals: 6 },
  { symbol: 'cirBTC', address: '0x171a4217b86a807a64eb94757db6849fb4bdbaa0', decimals: 8 },
]

export const FEE_TIERS = [100, 500, 3000, 10000] as const
export const feeLabel = (fee: number) => `${fee / 10000}%`

export const quoterAbi = parseAbi([
  'function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)',
])

export const routerAbi = parseAbi([
  'function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)',
  'function multicall(uint256 deadline, bytes[] data) payable returns (bytes[] results)',
])

export interface UniQuote { fee: number; amountOut: bigint; tokenIn: UniToken; tokenOut: UniToken; amountIn: bigint }

/** Best output across the four fee tiers; null when no pool can fill the amount. */
export async function quoteUniswap(
  client: PublicClient, tokenIn: UniToken, tokenOut: UniToken, amountIn: bigint,
): Promise<UniQuote | null> {
  const results = await Promise.allSettled(
    FEE_TIERS.map(async (fee) => {
      const { result } = await client.simulateContract({
        address: UNISWAP_ARC.quoter, abi: quoterAbi, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: tokenIn.address, tokenOut: tokenOut.address, amountIn, fee, sqrtPriceLimitX96: 0n }],
      })
      return { fee, amountOut: result[0] }
    }),
  )
  let best: { fee: number; amountOut: bigint } | null = null
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.amountOut > 0n && (!best || r.value.amountOut > best.amountOut)) best = r.value
  }
  return best ? { ...best, tokenIn, tokenOut, amountIn } : null
}

/** Exact minimum output for a slippage tolerance in basis points. */
export const minOut = (amountOut: bigint, slippageBps: number): bigint =>
  (amountOut * BigInt(10_000 - slippageBps)) / 10_000n

/** Router call data: exactInputSingle wrapped in multicall so the swap expires. */
export function buildSwapCall(q: UniQuote, recipient: `0x${string}`, slippageBps: number, deadline: bigint) {
  const inner = encodeFunctionData({
    abi: routerAbi, functionName: 'exactInputSingle',
    args: [{
      tokenIn: q.tokenIn.address, tokenOut: q.tokenOut.address, fee: q.fee, recipient,
      amountIn: q.amountIn, amountOutMinimum: minOut(q.amountOut, slippageBps), sqrtPriceLimitX96: 0n,
    }],
  })
  return { address: UNISWAP_ARC.swapRouter02, abi: routerAbi, functionName: 'multicall' as const, args: [deadline, [inner]] as const }
}
