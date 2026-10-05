// ── ArcSocial Core Types ──

export type PostMediaType = 'image' | 'video' | 'link'

export interface PostMedia {
  type: PostMediaType
  url: string
  thumbnail?: string
  title?: string
  description?: string
}

export type PostType = 'post' | 'repost' | 'quote' | 'reply'

export interface Post {
  id: string
  authorId: string
  content: string
  media?: PostMedia[]
  type: PostType
  originalPostId?: string
  quotedPostId?: string
  replyToId?: string
  likes: string[]       // array of user IDs who liked
  reposts: string[]
  replies: string[]
  quotes: string[]
  bookmarks: string[]
  views: number
  onchain?: {
    txHash: string
    chainId: number
    status: 'pending' | 'confirmed' | 'failed'
  }
  createdAt: number
  communityId?: string
  channelId?: string
  isPinned?: boolean
}

export interface User {
  id: string           // wallet address or generated
  address?: string     // Arc wallet address
  username: string
  displayName: string
  bio?: string
  avatarUrl?: string
  bannerUrl?: string
  followers: string[]
  following: string[]
  joinedAt: number
  isVerified?: boolean
  website?: string
  location?: string
  postsCount: number
}

export interface Message {
  id: string
  conversationId: string
  senderId: string
  content: string
  media?: PostMedia[]
  status: 'sending' | 'sent' | 'delivered' | 'read'
  replyToId?: string
  reactions: Record<string, string[]>  // emoji -> [userId]
  createdAt: number
  onchainTip?: {
    amount: string   // USDC 6-decimal string
    txHash: string
    status: 'pending' | 'confirmed' | 'failed'
  }
}

export type ConversationType = 'dm' | 'group' | 'channel'

export interface Conversation {
  id: string
  type: ConversationType
  name?: string
  description?: string
  avatarUrl?: string
  participantIds: string[]
  adminIds: string[]
  lastMessage?: Message
  unreadCount: number
  createdAt: number
  communityId?: string
  isPinned?: boolean
}

export interface Community {
  id: string
  name: string
  handle: string
  description?: string
  avatarUrl?: string
  bannerUrl?: string
  memberIds: string[]
  adminIds: string[]
  moderatorIds: string[]
  channelIds: string[]
  rules?: string[]
  isPublic: boolean
  createdAt: number
  creatorId: string
  category?: string
  tags?: string[]
}

export interface Channel {
  id: string
  communityId: string
  name: string
  description?: string
  type: 'text' | 'announcement' | 'media'
  isPrivate?: boolean
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'follow'
  | 'repost'
  | 'quote'
  | 'mention'
  | 'tip'
  | 'reply'

export interface Notification {
  id: string
  type: NotificationType
  actorId: string
  targetId?: string    // post id or user id
  targetPostId?: string
  read: boolean
  createdAt: number
  tipAmount?: string
}

export type ActiveView =
  | 'feed'
  | 'explore'
  | 'messages'
  | 'notifications'
  | 'wallet'
  | 'profile'
  | 'communities'
  | 'community'
  | 'settings'

export interface AppState {
  // Theme
  theme: 'light' | 'dark'

  // Navigation
  activeView: ActiveView
  selectedUserId?: string
  selectedConversationId?: string
  selectedCommunityId?: string
  selectedPostId?: string

  // Data
  posts: Record<string, Post>
  users: Record<string, User>
  messages: Record<string, Message>
  conversations: Record<string, Conversation>
  communities: Record<string, Community>
  channels: Record<string, Channel>
  notifications: Notification[]

  // Current user (set once wallet is connected)
  currentUserId?: string

  // UI state
  composerOpen: boolean
  composerReplyToId?: string
  composerQuoteId?: string
  searchQuery: string
  mobileNavOpen: boolean
}
