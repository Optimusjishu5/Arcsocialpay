/**
 * Arc Mainnet chain definition (single source of truth for frontend).
 *
 * Network: Arc Mainnet
 * Chain ID: 5042
 * RPC: https://rpc.mainnet.arc.io
 * Explorer: https://explorer.arc.io
 * Native gas token: USDC (18 decimals, gas view) — ERC-20 USDC is 6 decimals.
 */
import { defineChain } from 'viem'

export const ARC_CHAIN_ID = 5042

export const ARC_RPC_URL =
  process.env.NEXT_PUBLIC_ARC_RPC?.trim() || 'https://rpc.mainnet.arc.io'

export const ARC_EXPLORER_URL = 'https://explorer.arc.io'

export const arcMainnet = defineChain({
  id: ARC_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: { http: [ARC_RPC_URL] },
    public: { http: [ARC_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_EXPLORER_URL },
  },
})
