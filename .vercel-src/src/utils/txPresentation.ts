import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Waypoints, type LucideIcon } from 'lucide-react'
import type { TxRecord } from '../types/index'
import type { Tone } from '../components/dashboard/ui'
import { formatAddress, isSameAddress } from './format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_CHAIN_ID } from '../chains'

export interface TxView {
  kind: 'payment' | 'swap' | 'bridge'
  icon: LucideIcon
  tone: Tone
  title: string
  /** Second line: who it was with, or what was swapped or bridged. */
  detail: string
  /** Amount with its token, without a sign. Empty when the description already says it all. */
  amountText: string
  sign: '+' | '-' | ''
}

/** How a history entry looks in every list (Dashboard, Pay, Activity, Profile). */
export function describeTx(t: TxRecord, me: string): TxView {
  const symbol = t.symbol || 'USDC'
  if (t.kind === 'swap') {
    return { kind: 'swap', icon: ArrowLeftRight, tone: 'violet', title: 'Swapped', detail: t.summary || `${t.amount} ${symbol}`, amountText: '', sign: '' }
  }
  if (t.kind === 'bridge') {
    const incoming = t.direction === 'received'
    return {
      kind: 'bridge', icon: Waypoints, tone: 'amber', title: incoming ? 'Bridged in' : 'Bridged out',
      detail: t.summary || `${t.amount} ${symbol}`, amountText: '', sign: '',
    }
  }
  const sent = isSameAddress(t.fromAddress, me)
  return {
    kind: 'payment',
    icon: sent ? ArrowUpRight : ArrowDownLeft,
    tone: sent ? 'rose' : 'green',
    title: sent ? 'Sent' : 'Received',
    detail: `${sent ? 'To' : 'From'} ${formatAddress(sent ? t.toAddress : t.fromAddress)}${t.note ? ` · ${t.note}` : ''}`,
    amountText: `${t.amount} ${symbol}`,
    sign: sent ? '-' : '+',
  }
}

/** Explorer link on the chain the transaction happened on (bridges start on other chains). */
export function txUrl(t: Pick<TxRecord, 'chainId' | 'txHash'>): string {
  try {
    return buildTxExplorerUrl(t.chainId, t.txHash)
  } catch {
    return buildTxExplorerUrl(ARC_CHAIN_ID, t.txHash)
  }
}
