// ── Core application types ─────────────────────────────────────────────────

export type NavView =
  | 'home' | 'messages' | 'pay' | 'swap' | 'bridge' | 'explore' | 'activity' | 'notifications' | 'profile' | 'settings'

// ── User / Profile ─────────────────────────────────────────────────────────

export interface UserProfile {
  address: string
  username: string
  bio: string
  avatarSeed: string // used to generate deterministic avatar color/initials
  avatarUrl?: string // uploaded profile picture (small compressed data URL)
  accent?: string // profile color: blue, violet, pink, ...
  followerCount: number
  followingCount: number
  createdAt: number
}

// ── Social ─────────────────────────────────────────────────────────────────

export interface Post {
  id: string
  authorAddress: string
  content: string
  createdAt: number
  editedAt?: number
  likeCount: number
  commentCount: number
  repostCount: number
  repostOf?: string // original post id if this is a repost
  likes: string[] // addresses that liked
  reposts: string[] // addresses that reposted
}

export interface Comment {
  id: string
  postId: string
  authorAddress: string
  content: string
  createdAt: number
}

// ── Messaging ──────────────────────────────────────────────────────────────

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'failed'

export interface Message {
  id: string
  conversationId: string
  senderAddress: string
  content: string
  createdAt: number
  status: MessageStatus
  replyToId?: string
  deletedForMe?: boolean
  paymentTx?: PaymentMessage
  /** EIP-712 signature by the sender (see lib/chatAuth). Present on server-synced text messages. */
  signature?: string
}

export interface PaymentMessage {
  txHash: string
  amount: string // USDC formatted
  sender: string
  recipient: string
  status: 'pending' | 'confirmed' | 'failed'
  chainId: number
}

export interface Conversation {
  id: string
  participants: string[] // wallet addresses
  lastMessage?: Message
  unreadCount: number
  createdAt: number
  isGroup: boolean
  groupId?: string
}

// ── Groups & Channels ──────────────────────────────────────────────────────

export type GroupType = 'group' | 'channel'

export interface Group {
  id: string
  name: string
  description: string
  type: GroupType
  isPrivate: boolean
  ownerAddress: string
  adminAddresses: string[]
  memberAddresses: string[]
  invitedAddresses?: string[]
  createdAt: number
  avatarSeed: string
  messageCount: number
}

// ── Transactions ───────────────────────────────────────────────────────────

export type TxStatus = 'pending' | 'confirmed' | 'failed'
export type TxDirection = 'sent' | 'received'
/** What a history entry is. Missing means a plain payment. */
export type TxKind = 'payment' | 'swap' | 'bridge'

export interface TxRecord {
  id: string
  txHash: string
  chainId: number
  direction: TxDirection
  amount: string // USDC formatted (6 decimals)
  fromAddress: string
  toAddress: string
  status: TxStatus
  timestamp: number
  note?: string
  blockNumber?: number
  kind?: TxKind
  /** One-line description for swaps and bridges, e.g. "5 USDC to 4.48 EURC". */
  summary?: string
  /** Token the amount is in. Missing means USDC. */
  symbol?: string
}

// ── Notification ───────────────────────────────────────────────────────────

export type NotifType = 'like' | 'comment' | 'repost' | 'follow' | 'payment' | 'mention' | 'message'

export interface Notification {
  id: string
  type: NotifType
  fromAddress: string
  targetId?: string // post id, tx id etc.
  content?: string
  createdAt: number
  read: boolean
}
