'use client'

// Real follower and following counts for a wallet, from the server. Null until the server has answered
// (or when the server is off), so the screen can fall back to what this device knows.

import { useEffect, useState } from 'react'
import { authedFetch, readSession } from '../lib/chatSession'
import { FOLLOW_CHANGED_EVENT } from './useFollowSync'

export interface FollowStats { followers: number; following: number; youFollow: boolean }

export function useFollowStats(me: string | undefined, target: string | undefined): FollowStats | null {
  const [state, setState] = useState<{ key: string; stats: FollowStats } | null>(null)
  const key = me && target ? `${me.toLowerCase()}|${target.toLowerCase()}` : ''

  useEffect(() => {
    if (!me || !target) return
    let cancelled = false
    const load = async () => {
      const session = readSession(me)
      if (!session) return
      try {
        const res = await authedFetch(session, `/api/follows?address=${encodeURIComponent(target)}`)
        if (!res.ok) return
        const j = (await res.json()) as { configured?: boolean } & Partial<FollowStats>
        if (cancelled || j.configured === false || typeof j.followers !== 'number') return
        setState({ key, stats: { followers: j.followers, following: j.following ?? 0, youFollow: !!j.youFollow } })
      } catch {
        /* offline: keep showing what this device knows */
      }
    }
    void load()
    const iv = setInterval(() => void load(), 10_000)
    // Right after a follow or unfollow the change is sent first, then the counts are read again.
    let t: ReturnType<typeof setTimeout> | undefined
    const changed = () => { clearTimeout(t); t = setTimeout(() => void load(), 1200) }
    window.addEventListener(FOLLOW_CHANGED_EVENT, changed)
    return () => { cancelled = true; clearInterval(iv); clearTimeout(t); window.removeEventListener(FOLLOW_CHANGED_EVENT, changed) }
  }, [me, target, key])

  return state && state.key === key ? state.stats : null
}
