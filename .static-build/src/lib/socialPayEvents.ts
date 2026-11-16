// Decodes ArcSocialPay contract events with the contract's ABI (src/contracts/arcSocialPay.ts).
//
// That ABI is checked against the compiled contract in tests/unit/socialPayEvents.test.ts and
// against logs the live contract at SOCIAL_PAY_DEPLOYED_ADDRESS really emitted on Arc Mainnet.
// Nothing here invents data: a log that is not from the contract, or does not match an event of
// the ABI, decodes to null.

import { decodeEventLog, formatUnits, getAddress } from 'viem'
import {
  isSocialPayConfigured,
  SOCIAL_PAY_ABI,
  SOCIAL_PAY_ADDRESS,
  SOCIAL_PAY_DEPLOYED_ADDRESS,
} from '../contracts/arcSocialPay'

/** Block the contract was created in on Arc Mainnet (found by bisecting eth_getCode on the live chain). */
export const SOCIAL_PAY_DEPLOY_BLOCK = 24_774_515

const USDC_DECIMALS = 6

export interface RawLog {
  address: string
  topics: readonly string[]
  data: string
  blockNumber?: string | number | bigint | null
  transactionHash?: string | null
  logIndex?: string | number | bigint | null
}

export interface DecodedSocialPayEvent {
  name: string
  contract: string
  txHash: string
  blockNumber: number
  logIndex: number
  /** Every argument as text (amounts are raw integers, addresses are checksummed). */
  args: Record<string, string>
  sender?: string
  recipient?: string
  /** Amount in USDC (6-decimal ERC-20 view), only for Tip and Payment. */
  amountUsdc?: string
  /** The memo of a Payment, or the post id of a Tip. */
  note?: string
  /** One plain sentence describing the event. */
  summary: string
}

const lc = (s: string) => s.toLowerCase()

/** Addresses whose logs count as SocialPay events: the known deployment and the configured one. */
export function socialPayContracts(): string[] {
  const out = new Set<string>([lc(SOCIAL_PAY_DEPLOYED_ADDRESS)])
  if (isSocialPayConfigured()) out.add(lc(SOCIAL_PAY_ADDRESS))
  return [...out]
}

export const isSocialPayAddress = (address: string): boolean => socialPayContracts().includes(lc(address))

/** Reads a number from a hex string, decimal string, number or bigint. */
export function toNumber(v: string | number | bigint | null | undefined): number {
  if (v === null || v === undefined || v === '') return 0
  try {
    return Number(typeof v === 'string' ? BigInt(v) : v)
  } catch {
    return 0
  }
}

const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`

/** Decodes one log. Returns null unless it was emitted by SocialPay and matches an event of its ABI. */
export function decodeSocialPayLog(log: RawLog): DecodedSocialPayEvent | null {
  if (!isSocialPayAddress(log.address)) return null
  if (!Array.isArray(log.topics) && !log.topics) return null
  let ev
  try {
    ev = decodeEventLog({
      abi: SOCIAL_PAY_ABI,
      data: log.data as `0x${string}`,
      topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
      strict: true,
    })
  } catch {
    return null
  }
  const raw = (ev.args ?? {}) as Record<string, unknown>
  const args: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw)) args[k] = typeof v === 'bigint' ? v.toString() : String(v)

  const base = {
    name: ev.eventName as string,
    contract: getAddress(log.address),
    txHash: lc(log.transactionHash ?? ''),
    blockNumber: toNumber(log.blockNumber),
    logIndex: toNumber(log.logIndex),
    args,
  }

  if (ev.eventName === 'Tip' || ev.eventName === 'Payment') {
    const a = raw as { sender: string; recipient: string; amount: bigint; postId?: string; memo?: string }
    const amountUsdc = formatUnits(a.amount, USDC_DECIMALS)
    const note = (ev.eventName === 'Tip' ? a.postId : a.memo) ?? ''
    const what = ev.eventName === 'Tip' ? 'Tip' : 'Payment'
    return {
      ...base,
      sender: a.sender,
      recipient: a.recipient,
      amountUsdc,
      note,
      summary: `${what} of ${amountUsdc} USDC from ${short(a.sender)} to ${short(a.recipient)}${note ? ` (${ev.eventName === 'Tip' ? 'post' : 'memo'}: ${note})` : ''}`,
    }
  }

  const who = (k: string) => (args[k] ? short(args[k]) : '')
  const summaries: Record<string, string> = {
    OwnershipTransferred: `Ownership moved from ${who('previousOwner')} to ${who('newOwner')}`,
    OwnershipProposed: `Ownership proposed from ${who('currentOwner')} to ${who('proposedOwner')}`,
    Paused: `Contract paused by ${who('account')}`,
    Unpaused: `Contract unpaused by ${who('account')}`,
    Rescued: `Rescued ${args.amount ?? ''} of ${who('token')} to ${who('to')}`,
  }
  return { ...base, summary: summaries[ev.eventName as string] ?? (ev.eventName as string) }
}

/** Decodes every SocialPay log in a list (a receipt's logs, or an explorer's log feed). */
export function decodeSocialPayLogs(logs: readonly RawLog[]): DecodedSocialPayEvent[] {
  const out: DecodedSocialPayEvent[] = []
  for (const l of logs) {
    const d = decodeSocialPayLog(l)
    if (d) out.push(d)
  }
  return out
}

/** True when `address` took part in a Tip or Payment (as sender or recipient). */
export function involves(ev: DecodedSocialPayEvent, address: string): boolean {
  return [ev.sender, ev.recipient].some((a) => a && lc(a) === lc(address))
}
