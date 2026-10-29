// DEPRECATED (P0 dual-store): legacy in-memory store. Modern app state lives in
// src/store/appStore.ts. Kept for legacy components (PostCard/WalletView/TopBar/
// BottomNav/Sidebar/FeedView/ExploreView/CommunitiesView/PostComposer) which are
// not routed by src/App.tsx, so `tsc --noEmit` still passes. Do not use for new code.
import { useState, useEffect, useRef } from 'react'
import type {
  AppState, Post, User, Message, Conversation,
  Community, Channel, Notification, ActiveView, PostType
} from './types'

// ── Seed Data ──
const SEED_USERS: User[] = [
  {
    id: 'user_alice',
    address: '0x1234567890abcdef1234567890abcdef12345678',
    username: 'alice_arc',
    displayName: 'Alice Chen',
    bio: 'Building onchain. Founder @arcbuilders. USDC maxi.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=alice&backgroundColor=b6e3f4',
    followers: ['user_bob', 'user_carol', 'user_dave'],
    following: ['user_bob', 'user_carol'],
    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 90,
    isVerified: true,
    website: 'https://arc.io',
    location: 'San Francisco, CA',
    postsCount: 142,
  },
  {
    id: 'user_bob',
    address: '0xabcdef1234567890abcdef1234567890abcdef12',
    username: 'bob_onchain',
    displayName: 'Bob Rivers',
    bio: 'DeFi researcher | Arc ecosystem | Coffee & code.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=bob&backgroundColor=c0aede',
    followers: ['user_alice', 'user_carol'],
    following: ['user_alice', 'user_dave'],
    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 60,
    isVerified: false,
    postsCount: 89,
  },
  {
    id: 'user_carol',
    address: '0x9876543210fedcba9876543210fedcba98765432',
    username: 'carol_web3',
    displayName: 'Carol Martinez',
    bio: 'Designer & developer. Arc UI/UX enthusiast.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=carol&backgroundColor=ffdfbf',
    followers: ['user_alice', 'user_bob', 'user_dave'],
    following: ['user_alice', 'user_bob'],
    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 45,
    isVerified: true,
    postsCount: 203,
  },
  {
    id: 'user_dave',
    address: '0xfedcba9876543210fedcba9876543210fedcba98',
    username: 'dave_arc',
    displayName: 'Dave Kim',
    bio: 'Smart contract engineer. Auditing Arc protocols.',
    avatarUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=dave&backgroundColor=d1f4e0',
    followers: ['user_alice', 'user_carol'],
    following: ['user_alice', 'user_carol', 'user_bob'],
    joinedAt: Date.now() - 1000 * 60 * 60 * 24 * 120,
    isVerified: false,
    postsCount: 57,
  },
]

const now = Date.now()
const SEED_POSTS: Post[] = [
  {
    id: 'post_1',
    authorId: 'user_alice',
    content: 'Arc is the future of social + payments. USDC as native gas means every tip, every post, every interaction is seamlessly onchain. The barrier to web3 adoption is coming down fast. 🚀',
    type: 'post',
    likes: ['user_bob', 'user_carol', 'user_dave'],
    reposts: ['user_bob'],
    replies: ['post_2'],
    quotes: [],
    bookmarks: ['user_carol'],
    views: 1240,
    createdAt: now - 1000 * 60 * 45,
  },
  {
    id: 'post_2',
    authorId: 'user_bob',
    content: 'Replying to Alice — totally agree. The gas UX on Arc is unlike anything I\'ve used before. Just paid $0.001 in USDC for a transaction. This is what mainstream adoption looks like.',
    type: 'reply',
    replyToId: 'post_1',
    likes: ['user_alice', 'user_carol'],
    reposts: [],
    replies: [],
    quotes: [],
    bookmarks: [],
    views: 430,
    createdAt: now - 1000 * 60 * 30,
  },
  {
    id: 'post_3',
    authorId: 'user_carol',
    content: 'Just shipped a new open-source UI kit for Arc dApps. Clean, minimal, production-ready. DM me for early access or check the repo.',
    type: 'post',
    likes: ['user_alice', 'user_dave'],
    reposts: ['user_alice', 'user_dave'],
    replies: [],
    quotes: [],
    bookmarks: ['user_alice', 'user_bob', 'user_dave'],
    views: 890,
    createdAt: now - 1000 * 60 * 90,
  },
  {
    id: 'post_4',
    authorId: 'user_dave',
    content: 'Completed a security audit on the latest Arc DeFi protocol. Findings: 2 low, 0 medium, 0 high/critical. Team is responsive and patches were deployed within 24h. Great work!',
    type: 'post',
    likes: ['user_alice', 'user_bob', 'user_carol'],
    reposts: ['user_carol'],
    replies: [],
    quotes: ['post_5'],
    bookmarks: ['user_alice'],
    views: 2100,
    createdAt: now - 1000 * 60 * 180,
  },
  {
    id: 'post_5',
    authorId: 'user_bob',
    content: 'This is why the Arc ecosystem stands out — security-first culture. Grateful for auditors like @dave_arc who keep the protocol honest.',
    type: 'quote',
    quotedPostId: 'post_4',
    likes: ['user_alice', 'user_carol', 'user_dave'],
    reposts: ['user_alice'],
    replies: [],
    quotes: [],
    bookmarks: [],
    views: 670,
    createdAt: now - 1000 * 60 * 150,
  },
]

