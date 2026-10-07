'use client'

// ── Turso-backed persistent social feed (Next.js App Router) ─────────────────
// Same pattern as usePersistentChat: local appStore stays the realtime source
// of truth; this hook adds server persistence on top when Turso is configured:
//
//  1. On wallet connect: GET /api/posts + /api/comments + /api/profiles → import
//  2. Write-through: POST new/changed posts, profiles, comments (2s interval)
//  3. Incoming: re-GET all three every 4s so other users' activity appears
//     without a manual refresh (post deletes propagate the same way)
//  4. When Turso is NOT configured: silently no-op, localStorage path unchanged
//
// Mount once globally (App.tsx) — not per view — to avoid duplicate sync loops.

import { useEffect, useRef } from 'react'
import { appStore } from '@/store/appStore'
import type { Post, Comment, UserProfile } from '@/types/index'

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
    authorAddress: String(p.authorAddress ?? ''),
    content: String(p.content ?? ''),
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
    postId: String(c.postId ?? ''),
    authorAddress: String(c.authorAddress ?? ''),
    content: String(c.content ?? ''),
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
  }
}

function toProfile(raw: unknown): UserProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const p = raw as Record<string, unknown>
  if (typeof p.address !== 'string') return null
  return {
    address: p.address,
    username: String(p.username ?? ''),
    bio: String(p.bio ?? ''),
    avatarSeed: String(p.avatarSeed ?? p.address),
    followerCount: typeof p.followerCount === 'number' ? p.followerCount : 0,
    followingCount: typeof p.followingCount === 'number' ? p.followingCount : 0,
    createdAt: typeof p.createdAt === 'number' ? p.createdAt : Date.now(),
  }
}

