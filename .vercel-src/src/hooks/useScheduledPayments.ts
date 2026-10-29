'use client'

// Recurring / scheduled payment reminders, stored locally per browser.
// Payments are never sent automatically: when one is due, the wallet owner
// reviews and signs it themselves.

import { useCallback, useMemo, useSyncExternalStore } from 'react'
import { advanceDue, type ScheduledPayment } from '../utils/payRequests'
import { generateId } from '../utils/format'

const STORAGE_KEY = 'socialpay:scheduled:v1'
const listeners = new Set<() => void>()

function readRaw(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '[]'
  } catch {
    return '[]'
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

function parse(raw: string): ScheduledPayment[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ScheduledPayment[]) : []
  } catch {
    return []
  }
}

function write(items: ScheduledPayment[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // storage unavailable: reminders just won't persist
  }
  listeners.forEach((l) => l())
}

export function useScheduledPayments(owner: string | undefined) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '[]')

  const items = useMemo(
    () =>
      parse(raw)
        .filter((s) => owner && s.owner.toLowerCase() === owner.toLowerCase())
        .sort((a, b) => a.nextDue - b.nextDue),
    [raw, owner],
  )

  const add = useCallback((input: Omit<ScheduledPayment, 'id'>) => {
    write([...parse(readRaw()), { ...input, id: generateId() }])
  }, [])

  const remove = useCallback((id: string) => {
    write(parse(readRaw()).filter((s) => s.id !== id))
  }, [])

  /** Call after a scheduled payment was sent: drop one-offs, roll recurring forward. */
  const markPaid = useCallback((id: string) => {
    write(
      parse(readRaw()).flatMap((s) => {
        if (s.id !== id) return [s]
        if (s.frequency === 'once') return []
        return [{ ...s, nextDue: advanceDue(s.nextDue, s.frequency) }]
      }),
    )
  }, [])

  return { items, add, remove, markPaid }
}
