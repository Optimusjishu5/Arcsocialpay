// Recognises a bridge out of Arc from the transaction's receipt.
//
// Bridging USDC out with Circle's CCTP burns it on Arc and emits DepositForBurn from the CCTP
// TokenMessengerV2. Many bridge apps do not call TokenMessenger from the user's wallet: the wallet
// sends USDC to a bridge contract, which takes its fee and burns the rest. From the wallet's side
// that looks like a plain payment to a contract, so the receipt is what tells the two apart.
//
// Verified against a real bridge on Arc Mainnet (tests/unit/bridgeDetect.test.ts): 3.5428 USDC sent
// by a wallet to a bridge contract, 3.515525 burned, destination domain 3 (Arbitrum).

import { decodeEventLog, parseAbiItem, toEventSelector } from 'viem'

/** CCTP TokenMessengerV2 on Arc Mainnet (src/onchain-facts.ts, protocolContracts). */
export const CCTP_TOKEN_MESSENGER = '0x28b5a0e9C621a5BadaA536219b3a228C8168cf5d'

const DEPOSIT_FOR_BURN = parseAbiItem(
  'event DepositForBurn(address indexed burnToken, uint256 amount, address indexed depositor, bytes32 mintRecipient, uint32 destinationDomain, bytes32 destinationTokenMessenger, bytes32 destinationCaller, uint256 maxFee, uint32 indexed minFinalityThreshold, bytes hookData)',
)
export const DEPOSIT_FOR_BURN_TOPIC = toEventSelector(DEPOSIT_FOR_BURN)

export interface LogLike { address: string; topics: readonly string[]; data: string }

export interface BridgeOut {
  /** Raw amount burned (token units). */
  amount: bigint
  /** CCTP domain id of the destination chain. */
  domain: number
}

const lc = (s: string) => s.toLowerCase()

/** The first CCTP burn in a receipt's logs, or null when the transaction burned nothing. */
export function bridgeOutFromLogs(logs: readonly LogLike[]): BridgeOut | null {
  for (const l of logs) {
    if (lc(l.address) !== lc(CCTP_TOKEN_MESSENGER) || lc(l.topics[0] ?? '') !== lc(DEPOSIT_FOR_BURN_TOPIC)) continue
    try {
      const ev = decodeEventLog({
        abi: [DEPOSIT_FOR_BURN],
        data: l.data as `0x${string}`,
        topics: l.topics as [`0x${string}`, ...`0x${string}`[]],
        strict: true,
      })
      return { amount: ev.args.amount, domain: Number(ev.args.destinationDomain) }
    } catch { /* a log of that address that is not a burn */ }
  }
  return null
}

/** CCTP mainnet domain ids and chain names, as listed in @circle-fin/provider-cctp-v2. */
const DOMAIN_NAMES: Record<number, string> = {
  0: 'Ethereum', 1: 'Avalanche', 2: 'Optimism', 3: 'Arbitrum', 4: 'Noble', 5: 'Solana', 6: 'Base', 7: 'Polygon',
  8: 'Sui', 9: 'Aptos', 10: 'Unichain', 11: 'Linea', 12: 'Codex', 13: 'Sonic', 14: 'World Chain', 15: 'Monad',
  16: 'Sei', 18: 'XDC', 19: 'HyperEVM', 21: 'Ink', 22: 'Plume', 26: 'Arc', 28: 'Edge', 29: 'Injective',
  30: 'Morph', 31: 'Pharos', 32: 'Cronos', 33: 'Plasma', 37: 'X Layer',
}

/** Name of a CCTP destination domain ("Arbitrum", "Base", ...); "another chain" for one this list does not know. */
export function domainName(domain: number): string {
  return DOMAIN_NAMES[domain] ?? 'another chain'
}

// ── Remembering what was checked, so a reload does not read every receipt again ──

const KEY = 'socialpay:bridge-checks:v1'
const MAX = 6_000
let checks: Map<string, string> | null = null
let saveTimer: ReturnType<typeof setTimeout> | undefined

function load(): Map<string, string> {
  if (checks) return checks
  checks = new Map()
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(KEY) : null
    const parsed = raw ? (JSON.parse(raw) as Record<string, string>) : {}
    for (const [k, v] of Object.entries(parsed)) if (typeof v === 'string') checks.set(k, v)
  } catch { /* nothing remembered */ }
  return checks
}

/**
 * What an earlier check found for this transaction: undefined = never checked, '' = not a bridge,
 * otherwise the destination domain as text.
 */
export function recallBridgeCheck(txHash: string): string | undefined {
  return load().get(lc(txHash))
}

export function rememberBridgeCheck(txHash: string, burn: BridgeOut | null): void {
  const m = load()
  m.set(lc(txHash), burn ? String(burn.domain) : '')
  if (m.size > MAX) for (const k of [...m.keys()].slice(0, m.size - MAX)) m.delete(k)
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try { window.localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(m))) } catch { /* storage unavailable */ }
  }, 1_000)
}
