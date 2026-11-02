// Which tokens the Arc node scan watches for a wallet. A node can only be asked about specific token
// contracts, so besides the three Circle tokens it also watches every swappable token this wallet holds
// (found from its balances) and every token it held on an earlier visit. A swap into such a token then
// shows up even when no explorer is available. The list only grows, so older scans stay valid.

import type { Address, PublicClient } from 'viem'
import { getArcTokenList, readBalances } from './arcTokens'
import type { ScanToken } from './onchainActivity'
import { UNI_TOKENS } from './uniswapArc'

const MAX_EXTRA = 12
const key = (owner: string) => `socialpay:scan-tokens:v1:${owner.toLowerCase()}`
const isAddress = (a: unknown): a is string => typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a)

function remembered(owner: string): ScanToken[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(key(owner))
    const list = raw ? (JSON.parse(raw) as ScanToken[]) : []
    return list.filter((t) => isAddress(t?.address) && Number.isInteger(t.decimals) && typeof t.symbol === 'string')
  } catch {
    return []
  }
}

/** The tokens to watch right now, with no waiting: the Circle tokens plus those remembered for this wallet. */
export function knownScanTokens(owner: string): ScanToken[] {
  return [...UNI_TOKENS, ...remembered(owner).filter((t) => !UNI_TOKENS.some((u) => u.address.toLowerCase() === t.address.toLowerCase()))]
}

export async function discoverScanTokens(client: PublicClient, owner: string): Promise<ScanToken[]> {
  const builtin = new Set(UNI_TOKENS.map((t) => t.address.toLowerCase()))
  const extra = new Map<string, ScanToken>()
  for (const t of remembered(owner)) extra.set(t.address.toLowerCase(), t)
  try {
    const list = await getArcTokenList()
    const balances = await readBalances(client, owner as Address, list)
    for (const t of list) {
      const a = t.address.toLowerCase()
      if (builtin.has(a) || (balances[a] ?? 0n) <= 0n) continue
      extra.set(a, { symbol: t.symbol.slice(0, 12), address: t.address, decimals: t.decimals })
    }
  } catch { /* keep what was remembered */ }
  const picked = [...extra.values()].slice(-MAX_EXTRA)
  try { window.localStorage.setItem(key(owner), JSON.stringify(picked)) } catch { /* storage unavailable */ }
  return [...UNI_TOKENS, ...picked]
}
