'use client'

// App settings stored locally in this browser (notification rules, payment approval limit).

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { NotifType, Notification } from '../types/index'
import { DEFAULT_LIMIT, parseLimit } from '../utils/approval'

const STORAGE_KEY = 'socialpay:settings:v1'
const listeners = new Set<() => void>()

export const NOTIF_RULES: { type: NotifType; label: string; hint: string }[] = [
  { type: 'payment', label: 'Payments', hint: 'Money you receive' },
  { type: 'message', label: 'Messages', hint: 'New chat messages' },
  { type: 'like', label: 'Likes', hint: 'Someone likes your post' },
  { type: 'comment', label: 'Comments', hint: 'Replies on your posts' },
  { type: 'repost', label: 'Reposts', hint: 'Someone reposts you' },
  { type: 'follow', label: 'New followers', hint: 'Someone follows you' },
  { type: 'mention', label: 'Mentions', hint: 'Someone mentions you' },
]

export type NotifRules = Record<NotifType, boolean>

const DEFAULT_RULES: NotifRules = {
  payment: true, message: true, like: true, comment: true, repost: true, follow: true, mention: true,
}

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? ''
  } catch {
    return ''
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb)
  window.addEventListener('storage', cb)
  return () => {
    listeners.delete(cb)
    window.removeEventListener('storage', cb)
  }
}

interface Stored { rules?: Partial<NotifRules>; allowanceLimit?: string }

function parseStored(raw: string): Stored {
  try {
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    return {}
  }
}

function parseRules(raw: string): NotifRules {
  return { ...DEFAULT_RULES, ...(parseStored(raw).rules ?? {}) }
}

/** The saved approval limit ("exact" or a USDC amount); falls back to the default when missing or invalid. */
function parseAllowance(raw: string): string {
  const v = parseStored(raw).allowanceLimit
  const p = typeof v === 'string' ? parseLimit(v) : null
  return p?.ok ? p.value : DEFAULT_LIMIT
}

function save(patch: Stored) {
  try {
    const cur = parseStored(readRaw())
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...patch }))
  } catch {
    // storage unavailable: setting just won't persist
  }
  listeners.forEach((l) => l())
}

export function useSettings() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '')
  const rules = useMemo(() => parseRules(raw), [raw])
  const allowanceLimit = useMemo(() => parseAllowance(raw), [raw])

  const setRule = useCallback((type: NotifType, enabled: boolean) => {
    save({ rules: { ...parseRules(readRaw()), [type]: enabled } })
  }, [])

  /** Saves how much USDC to approve the contract for at once. Returns false when the value is not valid. */
  const setAllowanceLimit = useCallback((value: string): boolean => {
    const p = parseLimit(value)
    if (!p.ok) return false
    save({ allowanceLimit: p.value })
    return true
  }, [])

  /** Hide notification types the user turned off. */
  const filterNotifications = useCallback(
    (list: Notification[]) => list.filter((n) => rules[n.type] !== false),
    [rules],
  )

  return { rules, setRule, filterNotifications, allowanceLimit, setAllowanceLimit }
}
