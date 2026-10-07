/**
 * Turso (LibSQL) client + schema for persistent chat storage.
 *
 * Env:
 *   TURSO_DATABASE_URL=
 *   TURSO_AUTH_TOKEN=
 *
 * When env vars are missing (local dev without Turso), the module reports
 * `isTursoConfigured() === false` and API routes fall back to a no-op that
 * tells the client to keep using local storage. No crash, no TODO.
 */
import { createClient, type Client } from '@libsql/client'

let cached: Client | null = null
let schemaEnsured = false

export function isTursoConfigured(): boolean {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  const token = process.env.TURSO_AUTH_TOKEN?.trim()
  return !!url && !!token
}

export function getTursoClient(): Client | null {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  const token = process.env.TURSO_AUTH_TOKEN?.trim()
  if (!url || !token) return null
  if (cached) return cached
  cached = createClient({ url, authToken: token })
  return cached
}

export async function ensureChatSchema(): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  if (schemaEnsured) return true
  await db.batch([
    `CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      participants TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      is_group INTEGER NOT NULL DEFAULT 0,
      group_id TEXT,
      last_message TEXT,
      unread_count INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      sender_address TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'sent',
      reply_to_id TEXT,
      payment_tx TEXT,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`,
    `CREATE INDEX IF NOT EXISTS idx_conversations_created ON conversations(created_at DESC)`,
  ])
  schemaEnsured = true
  return true
}

export interface DbConversation {
  id: string
  participants: string[]
  createdAt: number
  isGroup: boolean
  groupId?: string
  lastMessage?: Record<string, unknown> | null
  unreadCount: number
}

export interface DbMessage {
  id: string
  conversationId: string
  senderAddress: string
  content: string
  createdAt: number
  status: string
  replyToId?: string
  paymentTx?: Record<string, unknown> | null
}

function parseJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback
  if (typeof raw === 'object') return raw as T
  try {
    return JSON.parse(String(raw)) as T
  } catch {
    return fallback
  }
}

export async function listConversationsForAddress(address: string): Promise<DbConversation[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureChatSchema()
  const lower = address.toLowerCase()
  // Participants stored as JSON array; filter in JS for case-insensitive match
  // (keeps SQLite simple and avoids LIKE escaping issues).
  const rs = await db.execute(`SELECT * FROM conversations ORDER BY created_at DESC LIMIT 500`)
  const out: DbConversation[] = []
  for (const row of rs.rows) {
    const participants = parseJson<string[]>(row.participants, [])
    if (!participants.some((p) => String(p).toLowerCase() === lower)) continue
    out.push({
      id: String(row.id),
      participants,
      createdAt: Number(row.created_at),
      isGroup: Number(row.is_group) === 1,
      groupId: row.group_id ? String(row.group_id) : undefined,
      lastMessage: parseJson(row.last_message, null),
      unreadCount: Number(row.unread_count ?? 0),
    })
  }
  return out
}

export async function upsertConversation(conv: DbConversation): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureChatSchema()
  await db.execute({
    sql: `INSERT INTO conversations (id, participants, created_at, is_group, group_id, last_message, unread_count)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            participants=excluded.participants,
            last_message=excluded.last_message,
            unread_count=excluded.unread_count`,
    args: [
      conv.id,
      JSON.stringify(conv.participants),
      conv.createdAt,
      conv.isGroup ? 1 : 0,
      conv.groupId ?? null,
      conv.lastMessage ? JSON.stringify(conv.lastMessage) : null,
      conv.unreadCount ?? 0,
    ],
  })
}

