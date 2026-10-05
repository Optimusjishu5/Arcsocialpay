// ── Application state store (in-memory + localStorage persistence) ──────────
// Messaging, social, groups, profiles, and notifications are off-chain app
// data stored locally. All financial transactions go through the real blockchain.

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { getAddress } from 'viem'
import type {
  UserProfile, Post, Comment, Message, Conversation,
  Group, TxRecord, Notification, PaymentMessage,
} from '../types/index'
import { generateId } from '../utils/format'

const STORAGE_KEY = 'arc-socialpay-v1'
const STORE_VERSION = 1

// ── Address helpers (normalize on ingress, compare case-insensitively) ─────

function normalizeAddress(addr: string): string {
  if (!addr) return addr
  try {
    return getAddress(addr)
  } catch {
    return addr.toLowerCase()
  }
}

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  try {
    return getAddress(a) === getAddress(b)
  } catch {
    return a.toLowerCase() === b.toLowerCase()
  }
}

function includesAddress(list: readonly string[] | undefined, addr: string): boolean {
  if (!list || !addr) return false
  return list.some((x) => sameAddress(x, addr))
}

interface AppState {
  version: number
  profiles: Record<string, UserProfile>
  posts: Post[]
  comments: Comment[]
  conversations: Conversation[]
  messages: Record<string, Message[]> // conversationId -> messages
  groups: Group[]
  txHistory: TxRecord[]
  notifications: Notification[]
  followMap: Record<string, string[]> // address -> following addresses
  theme: 'light' | 'dark'
  currentUserAddress: string | null
}

function defaultState(): AppState {
  return {
    version: STORE_VERSION,
    profiles: {},
    posts: [],
    comments: [],
    conversations: [],
    messages: {},
    groups: [],
    txHistory: [],
    notifications: [],
    followMap: {},
    theme: 'dark',
    currentUserAddress: null,
  }
}

function loadState(): AppState {
  const fallback = defaultState()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<AppState> & Record<string, unknown>
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback
    // Version key: reject future/unknown versions, migrate missing version.
    if (parsed.version !== undefined && parsed.version !== STORE_VERSION) return fallback
    const profilesValid =
      parsed.profiles && typeof parsed.profiles === 'object' && !Array.isArray(parsed.profiles)
    const messagesValid =
      parsed.messages && typeof parsed.messages === 'object' && !Array.isArray(parsed.messages)
    const followMapValid =
      parsed.followMap && typeof parsed.followMap === 'object' && !Array.isArray(parsed.followMap)
    const groupsRaw = Array.isArray(parsed.groups) ? parsed.groups : []
    return {
      version: STORE_VERSION,
      profiles: profilesValid ? (parsed.profiles as AppState['profiles']) : {},
      posts: Array.isArray(parsed.posts) ? (parsed.posts as AppState['posts']) : [],
      comments: Array.isArray(parsed.comments) ? (parsed.comments as AppState['comments']) : [],
      conversations: Array.isArray(parsed.conversations)
        ? (parsed.conversations as AppState['conversations'])
        : [],
      messages: messagesValid ? (parsed.messages as AppState['messages']) : {},
      groups: groupsRaw
        .filter((g): g is Group => !!g && typeof g === 'object')
        .map((g) => ({
          ...g,
          invitedAddresses: Array.isArray((g as Group).invitedAddresses)
            ? (g as Group).invitedAddresses
            : [],
        })),
      txHistory: Array.isArray(parsed.txHistory) ? (parsed.txHistory as AppState['txHistory']) : [],
      notifications: Array.isArray(parsed.notifications)
        ? (parsed.notifications as AppState['notifications'])
        : [],
      followMap: followMapValid ? (parsed.followMap as AppState['followMap']) : {},
      theme: parsed.theme === 'light' || parsed.theme === 'dark' ? parsed.theme : 'dark',
      currentUserAddress:
        typeof parsed.currentUserAddress === 'string' || parsed.currentUserAddress === null
          ? (parsed.currentUserAddress as string | null)
          : null,
    }
  } catch {
    return fallback
  }
}

function saveState(state: AppState): void {
  tryPersist(state)
}

