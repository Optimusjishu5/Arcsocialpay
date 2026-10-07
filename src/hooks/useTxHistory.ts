// ── Tx history lifecycle + on-chain reconciliation (DATA/INDEXING) ─────────
// Single place for pending -> confirmed/failed transitions and for
// best-effort on-chain revalidation. Other flows (PayView SendForm,
// MessagesView InChatPayModal, PostCard TipModal) should call the helpers
// here instead of writing txHistory directly:
//
//   import { trackPendingTx, confirmTx, failTx } from '@/hooks/useTxHistory'
//
//   // immediately on hash (writeContract returns hash):
//   trackPendingTx({ txHash: hash, fromAddress, toAddress, amount, note, conversationId? })
//
//   // on receipt:
//   confirmTx(txHash, blockNumber?) / failTx(txHash, blockNumber?)
//
// Balance polling single source (do NOT add new pollers):
//   - `useUsdcBalance` in useArcWallet.ts owns the 10s `refetchInterval` fallback.
//   - `useUsdcTransferWatcher` below only calls `queryClient.invalidateQueries()`
//     on USDC Transfer events for immediate refresh. No fan-out pollers.
//   - useArcWallet.ts is READ-ONLY for this agent; TipModal polling fixes
//     (refetchInterval + invalidate on hash/focus) are proposed here and must
//     be applied by the owning agent.
//
// Hardcoded literals owned elsewhere (NOT fixed here to avoid conflicts):
//   - MessagesView PaymentBubble: uses buildTxExplorerUrl(ARC_CHAIN_ID, txHash)
//     (Arc Mainnet explorer https://explorer.arc.io)
//   - PostCard TipModal: uses ARC_CHAIN_ID from @/chains (5042, Arc Mainnet)
//   - WalletView: uses ARC_CHAIN_ID (5042)
// Owned files (Dashboard, ProfileView) already use ARC_CHAIN_ID + builders.

import { useEffect } from 'react'
import { useWatchContractEvent, usePublicClient } from 'wagmi'
import { useQueryClient } from '@tanstack/react-query'
import { erc20Abi, formatUnits } from 'viem'
import { parseAmount } from '@/onchain-money'
import {
  appStore,
  useAppStore,
  filterTxHistoryForAddress,
  filterConversationsForAddress,
  filterNotificationsForAddress,
} from '../store/appStore'
import { ARC_CHAIN_ID, USDC_ADDRESS, USDC_DECIMALS } from './useArcWallet'
import type { TxRecord } from '../types/index'

// ── Lifecycle writers (thin wrappers so callers don't touch the store directly) ──

export interface PendingTxInput {
  txHash: string
  fromAddress: string
  toAddress: string
  amount: string // USDC formatted (6 decimals)
  note?: string
  conversationId?: string
  chainId?: number
}

/**
 * Create a pending record on hash. Dedupes by txHash (case-insensitive).
 * Also flips any matching payment message to pending when convId is known.
 * Tip flow MUST call this (currently InChatPayModal/PostCard TipModal only
 * write on success — leaving pending invisible and txHistory missing tips).
 */
export function trackPendingTx(input: PendingTxInput): TxRecord {
  const record = appStore.createPendingTxRecord({
    txHash: input.txHash,
    chainId: input.chainId ?? ARC_CHAIN_ID,
    direction: 'sent',
    amount: input.amount,
    fromAddress: input.fromAddress,
    toAddress: input.toAddress,
    timestamp: Date.now(),
    note: input.note,
  })
  if (input.conversationId) {
    appStore.updatePaymentMessageStatus(input.conversationId, input.txHash, 'pending')
  } else {
    appStore.updatePaymentMessageStatusByHash(input.txHash, 'pending')
  }
  return record
}

/** Mark confirmed on receipt (updates txHistory + all payment messages). */
export function confirmTx(txHash: string, blockNumber?: number): void {
  appStore.confirmTxRecord(txHash, blockNumber)
}

/** Mark failed on receipt revert / write error (updates txHistory + messages). */
export function failTx(txHash: string, blockNumber?: number): void {
  appStore.failTxRecord(txHash, blockNumber)
}

// ── Scoped selectors (case-insensitive, address-scoped) ──

export function useTxHistory(address: string | undefined) {
  const { txHistory } = useAppStore()
  return filterTxHistoryForAddress(txHistory, address)
}

export function useScopedConversations(address: string | undefined) {
  const { conversations } = useAppStore()
  return filterConversationsForAddress(conversations, address)
}

export function useScopedNotifications(address: string | undefined) {
  const { notifications } = useAppStore()
  return filterNotificationsForAddress(notifications, address)
}

// ── On-chain reconciliation ────────────────────────────────────────────────
// Best-effort revalidation of stored txHash via publicClient.getTransactionReceipt
// on ARC_CHAIN_ID. Derives amount via formatUnits from USDC Transfer logs and
// marks mismatched as failed. Never throws — reconciliation must not block load.

type MinimalReceiptLog = {
  address: string
  data?: `0x${string}` | string
  topics?: unknown[]
}

type MinimalPublicClient = {
  getTransactionReceipt: (args: { hash: `0x${string}` }) => Promise<{
    status: string
    blockNumber: bigint
    logs: MinimalReceiptLog[]
  }>
}

