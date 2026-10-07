/**
 * wagmi configuration — Arc Mainnet only.
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { injected } from 'wagmi/connectors'
import { arcMainnet, ARC_CHAIN_ID, ARC_RPC_URL } from './chains'
import { registerChain } from './tracing'
import { NEXT_PUBLIC_ARC_RPC } from './env'

// Env-driven RPC: NEXT_PUBLIC_ARC_RPC override falls back to Arc Mainnet default.
const arcRpc = NEXT_PUBLIC_ARC_RPC ?? ARC_RPC_URL
if (!arcRpc.startsWith('https://')) {
  throw new Error(`[config] Arc Mainnet RPC must use https://, got "${arcRpc}"`)
}

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(ARC_CHAIN_ID, arcRpc)

export const config = createConfig({
  // Arc Mainnet only — all app transactions are on Arc (Chain ID 5042).
  chains: [arcMainnet],
  connectors: [injected()],
  transports: {
    [arcMainnet.id]: http(arcRpc, { batch: true, retryCount: 2, timeout: 10_000 }),
  },
})
