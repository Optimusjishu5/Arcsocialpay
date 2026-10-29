// Signed chat messages (EIP-712). The sender's wallet signs each message, and
// the server checks the signature before storing it, so nobody can post as
// another address. Used by both the browser and the API routes.

import { createPublicClient, http, isAddress, keccak256, toBytes, verifyTypedData, zeroHash } from 'viem'
import { ARC_CHAIN_ID, ARC_RPC_URL } from '../chains'

export const CHAT_DOMAIN = { name: 'SocialPay Chat', version: '1', chainId: ARC_CHAIN_ID } as const

export const CHAT_TYPES = {
  ChatMessage: [
    { name: 'id', type: 'string' },
    { name: 'conversationId', type: 'string' },
    { name: 'sender', type: 'address' },
    { name: 'content', type: 'string' },
    { name: 'createdAt', type: 'uint256' },
    { name: 'replyToId', type: 'string' },
    { name: 'paymentTxHash', type: 'string' },
  ],
} as const

export interface ChatMessageFields {
  /** Message id: binding it into the signature stops a captured message being replayed as a new one. */
  id: string
  conversationId: string
  sender: `0x${string}`
  content: string
  createdAt: number
  replyToId?: string
  paymentTxHash?: string
}

/** Typed-data message object. Optional fields are signed as empty strings. */
export function chatTypedMessage(f: ChatMessageFields) {
  return {
    id: f.id,
    conversationId: f.conversationId,
    sender: f.sender,
    content: f.content,
    createdAt: BigInt(f.createdAt),
    replyToId: f.replyToId ?? '',
    paymentTxHash: f.paymentTxHash ?? '',
  }
}

export async function verifyChatSignature(f: ChatMessageFields, signature: `0x${string}`): Promise<boolean> {
  if (!isAddress(f.sender)) return false
  const args = {
    address: f.sender,
    domain: CHAT_DOMAIN,
    types: CHAT_TYPES,
    primaryType: 'ChatMessage' as const,
    message: chatTypedMessage(f),
    signature,
  }
  try {
    // Fast path for ordinary wallets (no network call).
    if (await verifyTypedData(args)) return true
  } catch {
    /* fall through to contract-wallet check */
  }
  try {
    // Smart-contract wallets: ERC-1271 check against Arc.
    const client = createPublicClient({ transport: http(ARC_RPC_URL) })
    return await client.verifyTypedData(args)
  } catch {
    return false
  }
}

// ── Profile updates ─────────────────────────────────────────────────────────
// Changing a username, bio, picture or color needs a wallet signature when the
// server stores profiles, so nobody can edit someone else's profile.

export const PROFILE_DOMAIN = { name: 'SocialPay Profile', version: '1', chainId: ARC_CHAIN_ID } as const

export const PROFILE_TYPES = {
  ProfileUpdate: [
    { name: 'address', type: 'address' },
    { name: 'username', type: 'string' },
    { name: 'bio', type: 'string' },
    { name: 'avatarHash', type: 'bytes32' },
    { name: 'accent', type: 'string' },
    { name: 'updatedAt', type: 'uint256' },
  ],
} as const

export interface ProfileFields {
  address: `0x${string}`
  username: string
  bio: string
  avatarUrl: string
  accent: string
  updatedAt: number
}

export function profileTypedMessage(f: ProfileFields) {
  return {
    address: f.address,
    username: f.username,
    bio: f.bio,
    avatarHash: f.avatarUrl ? keccak256(toBytes(f.avatarUrl)) : zeroHash,
    accent: f.accent,
    updatedAt: BigInt(f.updatedAt),
  }
}

export async function verifyProfileSignature(f: ProfileFields, signature: `0x${string}`): Promise<boolean> {
  if (!isAddress(f.address)) return false
  const args = {
    address: f.address,
    domain: PROFILE_DOMAIN,
    types: PROFILE_TYPES,
    primaryType: 'ProfileUpdate' as const,
    message: profileTypedMessage(f),
    signature,
  }
  try {
    if (await verifyTypedData(args)) return true
  } catch {
    /* fall through */
  }
  try {
    const client = createPublicClient({ transport: http(ARC_RPC_URL) })
    return await client.verifyTypedData(args)
  } catch {
    return false
  }
}

/** Shared profile limits (browser form and server route). */
export const PROFILE_ACCENTS = ['blue', 'violet', 'pink', 'rose', 'amber', 'green', 'teal', 'indigo'] as const
export const USERNAME_PATTERN = /^[A-Za-z0-9_.]{3,20}$/
export const BIO_MAX = 160
export const AVATAR_DATA_URL_MAX = 120_000
export const AVATAR_DATA_URL_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/
