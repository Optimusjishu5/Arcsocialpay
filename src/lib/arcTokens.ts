'use client'

// Every token that can be swapped on Arc Mainnet (chain 5042), with logos.
// The list is the union of what LI.FI and KyberSwap publish for Arc, plus the
// three Circle tokens built in. Both APIs work from the browser without a key.
// The result is cached for 30 minutes so the token picker opens instantly and
// the keyless LI.FI rate limit is not wasted on list reads.

import { useSyncExternalStore } from 'react'
import { erc20Abi, formatUnits, getAddress, type Address, type PublicClient } from 'viem'

export type TokenSource = 'lifi' | 'kyber' | 'uniswap'

export interface ArcToken {
  address: Address
  symbol: string
  name: string
  decimals: number
  logoURI?: string
  /** A second logo from another list, tried when the first fails to load. */
  logoAlt?: string
  priceUSD?: number
  sources: TokenSource[]
}

/** Arc's multicall3, used to read many balances in one request. */
export const ARC_MULTICALL3: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'

const BUILTIN: ArcToken[] = ([
  { address: '0x3600000000000000000000000000000000000000', symbol: 'USDC', name: 'USD Coin', decimals: 6, logoURI: '/tokens/usdc.png', priceUSD: 1, sources: ['uniswap'] },
  { address: '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1', symbol: 'EURC', name: 'Euro Coin', decimals: 6, logoURI: '/tokens/eurc.png', sources: ['uniswap'] },
  { address: '0x171A4217b86A807A64eB94757db6849fb4bDbAA0', symbol: 'cirBTC', name: 'Circle Wrapped Bitcoin', decimals: 8, logoURI: '/tokens/cirbtc.png', sources: ['uniswap'] },
] as ArcToken[]).map((t) => ({ ...t, address: getAddress(t.address.toLowerCase()) }))

export const USDC_TOKEN = BUILTIN[0]
export const EURC_TOKEN = BUILTIN[1]
/** Arc's gas is USDC, so a swap that spends all of it would leave nothing for the fee. */
export const GAS_RESERVE_RAW = 50_000n // 0.05 USDC

const CACHE_KEY = 'socialpay.arcTokens.v3'
const CACHE_MS = 30 * 60 * 1000
const PRIORITY = ['USDC', 'EURC', 'cirBTC', 'WETH']

const sameAddr = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

/** Only https logos; repairs the "ttps://" typo some lists contain. */
function cleanLogo(u?: string | null): string | undefined {
  if (!u) return undefined
  let s = u.trim()
  if (s.startsWith('ttps://')) s = `h${s}`
  return /^https:\/\//i.test(s) || s.startsWith('/') ? s : undefined
}

interface LifiToken { address: string; symbol: string; name?: string; decimals: number; logoURI?: string | null; priceUSD?: string | null }
interface KyberToken { address: string; symbol: string; name?: string; decimals: number; logoURI?: string | null; isHoneypot?: boolean }

/** This app's own cached copy first, then the provider directly. */
async function fetchList<T>(src: string, direct: string): Promise<T> {
  for (const url of [`/api/upstream?src=${src}`, direct]) {
    try {
      const res = await fetch(url)
      if (res.ok) return (await res.json()) as T
    } catch { /* try the next source */ }
  }
  throw new Error(`${src} unavailable`)
}

async function fetchLifi(): Promise<LifiToken[]> {
  const body = await fetchList<{ tokens?: Record<string, LifiToken[]> }>('lifi-tokens', 'https://li.quest/v1/tokens?chains=5042')
  return body.tokens?.['5042'] ?? []
}

async function fetchKyber(): Promise<KyberToken[]> {
  const body = await fetchList<{ data?: { tokens?: KyberToken[] } }>(
    'kyber-tokens', 'https://ks-setting.kyberswap.com/api/v1/tokens?chainIds=5042&page=1&pageSize=100&isWhitelisted=true',
  )
  return (body.data?.tokens ?? []).filter((t) => !t.isHoneypot)
}

