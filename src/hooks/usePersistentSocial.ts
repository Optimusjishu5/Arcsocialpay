'use client'

// ── Turso-backed persistent social feed (Next.js App Router) ─────────────────
// Same pattern as usePersistentChat: local appStore stays the realtime source
// of truth; this hook adds server persistence on top when Turso is configured:
//
//  1. On wallet connect: GET /api/posts + /api/comments + /api/profiles → import
//  2. Write-through: POST new/changed posts, profiles, comments (2s interval).
//     An item only counts as saved once the server acknowledged it, so a fresh post
//     is never treated as "deleted elsewhere" by a poll that started before it landed.
//  3. Incoming: re-GET all three every 4s so other users' activity appears
//     without a manual refresh (post deletes propagate the same way)
//  4. When Turso is NOT configured: silently no-op, localStorage path unchanged
//
// Mount once globally (App.tsx) — not per view — to avoid duplicate sync loops.

import { useEffect, useRef } from 'react'
import { appStore } from '@/store/appStore'
import type { Post, Comment, UserProfile } from '@/types/index'
import { reconcileWithServer } from '@/utils/socialSync'

/** A string field from untrusted JSON, or the fallback when it is not a string. */
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback)

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function toPost(raw: unknown): Post | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.id !== 'string') return null
  return {
    id: p.id,
    authorAddress: str(p.authorAddress),
    content: str(p.content),
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
    editedAt: typeof p.editedAt === 'number' ? p.editedAt : undefined,
    likeCount: typeof p.likeCount === 'number' ? p.likeCount : 0,
    commentCount: typeof p.commentCount === 'number' ? p.commentCount : 0,
    repostCount: typeof p.repostCount === 'number' ? p.repostCount : 0,
    repostOf: typeof p.repostOf === 'string' ? p.repostOf : undefined,
    likes: Array.isArray(p.likes) ? (p.likes as string[]) : [],
    reposts: Array.isArray(p.reposts) ? (p.reposts as string[]) : [],
  }
}

function toComment(raw: unknown): Comment | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string') return null
  return {
    id: c.id,
    postId: str(c.postId),
    authorAddress: str(c.authorAddress),
    content: str(c.content),
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
  }
}

function toProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.address !== 'string') return null
  return {
    address: p.address,
    username: str(p.username),
    bio: str(p.bio),
    avatarSeed: str(p.avatarSeed, p.address),
    avatarUrl: typeof p.avatarUrl === 'string' ? p.avatarUrl : '',
    accent: typeof p.accent === 'string' ? p.accent : '',
    followerCount: typeof p.followerCount === 'number' ? p.followerCount : 0,
    followingCount: typeof p.followingCount === 'number' ? p.followingCount : 0,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
  }
}

const POST_LIMIT = 200
const COMMENT_LIMIT = 500
const PROFILE_LIMIT = 500

