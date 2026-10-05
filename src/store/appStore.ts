// ── Application state store (in-memory + localStorage persistence) ──────────
// Messaging, social, groups, profiles, and notifications are off-chain app
// data stored locally. All financial transactions go through the real blockchain.

import { useState, useEffect, useCallback } from 'react'
import type {
  UserProfile, Post, Comment, Message, Conversation,
  Group, TxRecord, Notification, PaymentMessage,
} from '../types'
import { generateId } from '../utils/format'

const STORAGE_KEY = 'arc-socialpay-v1'

interface AppState {
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

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as AppState
  } catch {
    // ignore
  }
  return {
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

function saveState(state: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore quota errors
  }
}

// ── Singleton state with event-based updates ────────────────────────────────

let globalState: AppState = loadState()
const listeners = new Set<() => void>()

function notify() {
  listeners.forEach((fn) => fn())
}

function setState(updater: (prev: AppState) => AppState): void {
  globalState = updater(globalState)
  saveState(globalState)
  notify()
}

// ── Public store API ────────────────────────────────────────────────────────

export const appStore = {
  getState: () => globalState,

  // Theme
  setTheme(theme: 'light' | 'dark') {
    setState((s) => ({ ...s, theme }))
  },

  // Profiles
  upsertProfile(profile: Partial<UserProfile> & { address: string }) {
    setState((s) => ({
      ...s,
      profiles: {
        ...s.profiles,
        [profile.address]: { ...s.profiles[profile.address], ...profile },
      },
    }))
  },

  getProfile(address: string): UserProfile | undefined {
    return globalState.profiles[address]
  },

  ensureProfile(address: string): UserProfile {
    if (!globalState.profiles[address]) {
      const profile: UserProfile = {
        address,
        username: address.slice(0, 6) + '...' + address.slice(-4),
        bio: '',
        avatarSeed: address,
        followerCount: 0,
        followingCount: 0,
        createdAt: Date.now(),
      }
      setState((s) => ({
        ...s,
        profiles: { ...s.profiles, [address]: profile },
      }))
      return profile
    }
    return globalState.profiles[address]
  },

  // Posts
  addPost(authorAddress: string, content: string): Post {
    const post: Post = {
      id: generateId(),
      authorAddress,
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

  editPost(id: string, content: string) {
    setState((s) => ({
      ...s,
      posts: s.posts.map((p) => p.id === id ? { ...p, content, editedAt: Date.now() } : p),
    }))
  },

  deletePost(id: string) {
    setState((s) => ({
      ...s,
      posts: s.posts.filter((p) => p.id !== id),
    }))
  },

  toggleLike(postId: string, address: string) {
    setState((s) => ({
      ...s,
      posts: s.posts.map((p) => {
        if (p.id !== postId) return p
        const hasLiked = p.likes.includes(address)
        return {
          ...p,
          likes: hasLiked ? p.likes.filter((a) => a !== address) : [...p.likes, address],
          likeCount: hasLiked ? p.likeCount - 1 : p.likeCount + 1,
        }
      }),
    }))
  },

  toggleRepost(postId: string, address: string) {
    setState((s) => {
      const post = s.posts.find((p) => p.id === postId)
      if (!post) return s
      const hasReposted = post.reposts.includes(address)
      let newPosts = s.posts.map((p) => {
        if (p.id !== postId) return p
        return {
          ...p,
          reposts: hasReposted ? p.reposts.filter((a) => a !== address) : [...p.reposts, address],
          repostCount: hasReposted ? p.repostCount - 1 : p.repostCount + 1,
        }
      })
      if (!hasReposted) {
        const repost: Post = {
          id: generateId(),
          authorAddress: address,
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
    const comment: Comment = {
      id: generateId(),
      postId,
      authorAddress,
      content,
      createdAt: Date.now(),
    }
    setState((s) => ({
      ...s,
      comments: [...s.comments, comment],
      posts: s.posts.map((p) =>
        p.id === postId ? { ...p, commentCount: p.commentCount + 1 } : p
      ),
    }))
    return comment
  },

  // Conversations
  getOrCreateConversation(myAddress: string, otherAddress: string): Conversation {
    const existing = globalState.conversations.find(
      (c) => !c.isGroup && c.participants.includes(myAddress) && c.participants.includes(otherAddress)
    )
    if (existing) return existing
    const conv: Conversation = {
      id: generateId(),
      participants: [myAddress, otherAddress],
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
    paymentTx?: PaymentMessage
  ): Message {
    const msg: Message = {
      id: generateId(),
      conversationId,
      senderAddress,
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
        c.id === conversationId ? { ...c, lastMessage: msg } : c
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
          m.id === messageId ? { ...m, deletedForMe: true } : m
        ),
      },
    }))
  },

  markConversationRead(conversationId: string) {
    setState((s) => ({
      ...s,
      conversations: s.conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
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
            : m
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
    isPrivate: boolean
  ): Group {
    const group: Group = {
      id: generateId(),
      name,
      description,
      type,
      isPrivate,
      ownerAddress,
      adminAddresses: [ownerAddress],
      memberAddresses: [ownerAddress],
      createdAt: Date.now(),
      avatarSeed: name + ownerAddress,
      messageCount: 0,
    }
    const conv: Conversation = {
      id: generateId(),
      participants: [ownerAddress],
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

  joinGroup(groupId: string, address: string) {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === groupId && !g.memberAddresses.includes(address)
          ? { ...g, memberAddresses: [...g.memberAddresses, address] }
          : g
      ),
    }))
  },

  leaveGroup(groupId: string, address: string) {
    setState((s) => ({
      ...s,
      groups: s.groups.map((g) =>
        g.id === groupId
          ? { ...g, memberAddresses: g.memberAddresses.filter((a) => a !== address) }
          : g
      ),
    }))
  },

  // Transactions
  addTxRecord(tx: Omit<TxRecord, 'id'>): TxRecord {
    const record: TxRecord = { ...tx, id: generateId() }
    setState((s) => ({ ...s, txHistory: [record, ...s.txHistory] }))
    return record
  },

  updateTxRecord(txHash: string, updates: Partial<TxRecord>) {
    setState((s) => ({
      ...s,
      txHistory: s.txHistory.map((t) =>
        t.txHash === txHash ? { ...t, ...updates } : t
      ),
    }))
  },

  // Follow
  toggleFollow(myAddress: string, targetAddress: string) {
    setState((s) => {
      const following = s.followMap[myAddress] ?? []
      const isFollowing = following.includes(targetAddress)
      const newFollowing = isFollowing
        ? following.filter((a) => a !== targetAddress)
        : [...following, targetAddress]
      const targetProfile = s.profiles[targetAddress]
      return {
        ...s,
        followMap: { ...s.followMap, [myAddress]: newFollowing },
        profiles: targetProfile
          ? {
              ...s.profiles,
              [targetAddress]: {
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
    return (globalState.followMap[myAddress] ?? []).includes(targetAddress)
  },

  // Notifications
  addNotification(notif: Omit<Notification, 'id' | 'read'>): Notification {
    const n: Notification = { ...notif, id: generateId(), read: false }
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

// ── React hook ─────────────────────────────────────────────────────────────

export function useAppStore() {
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    const update = () => forceUpdate((n) => n + 1)
    listeners.add(update)
    return () => { listeners.delete(update) }
  }, [])

  return globalState
}

export function useTheme() {
  const state = useAppStore()
  const setTheme = useCallback((t: 'light' | 'dark') => appStore.setTheme(t), [])
  return { theme: state.theme, setTheme }
}