function merge(lifi: LifiToken[], kyber: KyberToken[]): ArcToken[] {
  const map = new Map<string, ArcToken>()
  const upsert = (t: { address: string; symbol: string; name?: string; decimals: number; logoURI?: string | null; priceUSD?: string | number | null }, source: TokenSource) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(t.address) || !t.symbol || !Number.isInteger(t.decimals)) return
    const address = getAddress(t.address.toLowerCase())
    const k = address.toLowerCase()
    const prev = map.get(k)
    const price = t.priceUSD ? Number(t.priceUSD) : undefined
    if (prev) {
      if (!prev.sources.includes(source)) prev.sources.push(source)
      const logo = cleanLogo(t.logoURI)
      if (!prev.logoURI) prev.logoURI = logo
      else if (logo && logo !== prev.logoURI && !prev.logoAlt) prev.logoAlt = logo
      if (prev.priceUSD === undefined && price !== undefined && Number.isFinite(price)) prev.priceUSD = price
      return
    }
    map.set(k, {
      address, symbol: t.symbol, name: t.name || t.symbol, decimals: t.decimals,
      logoURI: cleanLogo(t.logoURI), priceUSD: price !== undefined && Number.isFinite(price) ? price : undefined, sources: [source],
    })
  }
  // KyberSwap logos are the cleanest, so they go in first.
  kyber.forEach((t) => upsert(t, 'kyber'))
  lifi.forEach((t) => upsert(t, 'lifi'))
  BUILTIN.forEach((t) => upsert(t, 'uniswap'))
  // The Circle tokens always use the app's own name, logo and price, so the same
  // coin looks identical in the pill, the picker and the quick-pick row. USDC is
  // pinned to exactly $1 (list prices drift to 1.001).
  for (const b of BUILTIN) {
    const t = map.get(b.address.toLowerCase())
    if (!t) continue
    t.name = b.name; t.symbol = b.symbol; t.logoURI = b.logoURI; t.logoAlt = undefined
    if (b.priceUSD !== undefined) t.priceUSD = b.priceUSD
  }
  return [...map.values()].sort((a, b) => {
    const pa = PRIORITY.indexOf(a.symbol), pb = PRIORITY.indexOf(b.symbol)
    if (pa !== -1 || pb !== -1) return (pa === -1 ? 99 : pa) - (pb === -1 ? 99 : pb)
    if (!!a.logoURI !== !!b.logoURI) return a.logoURI ? -1 : 1
    return a.symbol.localeCompare(b.symbol)
  })
}

// ── Shared store ────────────────────────────────────────────────────────────

let tokens: ArcToken[] = BUILTIN
let loading = false
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

function readCache(): ArcToken[] | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { at?: number; tokens?: ArcToken[] }
    if (!parsed.at || Date.now() - parsed.at > CACHE_MS || !Array.isArray(parsed.tokens) || parsed.tokens.length < 3) return null
    return parsed.tokens
  } catch {
    return null
  }
}

async function loadTokens(): Promise<void> {
  if (loaded || loading) return
  loading = true
  emit()
  try {
    const cached = readCache()
    if (cached) { tokens = cached; loaded = true; return }
    const [lifi, kyber] = await Promise.allSettled([fetchLifi(), fetchKyber()])
    const merged = merge(lifi.status === 'fulfilled' ? lifi.value : [], kyber.status === 'fulfilled' ? kyber.value : [])
    // Keep the built-ins when both lists failed, and retry on the next mount.
    if (lifi.status === 'fulfilled' || kyber.status === 'fulfilled') {
      tokens = merged
      loaded = true
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), tokens: merged })) } catch { /* storage full or blocked */ }
    }
  } finally {
    loading = false
    emit()
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  void loadTokens()
  return () => { listeners.delete(l) }
}

export function useArcTokens(): { tokens: ArcToken[]; loading: boolean } {
  const list = useSyncExternalStore(subscribe, () => tokens, () => BUILTIN)
  const isLoading = useSyncExternalStore(subscribe, () => loading, () => false)
  return { tokens: list, loading: isLoading }
}

export function findToken(list: readonly ArcToken[], address: string): ArcToken | undefined {
  return list.find((t) => sameAddr(t.address, address))
}

// ── Balances ────────────────────────────────────────────────────────────────

/** ERC-20 balances for many tokens in one multicall. Missing entries failed to read. */
export async function readBalances(client: PublicClient, owner: Address, list: readonly ArcToken[]): Promise<Record<string, bigint>> {
  const results = await client.multicall({
    allowFailure: true,
    multicallAddress: ARC_MULTICALL3,
    contracts: list.map((t) => ({ address: t.address, abi: erc20Abi, functionName: 'balanceOf' as const, args: [owner] as const })),
  })
  const out: Record<string, bigint> = {}
  results.forEach((r, i) => { if (r.status === 'success') out[list[i].address.toLowerCase()] = r.result })
  return out
}

/** Reads symbol, name and decimals of a token that is not in the list. */
export async function readCustomToken(client: PublicClient, input: Address): Promise<ArcToken> {
  const address = getAddress(input.toLowerCase())
  const [symbol, name, decimals] = await Promise.all([
    client.readContract({ address, abi: erc20Abi, functionName: 'symbol' }),
    client.readContract({ address, abi: erc20Abi, functionName: 'name' }).catch(() => ''),
    client.readContract({ address, abi: erc20Abi, functionName: 'decimals' }),
  ])
  return { address, symbol: String(symbol).slice(0, 12), name: String(name || symbol).slice(0, 40), decimals: Number(decimals), sources: ['uniswap'] }
}

// ── Display helpers ─────────────────────────────────────────────────────────

/** Display form of a raw token amount. Never used for math. */
export function formatTokenAmount(raw: bigint, decimals: number, maxFraction = 6): string {
  const [i, f = ''] = formatUnits(raw, decimals).split('.')
  const frac = f.slice(0, maxFraction).replace(/0+$/, '')
  return frac ? `${i}.${frac}` : i
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