const TX_HISTORY_CAP = 200
const MESSAGES_PER_CONV_CAP = 500
const SAVE_DEBOUNCE_MS = 200

function capState(state: AppState): AppState {
  const messages = state.messages ?? {}
  const txHistory = state.txHistory ?? []
  let messagesChanged = false
  let cappedMessages: AppState['messages'] | undefined
  for (const convId of Object.keys(messages)) {
    const list = messages[convId]
    if (list && list.length > MESSAGES_PER_CONV_CAP) {
      if (!cappedMessages) cappedMessages = { ...messages }
      cappedMessages[convId] = list.slice(-MESSAGES_PER_CONV_CAP)
      messagesChanged = true
    }
  }
  if (txHistory.length <= TX_HISTORY_CAP && !messagesChanged) return state
  return {
    ...state,
    txHistory: txHistory.length > TX_HISTORY_CAP ? txHistory.slice(0, TX_HISTORY_CAP) : txHistory,
    messages: cappedMessages ?? messages,
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingState: AppState | null = null
let lastQuotaToastAt = 0

function tryPersist(state: AppState): void {
  try {
    const capped = capState(state)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capped))
  } catch (e) {
    const isQuota =
      (e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED')) ||
      (typeof e === 'object' && e !== null && 'code' in e && (e as { code?: number }).code === 22) ||
      String((e as Error)?.message ?? e).toLowerCase().includes('quota')
    if (isQuota) {
      const now = Date.now()
      if (now - lastQuotaToastAt > 5_000) {
        lastQuotaToastAt = now
        try {
          toast.error('Local storage is full — oldest history was trimmed.')
        } catch {
          /* ignore toast failures */
        }
      }
    }
  }
}

function scheduleSave(state: AppState): void {
  pendingState = state
  if (saveTimer) return
  saveTimer = setTimeout(() => {
    saveTimer = null
    const toSave = pendingState ?? state
    pendingState = null
    tryPersist(toSave)
  }, SAVE_DEBOUNCE_MS)
}

// ── Singleton state with event-based updates ────────────────────────────────

let globalState: AppState = capState(loadState())
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

function setState(updater: (prev: AppState) => AppState): void {
  const next = updater(globalState)
  // Bound in-memory growth additively (persist layer also caps before write).
  globalState = capState(next)
  scheduleSave(globalState)
  notify()
}

// Best-effort cross-tab merge: adopt incoming persisted state when it changes.
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return
    try {
      const incoming = JSON.parse(e.newValue) as Partial<AppState>
      if (typeof incoming !== 'object' || incoming === null) return
      globalState = capState({ ...globalState, ...incoming } as AppState)
      notify()
    } catch {
      /* ignore malformed cross-tab payloads */
    }
  })
}

// ── Public store API ────────────────────────────────────────────────────────

