'use client'

// Turns what happens to a wallet (payments received, likes, reposts, comments, mentions, new followers)
// into entries in the Notifications list, the bell count and a toast. Mount once, in App.

import { useCallback, useEffect, useRef } from 'react'
import { appStore, useAppStore } from '../store/appStore'
import { announceNotice } from '../lib/incomingAlerts'
import { getFollowers } from '../lib/followers'
import { findNewNotices, freshState, type Notice, type NoticeState } from '../lib/activityNotices'
import { getNotifRules } from './useSettings'
import { formatAddress } from '../utils/format'

/** Fired by the social sync each time it has loaded posts, comments and profiles from the server. */
export const SOCIAL_SYNCED_EVENT = 'socialpay:social-synced'

const KEY = (me: string) => `socialpay:notices:v1:${me.toLowerCase()}`

function load(me: string, now: number): NoticeState {
  try {
    const raw = localStorage.getItem(KEY(me))
    if (raw) {
      const s = JSON.parse(raw) as Partial<NoticeState>
      if (typeof s.since === 'number' && Array.isArray(s.seen)) {
        return { since: s.since, seen: s.seen.filter((x): x is string => typeof x === 'string'), baselined: !!s.baselined, followers: typeof s.followers === 'number' ? s.followers : null, followerAddrs: Array.isArray(s.followerAddrs) ? s.followerAddrs.filter((x): x is string => typeof x === 'string') : null }
      }
    }
  } catch { /* fall through to a fresh start */ }
  return freshState(now)
}

function save(me: string, s: NoticeState) {
  try { localStorage.setItem(KEY(me), JSON.stringify(s)) } catch { /* storage unavailable: notices may repeat after a reload */ }
}

function words(n: Notice, name: string): { title: string; body: string } {
  switch (n.type) {
    case 'payment': return { title: `${name} sent you ${n.content ?? 'USDC'}`, body: '' }
    case 'like': return { title: `${name} liked your post`, body: n.content ?? '' }
    case 'repost': return { title: `${name} reposted your post`, body: n.content ?? '' }
    case 'comment': return { title: `${name} commented on your post`, body: n.content ?? '' }
    case 'mention': return { title: `${name} mentioned you`, body: n.content ?? '' }
    case 'follow': return n.count === undefined ? { title: `${name} started following you`, body: '' } : { title: (n.count ?? 1) > 1 ? `${n.count} new followers` : 'You have a new follower', body: '' }
    default: return { title: name, body: n.content ?? '' }
  }
}

export function useActivityNotices(address: string | undefined) {
  const { posts, comments, txHistory, profiles } = useAppStore()
  const addressRef = useRef(address)
  const readyFor = useRef<string | null>(null)

  const check = useCallback(() => {
    const me = addressRef.current
    if (!me) return
    const key = me.toLowerCase()
    const now = Date.now()
    const s = appStore.getState()
    const profile = s.profiles[key] ?? s.profiles[me]
    const chatPaymentHashes = new Set<string>()
    for (const list of Object.values(s.messages)) for (const m of list) if (m.paymentTx?.txHash) chatPaymentHashes.add(m.paymentTx.txHash.toLowerCase())
    const before = load(me, now)
    const { notices, state } = findNewNotices({
      me, myUsername: profile?.username, posts: s.posts, comments: s.comments, txHistory: s.txHistory,
      chatPaymentHashes, followerCount: profile?.followerCount ?? 0, followerAddrs: getFollowers(me), socialReady: readyFor.current === key, now,
    }, before)
    if (notices.length === 0 && JSON.stringify(state) === JSON.stringify(before)) { if (!localStorage.getItem(KEY(me))) save(me, state); return }
    save(me, state)
    const rules = getNotifRules()
    for (const n of notices) {
      appStore.addNotification({ type: n.type, fromAddress: n.from, targetId: n.targetId, content: n.content, createdAt: n.at })
      const name = appStore.getProfile(n.from)?.username || formatAddress(n.from)
      const { title, body } = words(n, name)
      announceNotice(title, body, rules[n.type] !== false)
    }
  }, [])

  useEffect(() => {
    addressRef.current = address
    readyFor.current = null
  }, [address])

  useEffect(() => {
    const onSynced = () => {
      readyFor.current = addressRef.current?.toLowerCase() ?? null
      check()
    }
    window.addEventListener(SOCIAL_SYNCED_EVENT, onSynced)
    window.addEventListener('socialpay:followers-synced', check)
    return () => {
      window.removeEventListener(SOCIAL_SYNCED_EVENT, onSynced)
      window.removeEventListener('socialpay:followers-synced', check)
    }
  }, [check])

  // Payments arrive through the transaction history; check whenever anything in the app's data changes.
  useEffect(() => { check() }, [check, address, posts, comments, txHistory, profiles])
}