const SEED_COMMUNITIES: Community[] = [
  {
    id: 'comm_arc_builders',
    name: 'Arc Builders',
    handle: 'arc-builders',
    description: 'The home for developers building on Arc blockchain. Share projects, get feedback, collaborate.',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=arcbuilders&backgroundColor=b6e3f4',
    memberIds: ['user_alice', 'user_bob', 'user_carol', 'user_dave'],
    adminIds: ['user_alice'],
    moderatorIds: ['user_bob'],
    channelIds: ['ch_general', 'ch_dev', 'ch_announcements'],
    isPublic: true,
    createdAt: now - 1000 * 60 * 60 * 24 * 60,
    creatorId: 'user_alice',
    category: 'Technology',
    tags: ['arc', 'blockchain', 'development', 'defi'],
    rules: [
      'Be respectful and constructive.',
      'Share only original or properly credited content.',
      'No spam or self-promotion without prior approval.',
    ],
  },
  {
    id: 'comm_defi',
    name: 'DeFi on Arc',
    handle: 'defi-arc',
    description: 'Decentralized finance protocols, yield strategies, and market discussion for Arc.',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=defi&backgroundColor=c0aede',
    memberIds: ['user_bob', 'user_dave', 'user_carol'],
    adminIds: ['user_bob'],
    moderatorIds: [],
    channelIds: ['ch_markets', 'ch_strategies'],
    isPublic: true,
    createdAt: now - 1000 * 60 * 60 * 24 * 30,
    creatorId: 'user_bob',
    category: 'Finance',
    tags: ['defi', 'usdc', 'yield', 'protocols'],
  },
  {
    id: 'comm_art',
    name: 'Arc Art & NFTs',
    handle: 'arc-art',
    description: 'Creators, collectors, and curators on Arc. Onchain art and digital ownership.',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=arcart&backgroundColor=ffdfbf',
    memberIds: ['user_carol', 'user_alice'],
    adminIds: ['user_carol'],
    moderatorIds: [],
    channelIds: ['ch_gallery'],
    isPublic: true,
    createdAt: now - 1000 * 60 * 60 * 24 * 15,
    creatorId: 'user_carol',
    category: 'Art',
    tags: ['nft', 'art', 'digital', 'creative'],
  },
]

const SEED_CHANNELS: Channel[] = [
  { id: 'ch_general', communityId: 'comm_arc_builders', name: 'general', description: 'General discussion', type: 'text' },
  { id: 'ch_dev', communityId: 'comm_arc_builders', name: 'dev-talk', description: 'Technical development chat', type: 'text' },
  { id: 'ch_announcements', communityId: 'comm_arc_builders', name: 'announcements', description: 'Official announcements', type: 'announcement' },
  { id: 'ch_markets', communityId: 'comm_defi', name: 'markets', description: 'Market discussion', type: 'text' },
  { id: 'ch_strategies', communityId: 'comm_defi', name: 'strategies', description: 'Yield strategies', type: 'text' },
  { id: 'ch_gallery', communityId: 'comm_art', name: 'gallery', description: 'Share your work', type: 'media' },
]

