// The block explorer for Arc Mainnet (chain 5042): Arc Explorer, https://explorer.arc.io (Blockscout).
// It is the only explorer the app reads from and links to.
// A link is only produced for a well-formed 32-byte transaction hash, so a placeholder, a pending
// id or a half-typed value never turns into a dead link.

import { ARC_CHAIN_ID } from '../chains'

export type ExplorerId = 'arc'

export interface ExplorerDef {
  id: ExplorerId
  /** Short name for buttons. */
  name: string
  /** Name shown in "View on ...". */
  label: string
  base: string
}

export const ARC_EXPLORERS: readonly ExplorerDef[] = [
  { id: 'arc', name: 'Arc Explorer', label: 'Arc Explorer', base: 'https://explorer.arc.io' },
]

export interface ExplorerLink {
  id: ExplorerId
  name: string
  label: string
  url: string
}

/** USDC as an ERC-20 on Arc (6 decimals). The same coin is Arc's native gas token. */
export const ARC_USDC = '0x3600000000000000000000000000000000000000'

const TX_HASH = /^0x[0-9a-fA-F]{64}$/
const ADDRESS = /^0x[0-9a-fA-F]{40}$/

export const isTxHash = (v: unknown): v is `0x${string}` => typeof v === 'string' && TX_HASH.test(v)
export const isEvmAddress = (v: unknown): v is `0x${string}` => typeof v === 'string' && ADDRESS.test(v)

function links(path: string): ExplorerLink[] {
  return ARC_EXPLORERS.map((e) => ({ id: e.id, name: e.name, label: e.label, url: `${e.base}${path}` }))
}

/** Both explorer links for a transaction on Arc. Empty when `hash` is not a real transaction hash. */
export function txLinks(hash: string | undefined | null): ExplorerLink[] {
  return isTxHash(hash) ? links(`/tx/${hash.toLowerCase()}`) : []
}

/** Both explorer links for an address on Arc. Empty when `address` is malformed. */
export function addressLinks(address: string | undefined | null): ExplorerLink[] {
  return isEvmAddress(address) ? links(`/address/${address}`) : []
}

/** Both explorer links for a block on Arc. */
export function blockLinks(block: number | bigint | string | undefined | null): ExplorerLink[] {
  const n = typeof block === 'string' ? Number(block) : block
  if (n === undefined || n === null || !Number.isSafeInteger(Number(n)) || Number(n) < 0) return []
  return links(`/block/${n}`)
}

/** The explorer a plain link should open first (Arc's own). */
export const primaryTxUrl = (hash: string | undefined | null): string | undefined => txLinks(hash)[0]?.url

export const isArcChain = (chainId: number | undefined): boolean => chainId === undefined || chainId === ARC_CHAIN_ID