export const appStore = {
  getState: () => globalState,

  // Theme
  setTheme(theme: 'light' | 'dark') {
    setState((s) => ({ ...s, theme }))
  },

  // Profiles — secure form is upsertProfile(caller, updates) with
  // updates.address === caller. Legacy single-arg form is preserved for
  // local-only compat and normalizes on ingress.
  upsertProfile(
    callerOrProfile: string | (Partial<UserProfile> & { address: string }),
    updates?: Partial<UserProfile> & { address: string },
  ): boolean {
    if (typeof callerOrProfile === 'string' && updates) {
      const caller = normalizeAddress(callerOrProfile)
      const target = normalizeAddress(updates.address)
      if (!sameAddress(caller, target)) return false
      const key = target
      const merged: UserProfile = {
        ...(globalState.profiles[key] as UserProfile | undefined),
        ...updates,
        address: key,
      } as UserProfile
      setState((s) => ({
        ...s,
        profiles: { ...s.profiles, [key]: merged },
      }))
      return true
    }
    const profile = callerOrProfile as Partial<UserProfile> & { address: string }
    const key = normalizeAddress(profile.address)
    setState((s) => ({
      ...s,
      profiles: {
        ...s.profiles,
        [key]: { ...(s.profiles[key] as UserProfile | undefined), ...profile, address: key },
      },
    }))
    return true
  },

  getProfile(address: string): UserProfile | undefined {
    if (!address) return undefined
    const key = normalizeAddress(address)
    return (
      globalState.profiles[key] ??
      globalState.profiles[address] ??
      Object.entries(globalState.profiles).find(([k]) => sameAddress(k, address))?.[1]
    )
  },

  ensureProfile(address: string): UserProfile {
    const key = normalizeAddress(address)
    const existing =
      globalState.profiles[key] ??
      Object.entries(globalState.profiles).find(([k]) => sameAddress(k, address))?.[1]
    if (existing) return existing
    const profile: UserProfile = {
      address: key,
      username: key.slice(0, 6) + '...' + key.slice(-4),
      bio: '',
      avatarSeed: key,
      followerCount: 0,
      followingCount: 0,
      createdAt: Date.now(),
    }
    setState((s) => ({
      ...s,
      profiles: { ...s.profiles, [key]: profile },
    }))
    return profile
  },

  // Posts — edit/delete require authorAddress === caller.
  addPost(authorAddress: string, content: string): Post {
    const author = normalizeAddress(authorAddress)
    const post: Post = {
      id: generateId(),
      authorAddress: author,
      content,
      createdAt: Date.now(),
      likeCount: 0,
      commentCount: 0,
      repostCount: 0,
      likes: [],
      reposts: [],
    }
    setState((s) => ({ ...s, posts: [post, ...s.posts] }))
    return post
  },

  editPost(id: string, content: string, caller?: string): boolean {
    const post = globalState.posts.find((p) => p.id === id)
    if (!post) return false
    // Caller check: deny when caller is missing or not the author.
    if (!caller || !sameAddress(post.authorAddress, caller)) return false
    setState((s) => ({
      ...s,
      posts: s.posts.map((p) => (p.id === id ? { ...p, content, editedAt: Date.now() } : p)),
    }))
    return true
  },

  deletePost(id: string, caller?: string): boolean {
    const post = globalState.posts.find((p) => p.id === id)
    if (!post) return false
    if (!caller || !sameAddress(post.authorAddress, caller)) return false
    setState((s) => ({
      ...s,
      posts: s.posts.filter((p) => p.id !== id),
    }))
    return true
  },

  toggleLike(postId: string, address: string) {
    const norm = normalizeAddress(address)
    setState((s) => ({
      ...s,
      posts: s.posts.map((p) => {
        if (p.id !== postId) return p
        const hasLiked = includesAddress(p.likes, norm)
        return {
          ...p,
          likes: hasLiked
            ? p.likes.filter((a) => !sameAddress(a, norm))
            : [...p.likes, norm],
          likeCount: hasLiked ? p.likeCount - 1 : p.likeCount + 1,
        }
      }),
    }))
  },

  toggleRepost(postId: string, address: string) {
    const norm = normalizeAddress(address)
    setState((s) => {
      const post = s.posts.find((p) => p.id === postId)
      if (!post) return s
      const hasReposted = includesAddress(post.reposts, norm)
      let newPosts = s.posts.map((p) => {
        if (p.id !== postId) return p
        return {
          ...p,
          reposts: hasReposted
            ? p.reposts.filter((a) => !sameAddress(a, norm))
            : [...p.reposts, norm],
          repostCount: hasReposted ? p.repostCount - 1 : p.repostCount + 1,
        }
      })
      if (!hasReposted) {
        const repost: Post = {
          id: generateId(),
          authorAddress: norm,
          content: post.content,
          createdAt: Date.now(),
          likeCount: 0,
          commentCount: 0,
          repostCount: 0,
          repostOf: postId,
          likes: [],
          reposts: [],
        }
        newPosts = [repost, ...newPosts]
      }
      return { ...s, posts: newPosts }
    })
  },

  addComment(postId: string, authorAddress: string, content: string): Comment {
    const author = normalizeAddress(authorAddress)
    const comment: Comment = {
      id: generateId(),
      postId,
      authorAddress: author,
      content,
      createdAt: Date.now(),
    }
    setState((s) => ({
      ...s,
      comments: [...s.comments, comment],
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p,
      ),
    }))
    return comment
  },

  // Conversations — normalize addresses, dedupe DM case-insensitively.
  getOrCreateConversation(myAddress: string, otherAddress: string): Conversation {
    const me = normalizeAddress(myAddress)
    const other = normalizeAddress(otherAddress)
    // Self-chat: single-participant conversation.
    if (sameAddress(me, other)) {
      const selfExisting = globalState.conversations.find(
        (c) => !c.isGroup && c.participants.length === 1 && sameAddress(c.participants[0], me),
      )
      if (selfExisting) return selfExisting
      const conv: Conversation = {
        id: generateId(),
        participants: [me],
        unreadCount: 0,
        createdAt: Date.now(),
        isGroup: false,
      }
      setState((s) => ({ ...s, conversations: [conv, ...s.conversations] }))
      return conv
    }
    const existing = globalState.conversations.find(
      (c) =>
        !c.isGroup &&
        c.participants.length === 2 &&
        includesAddress(c.participants, me) &&
        includesAddress(c.participants, other),
    )
    if (existing) return existing
    const conv: Conversation = {
      id: generateId(),
      participants: [me, other],
      unreadCount: 0,
      createdAt: Date.now(),
      isGroup: false,
    }
    setState((s) => ({ ...s, conversations: [conv, ...s.conversations] }))
    return conv
  },

  sendMessage(
    conversationId: string,
    senderAddress: string,
    content: string,
    replyToId?: string,
    paymentTx?: PaymentMessage,
  ): Message | null {
    const sender = normalizeAddress(senderAddress)
    const conv = globalState.conversations.find((c) => c.id === conversationId)
    if (!conv) return null
    // Caller must be a participant. For group conversations also accept
    // current group members (participants list can be stale).
    const isParticipant = includesAddress(conv.participants, sender)
    let group: Group | undefined
    if (conv.isGroup && conv.groupId) {
      group = globalState.groups.find((g) => g.id === conv.groupId)
      if (!group) return null
      const isMember = includesAddress(group.memberAddresses, sender)
      if (!isParticipant && !isMember) return null
      // Channel admin-only post.
      if (group.type === 'channel' && !includesAddress(group.adminAddresses, sender)) return null
    } else {
      if (!isParticipant) return null
    }
    const msg: Message = {
      id: generateId(),
      conversationId,
      senderAddress: sender,
      content,
      createdAt: Date.now(),
      status: 'sent',
      replyToId,
      paymentTx,
    }
    setState((s) => ({
      ...s,
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] ?? []), msg],
      },
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, lastMessage: msg } : c,
      ),
    }))
    return msg
  },

  deleteMessageForMe(conversationId: string, messageId: string) {
    setState((s) => ({
      ...s,
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.id === messageId ? { ...m, deletedForMe: true } : m,
        ),
      },
    }))
  },

  markConversationRead(conversationId: string) {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c,
      ),
    }))
  },

  updatePaymentMessageStatus(conversationId: string, txHash: string, status: PaymentMessage['status']) {
    setState((s) => ({
      ...s,
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] ?? []).map((m) =>
          m.paymentTx?.txHash === txHash
            ? { ...m, paymentTx: { ...m.paymentTx, status } }
            : m,
        ),
      },
    }))
  },

  // Groups
  createGroup(
    ownerAddress: string,
    name: string,
    description: string,
    type: Group['type'],
    isPrivate: boolean,
  ): Group {
    const owner = normalizeAddress(ownerAddress)
    const group: Group = {
      id: generateId(),
      name,
      description,
      type,
      isPrivate,
      ownerAddress: owner,
      adminAddresses: [owner],
      memberAddresses: [owner],
      invitedAddresses: [],
      createdAt: Date.now(),
      avatarSeed: name + owner,
      messageCount: 0,
    }
    const conv: Conversation = {
      id: generateId(),
      participants: [owner],
      unreadCount: 0,
      createdAt: Date.now(),
      isGroup: true,
      groupId: group.id,
    }
    setState((s) => ({
      ...s,
      groups: [group, ...s.groups],
      conversations: [conv, ...s.conversations],
    }))
    return group
  },

  isInvited(groupId: string, address: string): boolean {
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g || !address) return false
    return includesAddress(g.invitedAddresses ?? [], address)
  },

  inviteToGroup(groupId: string, caller: string, invitee: string): boolean {
    const normCaller = normalizeAddress(caller)
    const normInvitee = normalizeAddress(invitee)
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g) return false
    if (!includesAddress(g.adminAddresses, normCaller)) return false
    if (includesAddress(g.memberAddresses, normInvitee)) return true
    if (includesAddress(g.invitedAddresses ?? [], normInvitee)) return true
    setState((s) => ({
      ...s,
      groups: s.groups.map((x) =>
        x.id === groupId
          ? { ...x, invitedAddresses: [...(x.invitedAddresses ?? []), normInvitee] }
          : x,
      ),
    }))
    return true
  },

  joinGroup(groupId: string, address: string): boolean {
    const norm = normalizeAddress(address)
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g) return false
    if (includesAddress(g.memberAddresses, norm)) return true
    // Private groups require an invite (owner/admins bypass via membership).
    if (g.isPrivate && !includesAddress(g.invitedAddresses ?? [], norm)) return false
    setState((s) => ({
      ...s,
      groups: s.groups.map((x) =>
        x.id === groupId && !includesAddress(x.memberAddresses, norm)
          ? { ...x, memberAddresses: [...x.memberAddresses, norm] }
          : x,
      ),
      conversations: s.conversations.map((c) =>
        c.isGroup && c.groupId === groupId && !includesAddress(c.participants, norm)
          ? { ...c, participants: [...c.participants, norm] }
          : c,
      ),
    }))
    return true
  },

  leaveGroup(groupId: string, address: string): boolean {
    const norm = normalizeAddress(address)
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g) return false
    if (!includesAddress(g.memberAddresses, norm)) return false
    // Prevent owner leaving without transfer.
    if (sameAddress(g.ownerAddress, norm)) return false
    setState((s) => ({
      ...s,
      groups: s.groups.map((x) =>
        x.id === groupId
          ? {
              ...x,
              memberAddresses: x.memberAddresses.filter((a) => !sameAddress(a, norm)),
              adminAddresses: x.adminAddresses.filter((a) => !sameAddress(a, norm)),
            }
          : x,
      ),
      conversations: s.conversations.map((c) =>
        c.isGroup && c.groupId === groupId
          ? { ...c, participants: c.participants.filter((a) => !sameAddress(a, norm)) }
          : c,
      ),
    }))
    return true
  },

  transferOwnership(groupId: string, caller: string, newOwner: string): boolean {
    const normCaller = normalizeAddress(caller)
    const normNew = normalizeAddress(newOwner)
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g) return false
    if (!sameAddress(g.ownerAddress, normCaller)) return false
    if (!includesAddress(g.memberAddresses, normNew)) return false
    setState((s) => ({
      ...s,
      groups: s.groups.map((x) =>
        x.id === groupId
          ? {
              ...x,
              ownerAddress: normNew,
              adminAddresses: includesAddress(x.adminAddresses, normNew)
                ? x.adminAddresses.map((a) => normalizeAddress(a))
                : [...x.adminAddresses.map((a) => normalizeAddress(a)), normNew],
            }
          : x,
      ),
    }))
    return true
  },

  addAdmin(groupId: string, caller: string, newAdmin: string): boolean {
    const normCaller = normalizeAddress(caller)
    const normNew = normalizeAddress(newAdmin)
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g) return false
    if (!includesAddress(g.adminAddresses, normCaller)) return false
    if (!includesAddress(g.memberAddresses, normNew)) return false
    if (includesAddress(g.adminAddresses, normNew)) return true
    setState((s) => ({
      ...s,
      groups: s.groups.map((x) =>
        x.id === groupId ? { ...x, adminAddresses: [...x.adminAddresses, normNew] } : x,
      ),
    }))
    return true
  },

  removeMember(groupId: string, caller: string, target: string): boolean {
    const normCaller = normalizeAddress(caller)
    const normTarget = normalizeAddress(target)
    const g = globalState.groups.find((x) => x.id === groupId)
    if (!g) return false
    if (!includesAddress(g.adminAddresses, normCaller)) return false
    // Owner cannot be removed.
    if (sameAddress(g.ownerAddress, normTarget)) return false
    // Only owner can remove an admin.
    if (includesAddress(g.adminAddresses, normTarget) && !sameAddress(g.ownerAddress, normCaller)) {
      return false
    }
    if (!includesAddress(g.memberAddresses, normTarget)) return false
    setState((s) => ({
      ...s,
      groups: s.groups.map((x) =>
        x.id === groupId
          ? {
              ...x,
              memberAddresses: x.memberAddresses.filter((a) => !sameAddress(a, normTarget)),
              adminAddresses: x.adminAddresses.filter((a) => !sameAddress(a, normTarget)),
            }
          : x,
      ),
      conversations: s.conversations.map((c) =>
        c.isGroup && c.groupId === groupId
          ? { ...c, participants: c.participants.filter((a) => !sameAddress(a, normTarget)) }
          : c,
      ),
    }))
    return true
  },

  // Transactions
  addTxRecord(tx: Omit<TxRecord, 'id'>): TxRecord {
    const record: TxRecord = {
      ...tx,
      fromAddress: normalizeAddress(tx.fromAddress),
      toAddress: normalizeAddress(tx.toAddress),
      id: generateId(),
    }
    setState((s) => ({ ...s, txHistory: [record, ...s.txHistory] }))
    return record
  },

  updateTxRecord(txHash: string, updates: Partial<TxRecord>) {
    const { fromAddress, toAddress, ...rest } = updates
    setState((s) => ({
      ...s,
      txHistory: s.txHistory.map((t) =>
        t.txHash === txHash
          ? {
              ...t,
              ...rest,
              ...(fromAddress ? { fromAddress: normalizeAddress(fromAddress) } : {}),
              ...(toAddress ? { toAddress: normalizeAddress(toAddress) } : {}),
            }
          : t,
      ),
    }))
  },

  // ── Tx lifecycle: pending -> confirmed/failed (additive, DATA/INDEXING) ──
  // Single writer pattern:
  //   1. createPendingTxRecord() immediately on hash (dedupes, case-insensitive)
  //   2. confirmTxRecord() / failTxRecord() on receipt (syncs payment messages)
  // addTxRecord/updateTxRecord preserved unchanged. Reuses normalizeAddress/
  // sameAddress from the auth-owned helpers above (no duplicates).
  createPendingTxRecord(
    tx: Omit<TxRecord, 'id' | 'status' | 'timestamp'> & { timestamp?: number }
  ): TxRecord {
    const needle = tx.txHash.toLowerCase()
    const existing = globalState.txHistory.find((t) => t.txHash.toLowerCase() === needle)
    if (existing) return existing
    return appStore.addTxRecord({
      ...tx,
      status: 'pending',
      timestamp: tx.timestamp ?? Date.now(),
    })
  },

  confirmTxRecord(txHash: string, blockNumber?: number) {
    const needle = txHash.toLowerCase()
    setState((s) => ({
      ...s,
      txHistory: s.txHistory.map((t) =>
        t.txHash.toLowerCase() === needle
          ? { ...t, status: 'confirmed' as const, ...(blockNumber !== undefined ? { blockNumber } : {}) }
          : t
      ),
    }))
    appStore.updatePaymentMessageStatusByHash(txHash, 'confirmed')
  },

  failTxRecord(txHash: string, blockNumber?: number) {
    const needle = txHash.toLowerCase()
    setState((s) => ({
      ...s,
      txHistory: s.txHistory.map((t) =>
        t.txHash.toLowerCase() === needle
          ? { ...t, status: 'failed' as const, ...(blockNumber !== undefined ? { blockNumber } : {}) }
          : t
      ),
    }))
    appStore.updatePaymentMessageStatusByHash(txHash, 'failed')
  },

  // Update payment message status across ALL conversations (convId unknown
  // during reconciliation). updatePaymentMessageStatus(convId,...) preserved.
  updatePaymentMessageStatusByHash(txHash: string, status: PaymentMessage['status']) {
    const needle = txHash.toLowerCase()
    setState((s) => {
      const messages: Record<string, Message[]> = {}
      for (const [convId, list] of Object.entries(s.messages)) {
        messages[convId] = (list ?? []).map((m) =>
          m.paymentTx?.txHash.toLowerCase() === needle
            ? { ...m, paymentTx: { ...m.paymentTx, status } }
            : m
        )
      }
      return { ...s, messages }
    })
  },

  // Follow
  toggleFollow(myAddress: string, targetAddress: string) {
    const me = normalizeAddress(myAddress)
    const target = normalizeAddress(targetAddress)
    if (sameAddress(me, target)) return
    setState((s) => {
      // Resolve canonical keys case-insensitively.
      const meKey =
        Object.keys(s.followMap).find((k) => sameAddress(k, me)) ??
        Object.keys(s.profiles).find((k) => sameAddress(k, me)) ??
        me
      const targetKey =
        Object.keys(s.profiles).find((k) => sameAddress(k, target)) ?? target
      const following = s.followMap[meKey] ?? s.followMap[me] ?? []
      const isFollowing = includesAddress(following, target)
      const newFollowing = isFollowing
        ? following.filter((a) => !sameAddress(a, target))
        : [...following, targetKey]
      const targetProfile = s.profiles[targetKey] ?? s.profiles[target]
      return {
        ...s,
        followMap: { ...s.followMap, [meKey]: newFollowing },
        profiles: targetProfile
          ? {
              ...s.profiles,
              [targetKey]: {
                ...targetProfile,
                followerCount: isFollowing
                  ? targetProfile.followerCount - 1
                  : targetProfile.followerCount + 1,
              },
            }
          : s.profiles,
      }
    })
  },

  isFollowing(myAddress: string, targetAddress: string): boolean {
    if (!myAddress || !targetAddress) return false
    const entry = Object.entries(globalState.followMap).find(([k]) =>
      sameAddress(k, myAddress),
    )
    if (!entry) return includesAddress(globalState.followMap[myAddress] ?? [], targetAddress)
    return includesAddress(entry[1], targetAddress)
  },

  // Notifications
  addNotification(notif: Omit<Notification, 'id' | 'read'>): Notification {
    const n: Notification = {
      ...notif,
      fromAddress: normalizeAddress(notif.fromAddress),
      id: generateId(),
      read: false,
    }
    setState((s) => ({ ...s, notifications: [n, ...s.notifications] }))
    return n
  },

  markNotificationsRead() {
    setState((s) => ({
      ...s,
      notifications: s.notifications.map((n) => ({ ...n, read: true })),
    }))
  },
}

