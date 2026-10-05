/**
 * wagmi configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { registerChain } from './tracing'
import { VITE_ARC_TESTNET_RPC } from './env'

// Env-driven RPC: VITE_ARC_TESTNET_RPC override falls back to viem's chain default.
// src/env.ts already validated https://; re-check here in case the default ever changes.
const defaultArcRpc = arcTestnet.rpcUrls.default.http[0]
const arcRpc = VITE_ARC_TESTNET_RPC ?? defaultArcRpc
if (!arcRpc.startsWith('https://')) {
  throw new Error(`[config] Arc Testnet RPC must use https://, got "${arcRpc}"`)
}

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcRpc)

export const config = createConfig({
  // mainnet is kept only for ENS resolution; all app transactions are on Arc Testnet.
  chains: [arcTestnet, mainnet], // mainnet needed for ENS resolution
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: http(arcRpc, { batch: true, retryCount: 2, timeout: 10_000 }),
    [mainnet.id]: http(), // ENS resolution uses mainnet
  },
})