export function usePersistentSocial(address: string | undefined) {
  const hydratedFor = useRef<string | null>(null)
  // Last-sent snapshots: posts/profiles are mutable (likes, edits, renames),
  // so re-POST only when the payload actually changed.
  const sentPosts = useRef<Map<string, string>>(new Map())
  const sentProfiles = useRef<Map<string, string>>(new Map())
  const sentComments = useRef<Set<string>>(new Set())

  // 1) Hydrate from Turso on connect
  useEffect(() => {
    if (!address) return
    if (hydratedFor.current === address.toLowerCase()) return
    hydratedFor.current = address.toLowerCase()
    let cancelled = false

    void (async () => {
      try {
        const [postRes, commentRes, profileRes] = await Promise.all([
          fetch('/api/posts?limit=200'),
          fetch('/api/comments?limit=500'),
          fetch('/api/profiles?limit=500'),
        ])
        if (cancelled) return
        if (!postRes.ok || !commentRes.ok || !profileRes.ok) return
        const [postJson, commentJson, profileJson] = await Promise.all([
          safeJson(postRes),
          safeJson(commentRes),
          safeJson(profileRes),
        ])
        if (cancelled) return
        if (
          postJson.configured === false ||
          commentJson.configured === false ||
          profileJson.configured === false
        ) {
          return // Turso not set — keep local-only
        }
        const posts = Array.isArray(postJson.posts)
          ? (postJson.posts as unknown[]).map(toPost).filter((p): p is Post => !!p)
          : []
        const comments = Array.isArray(commentJson.comments)
          ? (commentJson.comments as unknown[]).map(toComment).filter((c): c is Comment => !!c)
          : []
        const profiles = Array.isArray(profileJson.profiles)
          ? (profileJson.profiles as unknown[]).map(toProfile).filter((p): p is UserProfile => !!p)
          : []
        appStore.importPosts(posts, new Set(sentPosts.current.keys()))
        appStore.importComments(comments, sentComments.current)
        const profileKeys = new Set(sentProfiles.current.keys())
        appStore.importProfiles(profiles, profileKeys)
        for (const p of posts) sentPosts.current.set(p.id, JSON.stringify(p))
        for (const c of comments) sentComments.current.add(c.id)
        for (const p of profiles) {
          const key = p.address.toLowerCase()
          profileKeys.add(key)
          sentProfiles.current.set(key, JSON.stringify({ ...p, address: key }))
        }
      } catch {
        // offline / server down — local store remains usable
      }
    })()

    return () => {
      cancelled = true
    }
  }, [address])

  // 2) Write-through: persist new/changed local posts, comments, profiles
  useEffect(() => {
    if (!address) return

    const sync = () => {
      void (async () => {
        try {
          const state = appStore.getState()
          // Profiles (mutable: renames/bio edits re-POST on change)
          for (const profile of Object.values(state.profiles).slice(0, 500)) {
            const key = profile.address.toLowerCase()
            const snap = JSON.stringify({ ...profile, address: key })
            if (sentProfiles.current.get(key) === snap) continue
            sentProfiles.current.set(key, snap)
            await fetch('/api/profiles', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(profile),
            }).catch(() => {
              sentProfiles.current.delete(key)
            })
          }
          // Posts (mutable: likes, edits, counts re-POST on change)
          const liveIds = new Set<string>()
          for (const post of state.posts.slice(0, 200)) {
            liveIds.add(post.id)
            const snap = JSON.stringify(post)
            if (sentPosts.current.get(post.id) === snap) continue
            sentPosts.current.set(post.id, snap)
            await fetch('/api/posts', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(post),
            }).catch(() => {
              sentPosts.current.delete(post.id)
            })
          }
          // Post deletes propagate as DELETEs
          for (const id of [...sentPosts.current.keys()]) {
            if (liveIds.has(id)) continue
            sentPosts.current.delete(id)
            await fetch(`/api/posts?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(
              () => {},
            )
          }
          // Comments are immutable — POST once
          for (const comment of state.comments.slice(-200)) {
            if (sentComments.current.has(comment.id)) continue
            sentComments.current.add(comment.id)
            await fetch('/api/comments', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(comment),
            }).catch(() => {
              sentComments.current.delete(comment.id)
            })
          }
        } catch {
          // best-effort only
        }
      })()
    }

    const iv = setInterval(sync, 2000)
    return () => clearInterval(iv)
  }, [address])

  // 3) Incoming: poll so other users' posts/comments/profiles appear live
  useEffect(() => {
    if (!address) return
    let disabled = false
    let inFlight = false

    const tick = () => {
      if (disabled || inFlight) return
      inFlight = true
      void (async () => {
        try {
          const [postRes, commentRes, profileRes] = await Promise.all([
            fetch('/api/posts?limit=200'),
            fetch('/api/comments?limit=500'),
            fetch('/api/profiles?limit=500'),
          ])
          if (!postRes.ok || !commentRes.ok || !profileRes.ok) return
          const [postJson, commentJson, profileJson] = await Promise.all([
            safeJson(postRes),
            safeJson(commentRes),
            safeJson(profileRes),
          ])
          if (
            postJson.configured === false ||
            commentJson.configured === false ||
            profileJson.configured === false
          ) {
            disabled = true
            return
          }
          const posts = Array.isArray(postJson.posts)
            ? (postJson.posts as unknown[]).map(toPost).filter((p): p is Post => !!p)
            : []
          const comments = Array.isArray(commentJson.comments)
            ? (commentJson.comments as unknown[]).map(toComment).filter((c): c is Comment => !!c)
            : []
          const profiles = Array.isArray(profileJson.profiles)
            ? (profileJson.profiles as unknown[]).map(toProfile).filter((p): p is UserProfile => !!p)
            : []
          appStore.importPosts(posts, new Set(sentPosts.current.keys()))
          appStore.importComments(comments, sentComments.current)
          appStore.importProfiles(profiles, new Set(sentProfiles.current.keys()))
          for (const p of posts) sentPosts.current.set(p.id, JSON.stringify(p))
          for (const c of comments) sentComments.current.add(c.id)
          for (const p of profiles) {
            const key = p.address.toLowerCase()
            sentProfiles.current.set(key, JSON.stringify({ ...p, address: key }))
          }
        } catch {
          // offline / server down — retry on next tick
        } finally {
          inFlight = false
        }
      })()
    }

    tick()
    const iv = setInterval(tick, 4000)
    return () => clearInterval(iv)
  }, [address])
}