export async function listMessages(conversationId: string, limit = 500): Promise<DbMessage[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC LIMIT ?`,
    args: [conversationId, limit],
  })
  return rs.rows.map((row) => ({
    id: String(row.id),
    conversationId: String(row.conversation_id),
    senderAddress: String(row.sender_address),
    content: String(row.content ?? ''),
    createdAt: Number(row.created_at),
    status: String(row.status ?? 'sent'),
    replyToId: row.reply_to_id ? String(row.reply_to_id) : undefined,
    paymentTx: parseJson(row.payment_tx, null),
  }))
}

export async function insertMessage(msg: DbMessage): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureChatSchema()
  await db.execute({
    sql: `INSERT INTO messages (id, conversation_id, sender_address, content, created_at, status, reply_to_id, payment_tx)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content=excluded.content,
            status=excluded.status,
            payment_tx=excluded.payment_tx`,
    args: [
      msg.id,
      msg.conversationId,
      msg.senderAddress,
      msg.content,
      msg.createdAt,
      msg.status,
      msg.replyToId ?? null,
      msg.paymentTx ? JSON.stringify(msg.paymentTx) : null,
    ],
  })
  // Keep conversation last_message in sync
  await db.execute({
    sql: `UPDATE conversations SET last_message = ? WHERE id = ?`,
    args: [
      JSON.stringify({
        id: msg.id,
        conversationId: msg.conversationId,
        senderAddress: msg.senderAddress,
        content: msg.content,
        createdAt: msg.createdAt,
        status: msg.status,
        replyToId: msg.replyToId,
        paymentTx: msg.paymentTx ?? undefined,
      }),
      msg.conversationId,
    ],
  })
}

export async function markConversationRead(conversationId: string): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureChatSchema()
  await db.execute({
    sql: `UPDATE conversations SET unread_count = 0 WHERE id = ?`,
    args: [conversationId],
  })
}

export async function updatePaymentStatus(txHash: string, status: string): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureChatSchema()
  const rs = await db.execute(`SELECT id, payment_tx FROM messages WHERE payment_tx IS NOT NULL LIMIT 1000`)
  const needle = txHash.toLowerCase()
  for (const row of rs.rows) {
    const pay = parseJson<Record<string, unknown> | null>(row.payment_tx, null)
    if (!pay) continue
    const hash = String((pay as { txHash?: unknown }).txHash ?? '').toLowerCase()
    if (hash !== needle) continue
    const next = { ...(pay as object), status }
    await db.execute({
      sql: `UPDATE messages SET payment_tx = ?, status = ? WHERE id = ?`,
      args: [JSON.stringify(next), 'sent', String(row.id)],
    })
  }
}

// ── Social feed persistence (posts / comments / profiles) ───────────────────
// Same pattern as chat: local store stays the source of truth, these tables are
// the cross-device copy synced by app/api/posts|comments|profiles.

let socialSchemaEnsured = false

export async function ensureSocialSchema(): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  if (socialSchemaEnsured) return true
  await db.batch([
    `CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_address TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      edited_at INTEGER,
      like_count INTEGER NOT NULL DEFAULT 0,
      comment_count INTEGER NOT NULL DEFAULT 0,
      repost_count INTEGER NOT NULL DEFAULT 0,
      repost_of TEXT,
      likes TEXT NOT NULL DEFAULT '[]',
      reposts TEXT NOT NULL DEFAULT '[]'
    )`,
    `CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_address TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS profiles (
      address TEXT PRIMARY KEY,
      username TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      avatar_seed TEXT NOT NULL DEFAULT '',
      follower_count INTEGER NOT NULL DEFAULT 0,
      following_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id, created_at)`,
  ])
  socialSchemaEnsured = true
  return true
}

export interface DbPost {
  id: string
  authorAddress: string
  content: string
  createdAt: number
  editedAt?: number
  likeCount: number
  commentCount: number
  repostCount: number
  repostOf?: string
  likes: string[]
  reposts: string[]
}

export interface DbComment {
  id: string
  postId: string
  authorAddress: string
  content: string
  createdAt: number
}

export interface DbProfile {
  address: string
  username: string
  bio: string
  avatarSeed: string
  followerCount: number
  followingCount: number
  createdAt: number
}

function rowToPost(row: Record<string, unknown>): DbPost {
  return {
    id: String(row.id),
    authorAddress: String(row.author_address ?? ''),
    content: String(row.content ?? ''),
    createdAt: Number(row.created_at),
    editedAt: row.edited_at != null ? Number(row.edited_at) : undefined,
    likeCount: Number(row.like_count ?? 0),
    commentCount: Number(row.comment_count ?? 0),
    repostCount: Number(row.repost_count ?? 0),
    repostOf: row.repost_of ? String(row.repost_of) : undefined,
    likes: parseJson<string[]>(row.likes, []),
    reposts: parseJson<string[]>(row.reposts, []),
  }
}

export async function listPosts(limit = 200): Promise<DbPost[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureSocialSchema()
  const rs = await db.execute({
    sql: `SELECT * FROM posts ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  })
  return rs.rows.map((row) => rowToPost(row as Record<string, unknown>))
}

export async function upsertPost(post: DbPost): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureSocialSchema()
  await db.execute({
    sql: `INSERT INTO posts (id, author_address, content, created_at, edited_at, like_count, comment_count, repost_count, repost_of, likes, reposts)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            content=excluded.content,
            edited_at=excluded.edited_at,
            like_count=excluded.like_count,
            comment_count=excluded.comment_count,
            repost_count=excluded.repost_count,
            likes=excluded.likes,
            reposts=excluded.reposts`,
    args: [
      post.id,
      post.authorAddress,
      post.content,
      post.createdAt,
      post.editedAt ?? null,
      post.likeCount ?? 0,
      post.commentCount ?? 0,
      post.repostCount ?? 0,
      post.repostOf ?? null,
      JSON.stringify(post.likes ?? []),
      JSON.stringify(post.reposts ?? []),
    ],
  })
}

export async function deletePostById(id: string): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureSocialSchema()
  await db.execute({ sql: `DELETE FROM comments WHERE post_id = ?`, args: [id] })
  await db.execute({ sql: `DELETE FROM posts WHERE id = ?`, args: [id] })
}

