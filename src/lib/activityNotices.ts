// Works out what is new for a wallet from the data the app already holds: payments received, likes,
// reposts, comments, mentions and new followers. Pure, so it can be tested without a browser.
import type { Comment, NotifType, Post, TxRecord } from '../types/index'

export interface NoticeState {
  /** Items created before this moment (ms) are treated as already known. */
  since: number
  /** Keys of everything already announced or recorded as known. */
  seen: string[]
  /** Likes and reposts have no date, so the first look only records them. */
  baselined: boolean
  /** Follower count at the last look, or null before the first look. */
  followers: number | null
}

export interface NoticeInput {
  me: string
  myUsername?: string
  posts: Post[]
  comments: Comment[]
  txHistory: TxRecord[]
  /** Payment cards already shown as chat messages (their notification is the message one). */
  chatPaymentHashes: Set<string>
  followerCount: number
  /** The server's posts, comments and profiles have been loaded at least once. */
  socialReady: boolean
  now: number
}

export interface Notice {
  key: string
  type: NotifType
  from: string
  targetId?: string
  content?: string
  at: number
  /** Follower notices have no single person behind them. */
  count?: number
}

const SEEN_MAX = 1500
export const FIRST_LOOK_WINDOW_MS = 24 * 60 * 60 * 1000
const lc = (s: string) => s.toLowerCase()

export function freshState(now: number): NoticeState {
  return { since: now - FIRST_LOOK_WINDOW_MS, seen: [], baselined: false, followers: null }
}

const preview = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 120)

function mentions(content: string, username: string | undefined): boolean {
  if (!username) return false
  const name = username.replace(/^@/, '').trim()
  if (name.length < 2) return false
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w])@${escaped}(?![\\w])`, 'i').test(content)
}

export function findNewNotices(input: NoticeInput, previous: NoticeState): { notices: Notice[]; state: NoticeState } {
  const me = lc(input.me)
  const seen = new Set(previous.seen)
  const out: Notice[] = []
  let baselined = previous.baselined
  let followers = previous.followers

  const add = (n: Notice) => {
    if (seen.has(n.key)) return
    seen.add(n.key)
    out.push(n)
  }

  // Payments received (a payment card sent in chat is announced as a message instead).
  for (const r of input.txHistory) {
    if (r.direction !== 'received' || lc(r.toAddress) !== me || lc(r.fromAddress) === me) continue
    if (r.kind && r.kind !== 'payment') continue
    if (r.status === 'failed' || r.status === 'cancelled') continue
    const key = `payment:${lc(r.txHash)}`
    if (seen.has(key)) continue
    if (r.timestamp <= previous.since) continue
    if (input.chatPaymentHashes.has(lc(r.txHash))) { seen.add(key); continue }
    add({ key, type: 'payment', from: r.fromAddress, targetId: r.txHash, content: `${r.amount} ${r.symbol || 'USDC'}`, at: r.timestamp })
  }

  if (input.socialReady) {
    const mine = new Set(input.posts.filter((p) => lc(p.authorAddress) === me).map((p) => p.id))
    const commentedKeys = new Set<string>()

    // Comments on my posts.
    for (const c of input.comments) {
      if (!mine.has(c.postId) || lc(c.authorAddress) === me || c.createdAt <= previous.since) continue
      const key = `comment:${c.id}`
      if (seen.has(key)) continue
      commentedKeys.add(c.id)
      add({ key, type: 'comment', from: c.authorAddress, targetId: c.postId, content: preview(c.content), at: c.createdAt })
    }

    // Mentions in other people's posts and comments.
    for (const p of input.posts) {
      if (lc(p.authorAddress) === me || p.createdAt <= previous.since || !mentions(p.content, input.myUsername)) continue
      add({ key: `mention:post:${p.id}`, type: 'mention', from: p.authorAddress, targetId: p.id, content: preview(p.content), at: p.createdAt })
    }
    for (const c of input.comments) {
      if (lc(c.authorAddress) === me || c.createdAt <= previous.since || commentedKeys.has(c.id) || !mentions(c.content, input.myUsername)) continue
      add({ key: `mention:comment:${c.id}`, type: 'mention', from: c.authorAddress, targetId: c.postId, content: preview(c.content), at: c.createdAt })
    }

    // Likes and reposts have no date: the first look records what is there, later looks announce what is new.
    const reactions: Notice[] = []
    for (const p of input.posts) {
      if (lc(p.authorAddress) !== me) continue
      for (const a of p.likes ?? []) if (lc(a) !== me) reactions.push({ key: `like:${p.id}:${lc(a)}`, type: 'like', from: a, targetId: p.id, content: preview(p.content), at: input.now })
      for (const a of p.reposts ?? []) if (lc(a) !== me) reactions.push({ key: `repost:${p.id}:${lc(a)}`, type: 'repost', from: a, targetId: p.id, content: preview(p.content), at: input.now })
    }
    if (!baselined) {
      for (const n of reactions) seen.add(n.key)
      baselined = true
    } else {
      for (const n of reactions) add(n)
    }

    // New followers: only the count is shared between devices, so the person is not named.
    if (followers === null) followers = input.followerCount
    else if (input.followerCount > followers) {
      const gained = input.followerCount - followers
      out.push({ key: `follow:${input.followerCount}`, type: 'follow', from: input.me, count: gained, content: gained > 1 ? `${gained} new followers` : undefined, at: input.now })
      followers = input.followerCount
    } else if (input.followerCount < followers) {
      followers = input.followerCount
    }
  }

  return {
    notices: out.sort((a, b) => a.at - b.at),
    state: { since: previous.since, seen: [...seen].slice(-SEEN_MAX), baselined, followers },
  }
}
