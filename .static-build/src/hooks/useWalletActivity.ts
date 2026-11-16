'use client'

// One source for "what happened in this wallet", used by the Dashboard, Pay and Activity
// screens so they always agree: the same transactions, the same details, the same order.

import { useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useSettings } from './useSettings'
import { useCachedRecords } from '../lib/activityCache'
import { buildEntries, mergeWalletTransactions, type Entry } from '../components/activity/entries'
import type { TxRecord } from '../types/index'

export interface WalletActivity {
  /** Every transaction of the wallet, newest first. */
  transactions: TxRecord[]
  /** Transactions plus social activity, newest first. */
  entries: Entry[]
}

export function useWalletActivity(address: string | undefined): WalletActivity {
  const { txHistory, posts, comments, notifications } = useAppStore()
  const { filterNotifications } = useSettings()
  const saved = useCachedRecords(address)

  const transactions = useMemo(
    () => mergeWalletTransactions(address, txHistory, saved.map((r) => ({ ...r, id: `chain-${r.txHash}` }))),
    [address, txHistory, saved],
  )
  const entries = useMemo(
    () => (address ? buildEntries({ address, txHistory: transactions, posts, comments, notifications: filterNotifications(notifications) }) : []),
    [address, transactions, posts, comments, notifications, filterNotifications],
  )
  return { transactions, entries }
}
