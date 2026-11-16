'use client'

// Browser helpers for Circle App Kit (bridge + swap) with the connected wallet.
// The kit is loaded on demand so it never runs during server rendering.

import { defineChain, numberToHex, type Chain, type EIP1193Provider } from 'viem'
import type { Connector } from 'wagmi'
import type { AppKit, ChainDefinition } from '@circle-fin/app-kit'
import { ARC_CHAIN_ID, arcMainnet } from '../chains'

export type EvmChainDef = Extract<ChainDefinition, { type: 'evm' }>

let kitPromise: Promise<AppKit> | null = null

/** One shared kit instance, created in the browser on first use. */
export function getKit(): Promise<AppKit> {
  kitPromise ??= import('@circle-fin/app-kit').then((m) => new m.AppKit())
  return kitPromise
}

/** Mainnet EVM chains the kit can bridge USDC between (read from the SDK, not hardcoded). */
export async function getMainnetBridgeChains(): Promise<EvmChainDef[]> {
  const kit = await getKit()
  return kit
    .getSupportedChains()
    .filter((c): c is EvmChainDef => c.type === 'evm' && !c.isTestnet && c.cctp !== null && !!c.usdcAddress)
}

/** viem chain for wallet add/switch and balance reads. Arc uses the app's own definition. */
export function toViemChain(def: EvmChainDef): Chain {
  if (def.chainId === ARC_CHAIN_ID) return arcMainnet
  const explorer = def.explorerUrl ? new URL(def.explorerUrl.replace('{hash}', '')).origin : undefined
  return defineChain({
    id: def.chainId,
    name: def.name,
    nativeCurrency: def.nativeCurrency,
    rpcUrls: { default: { http: [...def.rpcEndpoints] } },
    blockExplorers: explorer ? { default: { name: def.name, url: explorer } } : undefined,
  })
}

const isUnrecognizedChain = (error: unknown) => {
  const e = error as { code?: number; data?: { originalError?: { code?: number } } }
  return e?.code === 4902 || e?.data?.originalError?.code === 4902 // nested on MetaMask mobile
}

/**
 * Wrap a wallet provider so a "chain not added" error (4902) adds the chain and
 * retries. Without this, a wallet that lacks the destination chain fails after
 * the burn has already happened.
 */
export function withAddChainFallback(provider: EIP1193Provider, chains: readonly Chain[]): EIP1193Provider {
  const send = provider.request.bind(provider) as (args: { method: string; params?: unknown }) => Promise<unknown>
  const request = (async (args: { method: string; params?: unknown }) => {
    try {
      return await send(args)
    } catch (error) {
      if (args.method !== 'wallet_switchEthereumChain' || !isUnrecognizedChain(error)) throw error
      const [{ chainId }] = args.params as [{ chainId: string }]
      const chain = chains.find((c) => c.id === Number(chainId))
      if (!chain) throw error
      await send({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: numberToHex(chain.id),
          chainName: chain.name,
          nativeCurrency: chain.nativeCurrency,
          rpcUrls: [...chain.rpcUrls.default.http],
          blockExplorerUrls: chain.blockExplorers ? [chain.blockExplorers.default.url] : undefined,
        }],
      })
      return send(args)
    }
  }) as EIP1193Provider['request']

  // A Proxy, not a spread: wallet providers are class instances.
  return new Proxy(provider, {
    get(target, prop) {
      if (prop === 'request') return request
      const value: unknown = Reflect.get(target, prop, target)
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(target) : value
    },
  })
}

/** Ask the wallet to move to `chain` (adding it first when the wallet lacks it). */
export async function switchWalletChain(provider: EIP1193Provider, chain: Chain): Promise<void> {
  await provider.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: numberToHex(chain.id) }] })
}

/** Viem adapter built from the connected browser wallet. */
export async function createWalletAdapter(connector: Connector, chains: readonly Chain[]) {
  const { createViemAdapterFromProvider } = await import('@circle-fin/adapter-viem-v2')
  const raw = (await connector.getProvider()) as EIP1193Provider
  const provider = withAddChainFallback(raw, chains)
  const adapter = await createViemAdapterFromProvider({ provider })
  return { adapter, provider }
}

/** Readable message for SDK and wallet errors. */
export function kitErrorMessage(e: unknown): string {
  const err = e as { code?: number; message?: string; shortMessage?: string }
  if (err?.code === 4001) return 'Request rejected in your wallet.'
  const msg = err?.shortMessage ?? err?.message ?? ''
  if (/user rejected|user denied/i.test(msg)) return 'Request rejected in your wallet.'
  return msg ? (msg.length > 220 ? `${msg.slice(0, 220)}...` : msg) : 'Something went wrong. Please try again.'
}
