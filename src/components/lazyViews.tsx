'use client'

// Each screen loads in its own piece, so the first paint only carries the dashboard.
// After the dashboard is on screen the remaining pieces download quietly in the background,
// which makes the first tap on any tab open instantly.

import { lazy } from 'react'
import type { NavView } from '../types/index'

const loaders = {
  messages: () => import('./MessagesView'),
  pay: () => import('./PayView'),
  explore: () => import('./SocialFeed'),
  swap: () => import('./SwapView'),
  bridge: () => import('./BridgeView'),
  activity: () => import('./ActivityView'),
  settings: () => import('./SettingsView'),
  notifications: () => import('./NotificationsView'),
  profile: () => import('./ProfileView'),
} as const

export const MessagesView = lazy(() => loaders.messages().then((m) => ({ default: m.MessagesView })))
export const PayView = lazy(() => loaders.pay().then((m) => ({ default: m.PayView })))
export const SocialFeed = lazy(() => loaders.explore().then((m) => ({ default: m.SocialFeed })))
export const SwapView = lazy(() => loaders.swap().then((m) => ({ default: m.SwapView })))
export const BridgeView = lazy(() => loaders.bridge().then((m) => ({ default: m.BridgeView })))
export const ActivityView = lazy(() => loaders.activity().then((m) => ({ default: m.ActivityView })))
export const SettingsView = lazy(() => loaders.settings().then((m) => ({ default: m.SettingsView })))
export const NotificationsView = lazy(() => loaders.notifications().then((m) => ({ default: m.NotificationsView })))
export const ProfileView = lazy(() => loaders.profile().then((m) => ({ default: m.ProfileView })))

/** Start downloading one screen (safe to call many times; the browser keeps the result). */
export function prefetchView(view: NavView): void {
  if (view === 'home') return
  void loaders[view]().catch(() => {})
}

// Most used first, so they are ready earliest.
const PREFETCH_ORDER: NavView[] = ['pay', 'messages', 'activity', 'explore', 'swap', 'bridge', 'profile', 'notifications', 'settings']

/** Download every screen one at a time while the browser is idle. Returns a function that stops it. */
export function prefetchAllViews(): () => void {
  let stopped = false
  let index = 0
  const idle: (cb: () => void) => void =
    typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (cb) => { window.requestIdleCallback(cb, { timeout: 2500 }) }
      : (cb) => { setTimeout(cb, 400) }
  const next = () => {
    if (stopped || index >= PREFETCH_ORDER.length) return
    prefetchView(PREFETCH_ORDER[index++])
    idle(next)
  }
  // Wait a moment so the dashboard and balance get the network first.
  const start = setTimeout(() => idle(next), 1200)
  return () => { stopped = true; clearTimeout(start) }
}
