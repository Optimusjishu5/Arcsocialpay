'use client'

// Shares who follows whom through the server, so a new follower can be named in Notifications.
// Your own follows are sent up, and the list of people following you is loaded every few seconds.

import { useEffect } from 'react'
import { appStore } from '../store/appStore'
import { authedFetch, readSession } from '../lib/chatSession'
import { clearFollowers, setFollowers } from '../lib/followers'

const POLL_MS = 6000
/** Fired after the person follows or unfollows someone. */
export const FOLLOW_CHANGED_EVENT = 'socialpay:follow-changed'
const lc = (s: string) => s.toLowerCase()

export function useFollowSync(address: string | undefined) {
  useEffect(() => {
    if (!address) { clearFollowers(); return }
    const me = lc(address)
    let cancelled = false
    let busy = false
    let off = false
    const pushed = new Set<string>()

    const tick = async () => {
      if (busy || off || document.visibilityState === 'hidden') return
      const session = readSession(address)
      if (!session) return
      busy = true
      try {
        // Send follows and unfollows made on this device.
        const s = appStore.getState()
        const key = Object.keys(s.followMap).find((k) => lc(k) === me)
        const mine = new Set((key ? s.followMap[key] : []).map(lc))
        const changes: Array<[string, boolean]> = []
        for (const t of mine) if (!pushed.has(t) && t !== me) changes.push([t, true])
        for (const t of pushed) if (!mine.has(t)) changes.push([t, false])
        for (const [target, follow] of changes) {
          const res = await authedFetch(session, '/api/follows', {
            method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ target, follow }),
          })
          if (res.status === 503) { off = true; return }
          if (!res.ok) break
          if (follow) pushed.add(target); else pushed.delete(target)
        }
        // Load who follows you.
        const res = await authedFetch(session, '/api/follows')
        if (!res.ok) return
        const json = (await res.json()) as { configured?: boolean; followers?: { address?: unknown }[]; following?: unknown[] }
        if (json.configured === false) { off = true; return }
        if (cancelled) return
        // Follows made on another device show up here too, except those this device is just undoing.
        const theirs = (json.following ?? []).filter((x): x is string => typeof x === 'string')
        const undoing = new Set(changes.filter(([, follow]) => !follow).map(([t]) => t))
        const toImport = theirs.filter((a) => !undoing.has(lc(a)))
        if (toImport.length > 0) appStore.importFollowing(address, toImport)
        // What the server holds now, so a later unfollow of any of these is sent too.
        pushed.clear()
        for (const t of theirs) pushed.add(lc(t))
        const list = (json.followers ?? []).map((f) => (typeof f.address === 'string' ? f.address : '')).filter(Boolean)
        setFollowers(address, list)
        window.dispatchEvent(new Event('socialpay:followers-synced'))
      } catch {
        /* offline: try again next time */
      } finally {
        busy = false
      }
    }

    void tick()
    const iv = setInterval(() => void tick(), POLL_MS)
    // Following or unfollowing someone sends the change straight away.
    const now = () => void tick()
    window.addEventListener(FOLLOW_CHANGED_EVENT, now)
    return () => { cancelled = true; clearInterval(iv); window.removeEventListener(FOLLOW_CHANGED_EVENT, now) }
  }, [address])
}
