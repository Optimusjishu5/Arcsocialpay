'use client'

// Alerts for messages that arrive while the app is open: a toast, a short buzz, a number in the tab
// title and, when the person allowed it, a system notification. It never runs on the server and it
// only announces a message once, even after a reload.

import { toast } from 'sonner'
import { getNotifRules } from '../hooks/useSettings'
import { appStore } from '../store/appStore'
import { formatAddress } from '../utils/format'

const SEEN_KEY = (me: string) => `socialpay:seen-msgs:v1:${me}`
const SEEN_MAX = 400
export const OPEN_CHAT_EVENT = 'socialpay:open-chat'

// ── Which messages were already announced ──────────────────────────────────

/** Ids of messages already announced for this wallet. Null the very first time: nothing has been announced yet. */
export function loadSeen(me: string): Set<string> | null {
  try {
    const raw = localStorage.getItem(SEEN_KEY(me))
    if (raw === null) return null
    const list = JSON.parse(raw) as unknown
    return new Set(Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveSeen(me: string, seen: Set<string>): void {
  try {
    localStorage.setItem(SEEN_KEY(me), JSON.stringify([...seen].slice(-SEEN_MAX)))
  } catch {
    /* storage unavailable: alerts may repeat after a reload */
  }
}

// ── Where the person is looking ────────────────────────────────────────────

let viewing: string | null = null
/** Called by the Messages screen: the conversation that is open on screen right now, or null. */
export function setViewingConversation(id: string | null): void {
  viewing = id
  if (id) setTitleBadge(0)
}
export const isViewing = (convId: string): boolean => viewing === convId && typeof document !== 'undefined' && document.visibilityState === 'visible'

// ── Tab title badge ────────────────────────────────────────────────────────

let baseTitle = ''
let unseen = 0
function setTitleBadge(n: number) {
  if (typeof document === 'undefined') return
  if (!baseTitle) baseTitle = document.title.replace(/^\(\d+\)\s*/, '')
  unseen = n
  document.title = n > 0 ? `(${n}) ${baseTitle}` : baseTitle
}
if (typeof window !== 'undefined') {
  const back = () => { if (document.visibilityState === 'visible') setTitleBadge(0) }
  document.addEventListener('visibilitychange', back)
  window.addEventListener('focus', back)
}

// ── System notifications (optional, needs the person's permission) ─────────

export type DeviceAlerts = 'unsupported' | 'default' | 'granted' | 'denied'
export function deviceAlertsState(): DeviceAlerts {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (!('serviceWorker' in navigator)) return null
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register('/sw.js'))
  } catch {
    return null
  }
}

/** Must be called from a tap. Asks the browser for permission to show message alerts. */
export async function enableDeviceAlerts(): Promise<DeviceAlerts> {
  if (deviceAlertsState() === 'unsupported') return 'unsupported'
  const result = await Notification.requestPermission()
  if (result === 'granted') void registration()
  return result
}

async function systemNotice(title: string, body: string, convId: string) {
  if (deviceAlertsState() !== 'granted' || document.visibilityState === 'visible') return
  const options = { body, tag: `chat-${convId}`, icon: '/icon-64.png', data: { convId } }
  const reg = await registration()
  try {
    if (reg) { await reg.showNotification(title, options); return }
    const n = new Notification(title, options)
    n.onclick = () => { window.focus(); openChat(convId); n.close() }
  } catch {
    /* some browsers refuse the constructor: the toast and title badge still work */
  }
}

// ── Announcing ─────────────────────────────────────────────────────────────

export function openChat(convId: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_CHAT_EVENT, { detail: { convId } }))
}

export interface IncomingMessage { convId: string; from: string; preview: string; count: number }

/** Shows every alert for a new message. Returns false when the person already has that chat open. */
export function announceMessage(m: IncomingMessage): boolean {
  if (isViewing(m.convId)) return false
  const name = appStore.getProfile(m.from)?.username || formatAddress(m.from)
  const body = m.count > 1 ? `${m.count} new messages. Latest: ${m.preview}` : m.preview
  // The person's own switch for message notifications is respected for every kind of alert.
  if (getNotifRules().message === false) return true
  toast(name, {
    description: body,
    duration: 7000,
    action: { label: 'Open', onClick: () => openChat(m.convId) },
  })
  try { navigator.vibrate?.(80) } catch { /* not supported */ }
  if (document.visibilityState !== 'visible') setTitleBadge(unseen + m.count)
  void systemNotice(name, body, m.convId)
  return true
}
