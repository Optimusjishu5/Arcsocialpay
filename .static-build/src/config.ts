/**
 * wagmi configuration — Arc Mainnet only.
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, fallback, createConfig } from 'wagmi'
import { injected, coinbaseWallet, walletConnect } from 'wagmi/connectors'
import { arcMainnet, ARC_CHAIN_ID, ARC_RPC_URL } from './chains'
import { registerChain } from './tracing'
import { NEXT_PUBLIC_ARC_RPC, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID } from './env'

// Env-driven RPC: NEXT_PUBLIC_ARC_RPC override falls back to Arc Mainnet default.
const arcRpc = NEXT_PUBLIC_ARC_RPC ?? ARC_RPC_URL
if (!arcRpc.startsWith('https://')) {
  throw new Error(`[config] Arc Mainnet RPC must use https://, got "${arcRpc}"`)
}

// Other public Arc RPCs, tried in order only when the one above fails or is rate limited.
// Balance and other reads therefore keep working instead of silently coming back empty.
const BACKUP_RPCS = [
  'https://rpc.blockdaemon.mainnet.arc.io',
  'https://rpc.quicknode.mainnet.arc.io',
  'https://rpc.drpc.mainnet.arc.io',
].filter((u) => u !== arcRpc)

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(ARC_CHAIN_ID, arcRpc)

export const config = createConfig({
  // Arc Mainnet only — all app transactions are on Arc (Chain ID 5042).
  chains: [arcMainnet],
  // MetaMask and Rabby connect through the injected provider; Coinbase Wallet needs no setup;
  // WalletConnect appears once NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
  connectors: [
    injected(),
    coinbaseWallet({ appName: 'SocialPay' }),
    ...(NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID
      ? [walletConnect({ projectId: NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID })]
      : []),
  ],
  transports: {
    [arcMainnet.id]: fallback(
      [
        http(arcRpc, { batch: true, retryCount: 1, timeout: 6_000 }),
        ...BACKUP_RPCS.map((u) => http(u, { batch: true, retryCount: 0, timeout: 6_000 })),
      ],
      { retryCount: 1 },
    ),
  },
})
