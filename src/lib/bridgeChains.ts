'use client'

// Every EVM mainnet that LI.FI can bridge to or from, with logos. Used by the
// bridge screens for the chain picker and for LI.FI routes. The list is cached
// for an hour so the picker opens instantly and the keyless LI.FI limit is spared.

import { useSyncExternalStore } from 'react'
import { defineChain, type Chain } from 'viem'
import { ARC_CHAIN_ID, arcMainnet } from '../chains'

export interface BridgeChain {
  /** Stable key used by pickers. For LI.FI chains this is the chain id as a string. */
  key: string
  id: number
  name: string
  logoURI?: string
  rpcUrls: string[]
  explorerUrl?: string
  nativeSymbol: string
  nativeDecimals: number
}

const ARC_FALLBACK: BridgeChain = {
  key: String(ARC_CHAIN_ID), id: ARC_CHAIN_ID, name: 'Arc', logoURI: '/chains/arc.svg', rpcUrls: [...arcMainnet.rpcUrls.default.http],
  explorerUrl: 'https://explorer.arc.io', nativeSymbol: 'USDC', nativeDecimals: 18,
}

const CACHE_KEY = 'socialpay.bridgeChains.v2'
const CACHE_MS = 60 * 60 * 1000
const PRIORITY = [ARC_CHAIN_ID, 1, 8453, 42161, 10, 137, 43114, 56, 130, 59144, 480, 57073, 146, 143]

interface LifiChain {
  id: number; name: string; key: string; mainnet?: boolean; chainType?: string; logoURI?: string | null
  nativeToken?: { symbol?: string; decimals?: number }
  metamask?: { rpcUrls?: string[]; blockExplorerUrls?: string[]; nativeCurrency?: { symbol?: string; decimals?: number } }
}

/** Logos shipped with the app, so the most used networks never wait on a download. */
const LOCAL_LOGOS: Record<number, string> = { [ARC_CHAIN_ID]: '/chains/arc.svg', 1: '/chains/ethereum.svg', 8453: '/chains/base.svg', 42161: '/chains/arbitrum.svg', 10: '/chains/optimism.svg' }

const httpsOnly = (u?: string | null) => (u && /^https:\/\//i.test(u.trim()) ? u.trim() : undefined)

function normalize(list: LifiChain[]): BridgeChain[] {
  const out: BridgeChain[] = []
  for (const c of list) {
    if (c.chainType !== 'EVM' || !c.mainnet) continue
    const rpcUrls = (c.metamask?.rpcUrls ?? []).map(httpsOnly).filter((u): u is string => !!u)
    if (c.id === ARC_CHAIN_ID) rpcUrls.unshift(...arcMainnet.rpcUrls.default.http)
    if (rpcUrls.length === 0) continue
    out.push({
      key: String(c.id), id: c.id, name: c.name, logoURI: LOCAL_LOGOS[c.id] ?? httpsOnly(c.logoURI),
      rpcUrls: [...new Set(rpcUrls)], explorerUrl: httpsOnly(c.metamask?.blockExplorerUrls?.[0])?.replace(/\/$/, ''),
      nativeSymbol: c.metamask?.nativeCurrency?.symbol ?? c.nativeToken?.symbol ?? 'ETH',
      nativeDecimals: c.metamask?.nativeCurrency?.decimals ?? c.nativeToken?.decimals ?? 18,
    })
  }
  return out.sort((a, b) => {
    const pa = PRIORITY.indexOf(a.id), pb = PRIORITY.indexOf(b.id)
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    return a.name.localeCompare(b.name)
  })
}

// ── Shared store ────────────────────────────────────────────────────────────

let chains: BridgeChain[] = [ARC_FALLBACK]
let loading = false
let loaded = false
let failed = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function readCache(): BridgeChain[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as { at?: number; chains?: BridgeChain[] }
    if (!p.at || Date.now() - p.at > CACHE_MS || !Array.isArray(p.chains) || p.chains.length < 3) return null
    return p.chains
  } catch {
    return null
  }
}

async function loadChains(): Promise<void> {
  if (loaded || loading) return
  loading = true
  failed = false
  emit()
  try {
    const cached = readCache()
    if (cached) { chains = cached; loaded = true; return }
    let body: { chains?: LifiChain[] } | null = null
    for (const url of ['/api/upstream?src=lifi-chains', 'https://li.quest/v1/chains?chainTypes=EVM']) {
      try {
        const res = await fetch(url)
        if (res.ok) { body = (await res.json()) as { chains?: LifiChain[] }; break }
      } catch { /* try the next source */ }
    }
    if (!body) throw new Error('LI.FI chain list unavailable')
    const list = normalize(body.chains ?? [])
    if (list.length < 3) throw new Error('LI.FI returned too few chains')
    chains = list
    loaded = true
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), chains: list })) } catch { /* storage blocked */ }
  } catch {
    failed = true
  } finally {
    loading = false
    emit()
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  void loadChains()
  return () => { listeners.delete(l) }
}

export function reloadBridgeChains() { loaded = false; void loadChains() }

export function useBridgeChains(): { chains: BridgeChain[]; loading: boolean; failed: boolean } {
  const list = useSyncExternalStore(subscribe, () => chains, () => [ARC_FALLBACK])
  const isLoading = useSyncExternalStore(subscribe, () => loading, () => false)
  const didFail = useSyncExternalStore(subscribe, () => failed, () => false)
  return { chains: list, loading: isLoading, failed: didFail }
}

/** viem chain definition for wallet switching and receipts. */
export function toViemBridgeChain(c: BridgeChain): Chain {
  if (c.id === ARC_CHAIN_ID) return arcMainnet
  return defineChain({
    id: c.id, name: c.name,
    nativeCurrency: { name: c.nativeSymbol, symbol: c.nativeSymbol, decimals: c.nativeDecimals },
    rpcUrls: { default: { http: c.rpcUrls } },
    blockExplorers: c.explorerUrl ? { default: { name: c.name, url: c.explorerUrl } } : undefined,
  })
}

export const txUrl = (c: BridgeChain, hash: string) => (c.explorerUrl ? `${c.explorerUrl}/tx/${hash}` : undefined)

// ── USDC lookup per chain ───────────────────────────────────────────────────

export interface ChainUsdc { address: `0x${string}`; decimals: number }
const usdcCache = new Map<number, Promise<ChainUsdc>>()

/** USDC contract and decimals on a chain, from LI.FI. Arc is known locally. */
export function getChainUsdc(chainId: number): Promise<ChainUsdc> {
  if (chainId === ARC_CHAIN_ID) return Promise.resolve({ address: '0x3600000000000000000000000000000000000000', decimals: 6 })
  let p = usdcCache.get(chainId)
  if (!p) {
    p = fetch(`https://li.quest/v1/token?chain=${chainId}&token=USDC`)
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { address?: string; decimals?: number; symbol?: string; message?: string }
        if (res.status === 429) throw new Error('LI.FI is rate limited right now. Wait a minute and try again.')
        if (!res.ok || !body.address || !/^0x[0-9a-fA-F]{40}$/.test(body.address) || typeof body.decimals !== 'number' || body.symbol !== 'USDC') {
          throw new Error('USDC is not available on this network through LI.FI.')
        }
        return { address: body.address as `0x${string}`, decimals: body.decimals }
      })
    usdcCache.set(chainId, p)
    // A failed lookup is retried next time instead of being remembered.
    p.catch(() => usdcCache.delete(chainId))
  }
  return p
}