function amountsMatch(stored: string, onchain: string): boolean {
  // Exact bigint compare (no parseFloat): parse both as 6-dec USDC raw.
  // Unparseable → true (don't fail, preserve old best-effort behavior).
  try {
    const aRaw = parseAmount(ARC_CHAIN_ID, stored.trim()).raw
    const bRaw = parseAmount(ARC_CHAIN_ID, onchain.trim()).raw
    return aRaw === bRaw
  } catch {
    return true
  }
}

function deriveUsdcAmountFromLogs(logs: MinimalReceiptLog[]): string | null {
  const usdc = USDC_ADDRESS.toLowerCase()
  for (const log of logs) {
    if (!log || typeof log.address !== 'string') continue
    if (log.address.toLowerCase() !== usdc) continue
    if (typeof log.data !== 'string' || log.data.length < 4) continue
    try {
      const raw = BigInt(log.data as `0x${string}`)
      return formatUnits(raw, USDC_DECIMALS)
    } catch {
      continue
    }
  }
  return null
}

export async function reconcileStoredTxHistory(
  publicClient: MinimalPublicClient | null | undefined,
  txHistory: TxRecord[]
): Promise<void> {
  if (!publicClient) return
  // Only pending records need revalidation (confirmed/failed are terminal).
  // This bounds RPC fan-out to a handful of hashes on load.
  const pending = txHistory.filter((t) => t.status === 'pending')
  for (const tx of pending) {
    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: tx.txHash as `0x${string}`,
      })
      const blockNumber = Number(receipt.blockNumber)
      const safeBlock = Number.isSafeInteger(blockNumber) ? blockNumber : undefined
      // Explicit success requirement: only 'success' confirms; 'reverted' or any
      // other status fails (never treat fetch-success as chain-success).
      if (receipt.status !== 'success') {
        failTx(tx.txHash, safeBlock)
        continue
      }
      const onchainAmount = deriveUsdcAmountFromLogs(receipt.logs ?? [])
      if (onchainAmount !== null && !amountsMatch(tx.amount, onchainAmount)) {
        // Amount on-chain differs from what we stored → treat as failed/mismatched.
        failTx(tx.txHash, safeBlock)
        continue
      }
      confirmTx(tx.txHash, safeBlock)
    } catch {
      // Best-effort: unknown hash / RPC error → leave pending for next load.
    }
  }
}

/**
 * Backfill txHistory from chat payment messages (Tip flow compat).
 * InChatPayModal/PostCard TipModal currently write a payment message without a
 * txHistory record. This scans messages for paymentTx hashes missing from
 * txHistory and creates them (preserving pay.status), so Tips appear in
 * Dashboard/Profile activity without editing the Tip owners' files.
 * Runs on mount + whenever messages change; dedupes by txHash.
 */
export function useBackfillMissingTxRecords(): void {
  const { messages, txHistory } = useAppStore()

  useEffect(() => {
    const known = new Set(txHistory.map((t) => t.txHash.toLowerCase()))
    for (const list of Object.values(messages)) {
      for (const m of list ?? []) {
        const pay = m.paymentTx
        if (!pay?.txHash) continue
        const needle = pay.txHash.toLowerCase()
        if (known.has(needle)) continue
        known.add(needle)
        try {
          appStore.addTxRecord({
            txHash: pay.txHash,
            chainId: pay.chainId ?? ARC_CHAIN_ID,
            direction: 'sent',
            amount: pay.amount,
            fromAddress: pay.sender,
            toAddress: pay.recipient,
            status: pay.status,
            timestamp: m.createdAt ?? Date.now(),
          })
        } catch {
          // ignore malformed payment messages
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])
}

/**
 * Call on app load (best-effort, non-blocking). Mount once, e.g. in Dashboard
 * (home = default view) until App.tsx owner wires it globally.
 */
export function useTxReconciliationOnLoad(): void {
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID }) as unknown as
    | MinimalPublicClient
    | undefined
  const { txHistory } = useAppStore()

  useEffect(() => {
    void reconcileStoredTxHistory(publicClient, txHistory).catch(() => {})
    // Re-run when txHistory updates (new pendings) — reconciliation is bounded
    // to pending records only, so this stays a handful of RPC calls.
  }, [publicClient, txHistory])
}

// ── Transfer event watcher ─────────────────────────────────────────────────
// Immediate balance refresh on USDC Transfer. Single watcher → single
// invalidateQueries() call. The 10s refetchInterval in useUsdcBalance remains
// the fallback; do NOT add more intervals elsewhere.

export function useUsdcTransferWatcher(
  address: string | undefined,
  onTransfer?: () => void
): void {
  const queryClient = useQueryClient()

  useWatchContractEvent({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    eventName: 'Transfer',
    chainId: ARC_CHAIN_ID,
    onLogs() {
      // Scoped to wagmi readContract balance reads (not all queries) to avoid
      // refetch storms; useUsdcBalance's 10s interval remains the fallback.
      void queryClient.invalidateQueries({ queryKey: ['readContract'] }).catch(() => {})
      onTransfer?.()
    },
  })

  // Keep `address` in deps for lint clarity; watcher itself is chain-wide and
  // intentionally NOT per-address to avoid fan-out (one subscription total).
  void address
}