// ── Shared address/helpers for other views (DATA/INDEXING compat) ──────────

export function isSameAddress(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false
  return sameAddress(a, b)
}

export function filterTxHistoryForAddress(
  txHistory: TxRecord[],
  address: string | undefined | null,
): TxRecord[] {
  if (!address) return []
  return txHistory.filter(
    (t) => sameAddress(t.fromAddress, address) || sameAddress(t.toAddress, address),
  )
}

export function filterConversationsForAddress(
  conversations: Conversation[],
  address: string | undefined | null,
): Conversation[] {
  if (!address) return []
  return conversations.filter((c) =>
    (c.participants ?? []).some((p) => sameAddress(p, address))
  )
}

// Notifications lack a recipient field (only fromAddress), so best-effort:
// when a forAddress/toAddress/to field exists filter by it, otherwise keep
// (local-only store assumes all are for current user).
export function filterNotificationsForAddress(
  notifications: Notification[],
  address: string | undefined | null,
): Notification[] {
  if (!address) return []
  return notifications.filter((n) => {
    const rec =
      (n as unknown as { forAddress?: string; toAddress?: string; to?: string })
        .forAddress ??
      (n as unknown as { toAddress?: string }).toAddress ??
      (n as unknown as { to?: string }).to
    if (!rec) return true
    return sameAddress(rec, address)
  })
}

// ── React hook ─────────────────────────────────────────────────────────────

export function useAppStore() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const update = () => forceUpdate((n) => n + 1)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])

  return globalState
}

export function useTheme() {
  const state = useAppStore()
  const setTheme = useCallback((t: 'light' | 'dark') => appStore.setTheme(t), [])
  return { theme: state.theme, setTheme }
}
