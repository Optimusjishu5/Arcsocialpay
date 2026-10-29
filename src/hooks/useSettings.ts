'use client'

// App settings stored locally in this browser (notification rules).

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { NotifType, Notification } from '../types/index'

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

function parseRules(raw: string): NotifRules {
  try {
    const parsed = raw ? (JSON.parse(raw) as { rules?: Partial<NotifRules> }) : {}
    return { ...DEFAULT_RULES, ...(parsed.rules ?? {}) }
  } catch {
    return DEFAULT_RULES
  }
}

export function useSettings() {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '')
  const rules = useMemo(() => parseRules(raw), [raw])

  const setRule = useCallback((type: NotifType, enabled: boolean) => {
    const next = { ...parseRules(readRaw()), [type]: enabled }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ rules: next }))
    } catch {
      // storage unavailable: setting just won't persist
    }
    listeners.forEach((l) => l())
  }, [])

  /** Hide notification types the user turned off. */
  const filterNotifications = useCallback(
    (list: Notification[]) => list.filter((n) => rules[n.type] !== false),
    [rules],
  )

  return { rules, setRule, filterNotifications }
}