const SEED_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv_alice_bob',
    type: 'dm',
    participantIds: ['user_alice', 'user_bob'],
    adminIds: [],
    unreadCount: 2,
    createdAt: now - 1000 * 60 * 60 * 24,
    lastMessage: {
      id: 'msg_3',
      conversationId: 'conv_alice_bob',
      senderId: 'user_bob',
      content: 'Sure! Looking forward to seeing the new design system.',
      status: 'delivered',
      reactions: {},
      createdAt: now - 1000 * 60 * 20,
    },
  },
  {
    id: 'conv_arc_builders',
    type: 'group',
    name: 'Arc Builders Core',
    participantIds: ['user_alice', 'user_bob', 'user_carol', 'user_dave'],
    adminIds: ['user_alice'],
    unreadCount: 5,
    createdAt: now - 1000 * 60 * 60 * 24 * 7,
    lastMessage: {
      id: 'msg_10',
      conversationId: 'conv_arc_builders',
      senderId: 'user_carol',
      content: 'The UI kit PR is ready for review.',
      status: 'delivered',
      reactions: { '👍': ['user_alice', 'user_bob'] },
      createdAt: now - 1000 * 60 * 35,
    },
  },
]

const SEED_MESSAGES: Message[] = [
  {
    id: 'msg_1', conversationId: 'conv_alice_bob', senderId: 'user_alice',
    content: 'Hey Bob! Did you see the new Arc upgrade?', status: 'read', reactions: {}, createdAt: now - 1000 * 60 * 60,
  },
  {
    id: 'msg_2', conversationId: 'conv_alice_bob', senderId: 'user_bob',
    content: 'Yes! The fee reduction is incredible. Sub-cent transactions are going to unlock so many use cases.', status: 'read', reactions: { '🔥': ['user_alice'] }, createdAt: now - 1000 * 60 * 55,
  },
  {
    id: 'msg_3', conversationId: 'conv_alice_bob', senderId: 'user_bob',
    content: 'Sure! Looking forward to seeing the new design system.', status: 'delivered', reactions: {}, createdAt: now - 1000 * 60 * 20,
  },
  {
    id: 'msg_4', conversationId: 'conv_arc_builders', senderId: 'user_alice',
    content: 'Everyone — we\'re targeting next Tuesday for the v2 release. Final reviews needed by EOD Friday.', status: 'read', reactions: { '✅': ['user_bob', 'user_carol', 'user_dave'] }, createdAt: now - 1000 * 60 * 90,
  },
  {
    id: 'msg_5', conversationId: 'conv_arc_builders', senderId: 'user_dave',
    content: 'Security audit is wrapped up. No blockers on my end.', status: 'read', reactions: { '🎉': ['user_alice', 'user_bob'] }, createdAt: now - 1000 * 60 * 75,
  },
  {
    id: 'msg_6', conversationId: 'conv_arc_builders', senderId: 'user_bob',
    content: 'Docs are 90% done. Will finish tonight.', status: 'read', reactions: {}, createdAt: now - 1000 * 60 * 60,
  },
  {
    id: 'msg_10', conversationId: 'conv_arc_builders', senderId: 'user_carol',
    content: 'The UI kit PR is ready for review.', status: 'delivered', reactions: { '👍': ['user_alice', 'user_bob'] }, createdAt: now - 1000 * 60 * 35,
  },
]

const SEED_NOTIFICATIONS: Notification[] = [
  { id: 'notif_1', type: 'like', actorId: 'user_bob', targetPostId: 'post_1', read: false, createdAt: now - 1000 * 60 * 5 },
  { id: 'notif_2', type: 'follow', actorId: 'user_carol', read: false, createdAt: now - 1000 * 60 * 15 },
  { id: 'notif_3', type: 'repost', actorId: 'user_dave', targetPostId: 'post_3', read: false, createdAt: now - 1000 * 60 * 30 },
  { id: 'notif_4', type: 'comment', actorId: 'user_alice', targetPostId: 'post_4', read: true, createdAt: now - 1000 * 60 * 90 },
  { id: 'notif_5', type: 'tip', actorId: 'user_bob', targetPostId: 'post_1', read: true, createdAt: now - 1000 * 60 * 180, tipAmount: '1.00' },
  { id: 'notif_6', type: 'mention', actorId: 'user_carol', targetPostId: 'post_3', read: true, createdAt: now - 1000 * 60 * 300 },
]