export function usePersistentSocial(address: string | undefined) {
  const hydratedFor = useRef<string | null>(null)
  // Last version the server has of each post/profile (JSON). Posts and profiles are
  // mutable (likes, edits, renames), so re-POST only when the payload changed.
  const sentPosts = useRef<Map<string, string>>(new Map())
  const sentProfiles = useRef<Map<string, string>>(new Map())
  const sentComments = useRef<Set<string>>(new Set())
  // When the server acknowledged each item (ms), used to tell "not saved yet" from "deleted elsewhere".
  const postAckAt = useRef<Map<string, number>>(new Map())
  const commentAckAt = useRef<Map<string, number>>(new Map())
  const serverOff = useRef(false)
  const syncing = useRef(false)

  /** Merges one server snapshot into the app. Shared by the first load and the poll. */
  const applySnapshot = useRef((postJson: Record<string, unknown>, commentJson: Record<string, unknown>, profileJson: Record<string, unknown>, startedAt: number) => {
    const serverPosts = Array.isArray(postJson.posts)
      ? (postJson.posts as unknown[]).map(toPost).filter((p): p is Post => !!p)
      : []
    const serverComments = Array.isArray(commentJson.comments)
      ? (commentJson.comments as unknown[]).map(toComment).filter((c): c is Comment => !!c)
      : []
    const profiles = Array.isArray(profileJson.profiles)
      ? (profileJson.profiles as unknown[]).map(toProfile).filter((p): p is UserProfile => !!p)
      : []
    const state = appStore.getState()

    const posts = reconcileWithServer({
      server: serverPosts, local: state.posts, confirmedAt: postAckAt.current, startedAt,
      limit: POST_LIMIT, snapshots: sentPosts.current,
    })
    for (const id of posts.gone) { sentPosts.current.delete(id); postAckAt.current.delete(id) }
    appStore.importPosts(posts.items, posts.gone)
    for (const sp of serverPosts) {
      // Keep the snapshot of a post with unsent local changes, so those changes still get sent.
      const kept = posts.items.find((p) => p.id === sp.id)
      if (kept === sp || !sentPosts.current.has(sp.id)) sentPosts.current.set(sp.id, JSON.stringify(sp))
      postAckAt.current.set(sp.id, Math.max(postAckAt.current.get(sp.id) ?? 0, startedAt))
    }

    const comments = reconcileWithServer({
      server: serverComments, local: state.comments, confirmedAt: commentAckAt.current, startedAt, limit: COMMENT_LIMIT,
    })
    for (const id of comments.gone) { sentComments.current.delete(id); commentAckAt.current.delete(id) }
    appStore.importComments(comments.items, comments.gone)
    for (const c of serverComments) {
      sentComments.current.add(c.id)
      commentAckAt.current.set(c.id, Math.max(commentAckAt.current.get(c.id) ?? 0, startedAt))
    }

    const profileKeys = new Set(sentProfiles.current.keys())
    appStore.importProfiles(profiles, profileKeys)
    for (const p of profiles) {
      const key = p.address.toLowerCase()
      sentProfiles.current.set(key, JSON.stringify({ ...p, address: key }))
    }
  })

  /** Fetches everything and merges it. Returns false when the server is not set up or unreachable. */
  const pull = useRef(async (): Promise<boolean> => {
    const startedAt = Date.now()
    const [postRes, commentRes, profileRes] = await Promise.all([
      fetch(`/api/posts?limit=${POST_LIMIT}`),
      fetch(`/api/comments?limit=${COMMENT_LIMIT}`),
      fetch(`/api/profiles?limit=${PROFILE_LIMIT}`),
    ])
    if (!postRes.ok || !commentRes.ok || !profileRes.ok) return false
    const [postJson, commentJson, profileJson] = await Promise.all([safeJson(postRes), safeJson(commentRes), safeJson(profileRes)])
    if (postJson.configured === false || commentJson.configured === false || profileJson.configured === false) {
      serverOff.current = true // Turso not set: keep everything local-only
      return false
    }
    applySnapshot.current(postJson, commentJson, profileJson, startedAt)
    return true
  })

  // 1) Hydrate from Turso on connect
  useEffect(() => {
    if (!address) return
    if (hydratedFor.current === address.toLowerCase()) return
    hydratedFor.current = address.toLowerCase()
    void pull.current().catch(() => {
      // offline / server down: the local store remains usable
    })
  }, [address])

  // 2) Write-through: persist new/changed local posts, comments, profiles
  useEffect(() => {
    if (!address) return

    /** POSTs one item. Returns true only when the server saved it. */
    async function send(url: string, body: unknown): Promise<boolean> {
      try {
        const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
        if (res.status === 503) { serverOff.current = true; return false }
        return res.ok
      } catch {
        return false
      }
    }

    const sync = () => {
      if (serverOff.current || syncing.current) return
      syncing.current = true
      void (async () => {
        try {
          const state = appStore.getState()
          // Profiles (mutable: renames/bio edits re-POST on change)
          for (const profile of Object.values(state.profiles).slice(0, PROFILE_LIMIT)) {
            const key = profile.address.toLowerCase()
            const snap = JSON.stringify({ ...profile, address: key })
            if (sentProfiles.current.get(key) === snap) continue
            if (await send('/api/profiles', profile)) sentProfiles.current.set(key, snap)
          }
          // Posts (mutable: likes, edits, counts re-POST on change)
          const liveIds = new Set(state.posts.map((p) => p.id))
          for (const post of state.posts) {
            const snap = JSON.stringify(post)
            if (sentPosts.current.get(post.id) === snap) continue
            if (await send('/api/posts', post)) {
              sentPosts.current.set(post.id, snap)
              postAckAt.current.set(post.id, Date.now())
            }
          }
          // Post deletes propagate as DELETEs
          for (const id of [...sentPosts.current.keys()]) {
            if (liveIds.has(id)) continue
            try {
              const res = await fetch(`/api/posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
              if (!res.ok) continue
            } catch {
              continue
            }
            sentPosts.current.delete(id)
            postAckAt.current.delete(id)
          }
          // Comments are immutable: POST once
          for (const comment of state.comments) {
            if (sentComments.current.has(comment.id)) continue
            if (await send('/api/comments', comment)) {
              sentComments.current.add(comment.id)
              commentAckAt.current.set(comment.id, Date.now())
            }
          }
        } catch {
          // best-effort only
        } finally {
          syncing.current = false
        }
      })()
    }

    const iv = setInterval(sync, 2000)
    return () => clearInterval(iv)
  }, [address])

  // 3) Incoming: poll so other users' posts/comments/profiles appear live
  useEffect(() => {
    if (!address) return
    let inFlight = false

    const tick = () => {
      if (serverOff.current || inFlight) return
      inFlight = true
      void pull.current()
        .catch(() => {
          // offline / server down: retry on next tick
        })
        .finally(() => {
          inFlight = false
        })
    }

    tick()
    const iv = setInterval(tick, 4000)
    return () => clearInterval(iv)
  }, [address])
}