export async function listComments(limit = 500, postId?: string): Promise<DbComment[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureSocialSchema()
  const rs = postId
    ? await db.execute({
        sql: `SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC LIMIT ?`,
        args: [postId, limit],
      })
    : await db.execute({
        sql: `SELECT * FROM comments ORDER BY created_at DESC LIMIT ?`,
        args: [limit],
      })
  return rs.rows.map((row) => ({
    id: String(row.id),
    postId: String(row.post_id),
    authorAddress: String(row.author_address ?? ''),
    content: String(row.content ?? ''),
    createdAt: Number(row.created_at),
  }))
}

export async function upsertComment(comment: DbComment): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureSocialSchema()
  await db.execute({
    sql: `INSERT INTO comments (id, post_id, author_address, content, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET content=excluded.content`,
    args: [comment.id, comment.postId, comment.authorAddress, comment.content, comment.createdAt],
  })
}

export async function listProfiles(limit = 500): Promise<DbProfile[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureSocialSchema()
  const rs = await db.execute({
    sql: `SELECT * FROM profiles ORDER BY created_at DESC LIMIT ?`,
    args: [limit],
  })
  return rs.rows.map((row) => ({
    address: String(row.address),
    username: String(row.username ?? ''),
    bio: String(row.bio ?? ''),
    avatarSeed: String(row.avatar_seed ?? ''),
    followerCount: Number(row.follower_count ?? 0),
    followingCount: Number(row.following_count ?? 0),
    createdAt: Number(row.created_at),
  }))
}

export async function upsertProfile(profile: DbProfile): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureSocialSchema()
  await db.execute({
    sql: `INSERT INTO profiles (address, username, bio, avatar_seed, follower_count, following_count, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(address) DO UPDATE SET
            username=excluded.username,
            bio=excluded.bio,
            avatar_seed=excluded.avatar_seed,
            follower_count=excluded.follower_count,
            following_count=excluded.following_count`,
    args: [
      profile.address,
      profile.username,
      profile.bio,
      profile.avatarSeed,
      profile.followerCount ?? 0,
      profile.followingCount ?? 0,
      profile.createdAt,
    ],
  })
}

// ── Payment history persistence (normal pay + tips) ──────────────────────────
// Chat payment messages already persist via messages.payment_tx; this table
// covers the wallet tx history (PayView / WalletView / tips) so it renders
// correctly across reloads and devices.

let txSchemaEnsured = false

export async function ensureTxSchema(): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  if (txSchemaEnsured) return true
  await db.batch([
    `CREATE TABLE IF NOT EXISTS tx_records (
      tx_hash TEXT PRIMARY KEY,
      id TEXT NOT NULL,
      chain_id INTEGER NOT NULL,
      direction TEXT NOT NULL,
      amount TEXT NOT NULL,
      from_address TEXT NOT NULL,
      to_address TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      timestamp INTEGER NOT NULL,
      note TEXT,
      block_number INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tx_records_parties ON tx_records(from_address, to_address, timestamp DESC)`,
  ])
  txSchemaEnsured = true
  return true
}

export interface DbTxRecord {
  id: string
  txHash: string
  chainId: number
  direction: string
  amount: string
  fromAddress: string
  toAddress: string
  status: string
  timestamp: number
  note?: string
  blockNumber?: number
}

export async function listTxRecords(address: string, limit = 200): Promise<DbTxRecord[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureTxSchema()
  const lower = address.toLowerCase()
  const rs = await db.execute({
    sql: `SELECT * FROM tx_records
          WHERE lower(from_address) = ? OR lower(to_address) = ?
          ORDER BY timestamp DESC LIMIT ?`,
    args: [lower, lower, limit],
  })
  return rs.rows.map((row) => ({
    id: String(row.id),
    txHash: String(row.tx_hash),
    chainId: Number(row.chain_id),
    direction: String(row.direction ?? 'sent'),
    amount: String(row.amount ?? ''),
    fromAddress: String(row.from_address ?? ''),
    toAddress: String(row.to_address ?? ''),
    status: String(row.status ?? 'pending'),
    timestamp: Number(row.timestamp),
    note: row.note != null ? String(row.note) : undefined,
    blockNumber: row.block_number != null ? Number(row.block_number) : undefined,
  }))
}

export async function upsertTxRecord(tx: DbTxRecord): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureTxSchema()
  await db.execute({
    sql: `INSERT INTO tx_records (tx_hash, id, chain_id, direction, amount, from_address, to_address, status, timestamp, note, block_number)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tx_hash) DO UPDATE SET
            status=excluded.status,
            note=excluded.note,
            block_number=excluded.block_number`,
    args: [
      tx.txHash,
      tx.id,
      tx.chainId,
      tx.direction,
      tx.amount,
      tx.fromAddress,
      tx.toAddress,
      tx.status,
      tx.timestamp,
      tx.note ?? null,
      tx.blockNumber ?? null,
    ],
  })
}