// ── Helpers ──
export function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function formatTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)}d`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatFullTime(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  })
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return n.toString()
}

export function shortAddress(addr?: string): string {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

// ── Initial State ──
function buildInitialState(): AppState {
  const usersMap: Record<string, User> = {}
  SEED_USERS.forEach(u => { usersMap[u.id] = u })

  const postsMap: Record<string, Post> = {}
  SEED_POSTS.forEach(p => { postsMap[p.id] = p })

  const messagesMap: Record<string, Message> = {}
  SEED_MESSAGES.forEach(m => { messagesMap[m.id] = m })

  const conversationsMap: Record<string, Conversation> = {}
  SEED_CONVERSATIONS.forEach(c => { conversationsMap[c.id] = c })

  const communitiesMap: Record<string, Community> = {}
  SEED_COMMUNITIES.forEach(c => { communitiesMap[c.id] = c })

  const channelsMap: Record<string, Channel> = {}
  SEED_CHANNELS.forEach(c => { channelsMap[c.id] = c })

  return {
    theme: 'dark',
    activeView: 'feed',
    posts: postsMap,
    users: usersMap,
    messages: messagesMap,
    conversations: conversationsMap,
    communities: communitiesMap,
    channels: channelsMap,
    notifications: SEED_NOTIFICATIONS,
    composerOpen: false,
    searchQuery: '',
    mobileNavOpen: false,
  }
}

// ── Singleton store (module-level) ──
let storeState = buildInitialState()
const listeners = new Set<() => void>()

function setState(updater: (s: AppState) => AppState) {
  storeState = updater(storeState)
  listeners.forEach(fn => fn())
}

function getState(): AppState {
  return storeState
}

// ── Actions ──
export const actions = {
  setTheme(theme: 'light' | 'dark') {
    setState(s => ({ ...s, theme }))
    document.documentElement.classList.toggle('dark', theme === 'dark')
  },

  navigate(view: ActiveView, opts?: {
    userId?: string
    conversationId?: string
    communityId?: string
    postId?: string
  }) {
    setState(s => ({
      ...s,
      activeView: view,
      selectedUserId: opts?.userId,
      selectedConversationId: opts?.conversationId,
      selectedCommunityId: opts?.communityId,
      selectedPostId: opts?.postId,
    }))
  },

  setCurrentUser(address: string) {
    const existing = Object.values(storeState.users).find(u => u.address?.toLowerCase() === address.toLowerCase())
    if (existing) {
      setState(s => ({ ...s, currentUserId: existing.id }))
      return
    }
    const newUser: User = {
      id: `user_${address.slice(2, 8).toLowerCase()}`,
      address,
      username: `user_${address.slice(2, 7).toLowerCase()}`,
      displayName: `${address.slice(0, 6)}…${address.slice(-4)}`,
      bio: '',
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${address}&backgroundColor=b6e3f4`,
      followers: [],
      following: [],
      joinedAt: Date.now(),
      postsCount: 0,
    }
    setState(s => ({
      ...s,
      users: { ...s.users, [newUser.id]: newUser },
      currentUserId: newUser.id,
    }))
  },

  clearCurrentUser() {
    setState(s => ({ ...s, currentUserId: undefined }))
  },

  updateProfile(updates: Partial<Pick<User, 'displayName' | 'bio' | 'username' | 'website' | 'location' | 'avatarUrl' | 'bannerUrl'>>) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => ({
      ...s,
      users: {
        ...s.users,
        [currentUserId]: { ...s.users[currentUserId], ...updates },
      },
    }))
  },

  createPost(opts: {
    content: string
    type?: PostType
    replyToId?: string
    quotedPostId?: string
    communityId?: string
    channelId?: string
  }) {
    const { currentUserId } = storeState
    if (!currentUserId) return null
    const id = generateId('post')
    const post: Post = {
      id,
      authorId: currentUserId,
      content: opts.content,
      type: opts.type ?? 'post',
      replyToId: opts.replyToId,
      quotedPostId: opts.quotedPostId,
      communityId: opts.communityId,
      channelId: opts.channelId,
      likes: [],
      reposts: [],
      replies: [],
      quotes: [],
      bookmarks: [],
      views: 0,
      createdAt: Date.now(),
    }
    setState(s => {
      const newPosts = { ...s.posts, [id]: post }
      // if reply, attach to parent
      if (opts.replyToId && s.posts[opts.replyToId]) {
        newPosts[opts.replyToId] = {
          ...s.posts[opts.replyToId],
          replies: [...(s.posts[opts.replyToId].replies ?? []), id],
        }
      }
      // if quote, attach to quoted
      if (opts.quotedPostId && s.posts[opts.quotedPostId]) {
        newPosts[opts.quotedPostId] = {
          ...s.posts[opts.quotedPostId],
          quotes: [...(s.posts[opts.quotedPostId].quotes ?? []), id],
        }
      }
      // increment user post count
      const user = s.users[currentUserId]
      return {
        ...s,
        posts: newPosts,
        users: { ...s.users, [currentUserId]: { ...user, postsCount: user.postsCount + 1 } },
      }
    })
    return id
  },

  toggleLike(postId: string) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => {
      const post = s.posts[postId]
      if (!post) return s
      const liked = post.likes.includes(currentUserId)
      return {
        ...s,
        posts: {
          ...s.posts,
          [postId]: {
            ...post,
            likes: liked
              ? post.likes.filter(id => id !== currentUserId)
              : [...post.likes, currentUserId],
          },
        },
      }
    })
  },

  toggleBookmark(postId: string) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => {
      const post = s.posts[postId]
      if (!post) return s
      const bookmarked = post.bookmarks.includes(currentUserId)
      return {
        ...s,
        posts: {
          ...s.posts,
          [postId]: {
            ...post,
            bookmarks: bookmarked
              ? post.bookmarks.filter(id => id !== currentUserId)
              : [...post.bookmarks, currentUserId],
          },
        },
      }
    })
  },

  repost(postId: string) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => {
      const post = s.posts[postId]
      if (!post) return s
      const reposted = post.reposts.includes(currentUserId)
      // create a repost entry if not already done
      if (!reposted) {
        const rpId = generateId('post')
        const rp: Post = {
          id: rpId,
          authorId: currentUserId,
          content: '',
          type: 'repost',
          originalPostId: postId,
          likes: [], reposts: [], replies: [], quotes: [], bookmarks: [],
          views: 0,
          createdAt: Date.now(),
        }
        return {
          ...s,
          posts: {
            ...s.posts,
            [rpId]: rp,
            [postId]: { ...post, reposts: [...post.reposts, currentUserId] },
          },
        }
      }
      return {
        ...s,
        posts: {
          ...s.posts,
          [postId]: { ...post, reposts: post.reposts.filter(id => id !== currentUserId) },
        },
      }
    })
  },

  toggleFollow(targetUserId: string) {
    const { currentUserId } = storeState
    if (!currentUserId || currentUserId === targetUserId) return
    setState(s => {
      const me = s.users[currentUserId]
      const target = s.users[targetUserId]
      if (!me || !target) return s
      const following = me.following.includes(targetUserId)
      return {
        ...s,
        users: {
          ...s.users,
          [currentUserId]: {
            ...me,
            following: following
              ? me.following.filter(id => id !== targetUserId)
              : [...me.following, targetUserId],
          },
          [targetUserId]: {
            ...target,
            followers: following
              ? target.followers.filter(id => id !== currentUserId)
              : [...target.followers, currentUserId],
          },
        },
      }
    })
  },

  sendMessage(conversationId: string, content: string) {
    const { currentUserId } = storeState
    if (!currentUserId || !content.trim()) return
    const id = generateId('msg')
    const msg: Message = {
      id,
      conversationId,
      senderId: currentUserId,
      content,
      status: 'sent',
      reactions: {},
      createdAt: Date.now(),
    }
    setState(s => ({
      ...s,
      messages: { ...s.messages, [id]: msg },
      conversations: {
        ...s.conversations,
        [conversationId]: {
          ...s.conversations[conversationId],
          lastMessage: msg,
          unreadCount: 0,
        },
      },
    }))
    return id
  },

  addReaction(messageId: string, emoji: string) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => {
      const msg = s.messages[messageId]
      if (!msg) return s
      const existing = msg.reactions[emoji] ?? []
      const hasIt = existing.includes(currentUserId)
      return {
        ...s,
        messages: {
          ...s.messages,
          [messageId]: {
            ...msg,
            reactions: {
              ...msg.reactions,
              [emoji]: hasIt
                ? existing.filter(id => id !== currentUserId)
                : [...existing, currentUserId],
            },
          },
        },
      }
    })
  },

  createConversation(participantIds: string[], name?: string, type?: 'dm' | 'group') {
    const { currentUserId } = storeState
    if (!currentUserId) return null
    const allIds = [...new Set([currentUserId, ...participantIds])]
    // check for existing DM
    if (type === 'dm' || (!type && allIds.length === 2)) {
      const existing = Object.values(storeState.conversations).find(c =>
        c.type === 'dm' &&
        c.participantIds.length === 2 &&
        c.participantIds.includes(allIds[0]) &&
        c.participantIds.includes(allIds[1])
      )
      if (existing) return existing.id
    }
    const id = generateId('conv')
    const conv: Conversation = {
      id,
      type: allIds.length > 2 ? 'group' : 'dm',
      name,
      participantIds: allIds,
      adminIds: [currentUserId],
      unreadCount: 0,
      createdAt: Date.now(),
    }
    setState(s => ({ ...s, conversations: { ...s.conversations, [id]: conv } }))
    return id
  },

  joinCommunity(communityId: string) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => {
      const comm = s.communities[communityId]
      if (!comm || comm.memberIds.includes(currentUserId)) return s
      return {
        ...s,
        communities: {
          ...s.communities,
          [communityId]: { ...comm, memberIds: [...comm.memberIds, currentUserId] },
        },
      }
    })
  },

  leaveCommunity(communityId: string) {
    const { currentUserId } = storeState
    if (!currentUserId) return
    setState(s => {
      const comm = s.communities[communityId]
      if (!comm) return s
      return {
        ...s,
        communities: {
          ...s.communities,
          [communityId]: {
            ...comm,
            memberIds: comm.memberIds.filter(id => id !== currentUserId),
          },
        },
      }
    })
  },

  createCommunity(name: string, description: string, isPublic: boolean) {
    const { currentUserId } = storeState
    if (!currentUserId) return null
    const id = generateId('comm')
    const handle = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    const generalChannelId = generateId('ch')
    const generalChannel: import('./types').Channel = {
      id: generalChannelId,
      communityId: id,
      name: 'general',
      description: 'General discussion',
      type: 'text',
    }
    const comm: Community = {
      id,
      name,
      handle,
      description,
      avatarUrl: `https://api.dicebear.com/7.x/shapes/svg?seed=${id}&backgroundColor=b6e3f4`,
      memberIds: [currentUserId],
      adminIds: [currentUserId],
      moderatorIds: [],
      channelIds: [generalChannelId],
      isPublic,
      createdAt: Date.now(),
      creatorId: currentUserId,
    }
    setState(s => ({
      ...s,
      communities: { ...s.communities, [id]: comm },
      channels: { ...s.channels, [generalChannelId]: generalChannel },
    }))
    return id
  },

  markNotificationsRead() {
    setState(s => ({
      ...s,
      notifications: s.notifications.map(n => ({ ...n, read: true })),
    }))
  },

  openComposer(opts?: { replyToId?: string; quoteId?: string }) {
    setState(s => ({
      ...s,
      composerOpen: true,
      composerReplyToId: opts?.replyToId,
      composerQuoteId: opts?.quoteId,
    }))
  },

  closeComposer() {
    setState(s => ({ ...s, composerOpen: false, composerReplyToId: undefined, composerQuoteId: undefined }))
  },

  setSearch(q: string) {
    setState(s => ({ ...s, searchQuery: q }))
  },
}

// ── React hook ──
export function useStore<T>(selector: (state: AppState) => T): T {
  const [value, setValue] = useState(() => selector(getState()))

  useEffect(() => {
    // Run selector once more in case state changed between render and effect
    setValue(selector(getState()))
    const fn = () => setValue(selector(getState()))
    listeners.add(fn)
    return () => { listeners.delete(fn) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return value
}

// Initialize theme on page load
const initialTheme = getState().theme
document.documentElement.classList.toggle('dark', initialTheme === 'dark')
