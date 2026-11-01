import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarClock, FileCode2, HandCoins, Layers, Users, Waypoints, type LucideIcon } from 'lucide-react'
import type { TxRecord } from '../types/index'
import type { Tone } from '../components/dashboard/ui'
import { formatAddress, isSameAddress } from './format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { ARC_CHAIN_ID } from '../chains'

/** The type of a transaction as the user thinks of it. */
export type TxCategory = 'send' | 'receive' | 'swap' | 'bridge' | 'batch' | 'request' | 'split' | 'schedule' | 'other'

export const TX_CATEGORY_META: Record<TxCategory, { label: string; icon: LucideIcon; tone: Tone }> = {
  send: { label: 'Send', icon: ArrowUpRight, tone: 'rose' },
  receive: { label: 'Receive', icon: ArrowDownLeft, tone: 'green' },
  swap: { label: 'Swap', icon: ArrowLeftRight, tone: 'violet' },
  bridge: { label: 'Bridge', icon: Waypoints, tone: 'amber' },
  batch: { label: 'Batch', icon: Layers, tone: 'indigo' },
  request: { label: 'Request', icon: HandCoins, tone: 'pink' },
  split: { label: 'Split', icon: Users, tone: 'teal' },
  schedule: { label: 'Schedule', icon: CalendarClock, tone: 'blue' },
  other: { label: 'Other', icon: FileCode2, tone: 'indigo' },
}

type ToolKind = 'batch' | 'request' | 'split' | 'schedule'
const TOOL_TITLE: Record<ToolKind, { sent: string; received: string }> = {
  batch: { sent: 'Batch payment', received: 'Batch payment received' },
  request: { sent: 'Request paid', received: 'Request payment received' },
  split: { sent: 'Split payment', received: 'Split share received' },
  schedule: { sent: 'Scheduled payment', received: 'Scheduled payment received' },
}

export interface TxView {
  kind: 'payment' | 'swap' | 'bridge'
  category: TxCategory
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
    return { kind: 'swap', category: 'swap', icon: ArrowLeftRight, tone: 'violet', title: 'Swapped', detail: t.summary || `${t.amount} ${symbol}`, amountText: '', sign: '' }
  }
  if (t.kind === 'bridge') {
    const incoming = t.direction === 'received'
    return {
      kind: 'bridge', category: 'bridge', icon: Waypoints, tone: 'amber', title: incoming ? 'Bridged in' : 'Bridged out',
      detail: t.summary || `${t.amount} ${symbol}`, amountText: '', sign: '',
    }
  }
  if (t.kind === 'other') {
    const failed = t.status === 'failed'
    return {
      kind: 'payment', category: 'other', icon: FileCode2, tone: 'indigo',
      title: t.summary || 'Contract interaction',
      detail: `${failed ? 'Failed · ' : ''}${isSameAddress(t.toAddress, me) ? 'Your wallet' : `With ${formatAddress(t.toAddress)}`}`,
      amountText: '', sign: '',
    }
  }
  const sent = isSameAddress(t.fromAddress, me)
  // Batch rows saved before the type was recorded carry this note.
  const tool: ToolKind | undefined =
    t.kind === 'batch' || t.kind === 'request' || t.kind === 'split' || t.kind === 'schedule'
      ? t.kind
      : sent && t.note === 'Batch transfer' ? 'batch' : undefined
  const category: TxCategory = tool ?? (sent ? 'send' : 'receive')
  const meta = TX_CATEGORY_META[category]
  const note = tool === 'batch' && t.note === 'Batch transfer' ? '' : t.note
  // A batch sent in one transaction names how many people it paid.
  const batchSummary = tool === 'batch' && t.summary && !t.note ? t.summary : ''
  return {
    kind: 'payment',
    category,
    icon: meta.icon,
    tone: meta.tone,
    title: tool ? TOOL_TITLE[tool][sent ? 'sent' : 'received'] : sent ? 'Sent' : 'Received',
    detail: `${sent ? 'To' : 'From'} ${formatAddress(sent ? t.toAddress : t.fromAddress)}${note ? ` · ${note}` : batchSummary ? ` · ${batchSummary}` : ''}`,
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
