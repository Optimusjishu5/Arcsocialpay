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
    // Who may read a conversation. Every private read joins on this table, so access is decided by the
    // database query itself and not by anything the caller sends.
    `CREATE TABLE IF NOT EXISTS conversation_members (
      conversation_id TEXT NOT NULL,
      address TEXT NOT NULL,
      PRIMARY KEY (conversation_id, address),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    )`,
    `CREATE INDEX IF NOT EXISTS idx_members_address ON conversation_members(address)`,
  ])
  // Signed messages (EIP-712). Older databases lack the column; adding it twice errors, which is fine.
  await db.execute(`ALTER TABLE messages ADD COLUMN signature TEXT`).catch(() => undefined)
  // Who created the conversation (only they can remove people from a group).
  await db.execute(`ALTER TABLE conversations ADD COLUMN created_by TEXT`).catch(() => undefined)
  // Existing conversations keep their history: their participants become members.
  await db.execute(
    `INSERT OR IGNORE INTO conversation_members (conversation_id, address)
     SELECT c.id, lower(j.value) FROM conversations c, json_each(c.participants) j
     WHERE json_valid(c.participants)`,
  )
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
  signature?: string
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

type Row = Record<string, unknown>

function toConversation(row: Row): DbConversation {
  return {
    id: String(row.id),
    participants: parseJson<string[]>(row.participants, []),
    createdAt: Number(row.created_at),
    isGroup: Number(row.is_group) === 1,
    groupId: row.group_id ? String(row.group_id) : undefined,
    lastMessage: parseJson(row.last_message, null),
    unreadCount: Number(row.unread_count ?? 0),
  }
}

const lower = (a: string) => a.toLowerCase()

/** True when `address` is a member of the conversation. */
export async function isMember(conversationId: string, address: string): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `SELECT 1 FROM conversation_members WHERE conversation_id = ? AND address = ? LIMIT 1`,
    args: [conversationId, lower(address)],
  })
  return rs.rows.length > 0
}

/** Only the conversations `address` belongs to (decided in SQL), newest first. */
export async function listConversationsForAddress(address: string, limit = 500): Promise<DbConversation[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `SELECT c.* FROM conversations c
          JOIN conversation_members m ON m.conversation_id = c.id
          WHERE m.address = ?
          ORDER BY c.created_at DESC LIMIT ?`,
    args: [lower(address), limit],
  })
  return rs.rows.map((r) => toConversation(r as Row))
}

export type ConversationWrite = 'created' | 'updated' | 'forbidden'

/**
 * Saves a conversation on behalf of `actor` (the verified caller):
 *  - the actor must be one of the participants of a new conversation;
 *  - a direct chat's two people are fixed when it is created and never change;
 *  - for an existing conversation only a member may update it;
 *  - in a group any member may add people, only the creator may remove them.
 */
export async function upsertConversation(conv: DbConversation, actor: string): Promise<ConversationWrite> {
  const db = getTursoClient()
  if (!db) return 'forbidden'
  await ensureChatSchema()
  const me = lower(actor)
  const people = [...new Set(conv.participants.map((p) => lower(String(p))))]
  const existing = await db.execute({ sql: `SELECT id, is_group, created_by FROM conversations WHERE id = ?`, args: [conv.id] })
  // The preview line is never taken from the caller: it is set from real, signed messages only.

  if (existing.rows.length === 0) {
    if (!people.includes(me)) return 'forbidden'
    if (!conv.isGroup && people.length > 2) return 'forbidden'
    await db.batch([
      {
        sql: `INSERT INTO conversations (id, participants, created_at, is_group, group_id, last_message, unread_count, created_by)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [conv.id, JSON.stringify(conv.participants), conv.createdAt, conv.isGroup ? 1 : 0, conv.groupId ?? null, null, conv.unreadCount ?? 0, me],
      },
      ...people.map((p) => ({ sql: `INSERT OR IGNORE INTO conversation_members (conversation_id, address) VALUES (?, ?)`, args: [conv.id, p] })),
    ])
    return 'created'
  }

  if (!(await isMember(conv.id, me))) return 'forbidden'
  const row = existing.rows[0] as Row
  const isGroup = Number(row.is_group) === 1
  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    { sql: `UPDATE conversations SET unread_count = ? WHERE id = ?`, args: [conv.unreadCount ?? 0, conv.id] },
  ]
  if (isGroup) {
    const creator = row.created_by ? lower(String(row.created_by)) : null
    const isCreator = creator !== null && me === creator
    const current = await db.execute({ sql: `SELECT address FROM conversation_members WHERE conversation_id = ?`, args: [conv.id] })
    const have = new Set(current.rows.map((r) => String((r as Row).address)))
    // The creator sets the member list; any other member can only add people.
    const next = isCreator ? new Set([...people, me]) : new Set([...have, ...people])
    for (const p of next) {
      if (!have.has(p)) stmts.push({ sql: `INSERT OR IGNORE INTO conversation_members (conversation_id, address) VALUES (?, ?)`, args: [conv.id, p] })
    }
    if (isCreator) {
      for (const p of have) {
        if (!next.has(p)) stmts.push({ sql: `DELETE FROM conversation_members WHERE conversation_id = ? AND address = ?`, args: [conv.id, p] })
      }
    }
    stmts.push({ sql: `UPDATE conversations SET participants = ? WHERE id = ?`, args: [JSON.stringify([...next]), conv.id] })
  }
  await db.batch(stmts)
  return 'updated'
}

/** The conversation, but only when `address` is a member (otherwise null, as if it did not exist). */
export async function getConversationFor(id: string, address: string): Promise<DbConversation | null> {
  const db = getTursoClient()
  if (!db) return null
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `SELECT c.* FROM conversations c
          JOIN conversation_members m ON m.conversation_id = c.id
          WHERE c.id = ? AND m.address = ?`,
    args: [id, lower(address)],
  })
  return rs.rows[0] ? toConversation(rs.rows[0] as Row) : null
}

/** Messages of a conversation, only when `address` is a member (an outsider gets an empty list). */
export async function listMessages(conversationId: string, address: string, limit = 500): Promise<DbMessage[]> {
  const db = getTursoClient()
  if (!db) return []
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `SELECT msg.* FROM messages msg
          JOIN conversation_members m ON m.conversation_id = msg.conversation_id
          WHERE msg.conversation_id = ? AND m.address = ?
          ORDER BY msg.created_at ASC LIMIT ?`,
    args: [conversationId, lower(address), limit],
  })
  return rs.rows.map((r) => {
    const row = r as Row
    return {
      id: String(row.id),
      conversationId: String(row.conversation_id),
      senderAddress: String(row.sender_address),
      content: String(row.content ?? ''),
      createdAt: Number(row.created_at),
      status: String(row.status ?? 'sent'),
      replyToId: row.reply_to_id ? String(row.reply_to_id) : undefined,
      paymentTx: parseJson(row.payment_tx, null),
      signature: row.signature ? String(row.signature) : undefined,
    }
  })
}

/** Stores a message. The caller must already have checked the sender is a member. */
export async function insertMessage(msg: DbMessage): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureChatSchema()
  await db.batch([
    {
      // An existing message is never rewritten; only its sender may touch its status.
      sql: `INSERT INTO messages (id, conversation_id, sender_address, content, created_at, status, reply_to_id, payment_tx, signature)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET status=excluded.status
            WHERE messages.sender_address = excluded.sender_address AND messages.conversation_id = excluded.conversation_id`,
      args: [
        msg.id, msg.conversationId, msg.senderAddress, msg.content, msg.createdAt, msg.status,
        msg.replyToId ?? null, msg.paymentTx ? JSON.stringify(msg.paymentTx) : null, msg.signature ?? null,
      ],
    },
    {
      sql: `UPDATE conversations SET last_message = ? WHERE id = ?`,
      args: [
        JSON.stringify({
          id: msg.id, conversationId: msg.conversationId, senderAddress: msg.senderAddress, content: msg.content,
          createdAt: msg.createdAt, status: msg.status, replyToId: msg.replyToId, paymentTx: msg.paymentTx ?? undefined,
        }),
        msg.conversationId,
      ],
    },
  ])
}

/** Marks a conversation read, only for a member. Returns whether anything was updated. */
export async function markConversationRead(conversationId: string, address: string): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `UPDATE conversations SET unread_count = 0
          WHERE id = ? AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = conversations.id AND m.address = ?)`,
    args: [conversationId, lower(address)],
  })
  return rs.rowsAffected > 0
}

const PAYMENT_STATUSES = new Set(['pending', 'confirmed', 'failed'])

/** Updates the status shown on a payment card, only in conversations the caller belongs to. */
export async function updatePaymentStatus(txHash: string, status: string, address: string): Promise<number> {
  const db = getTursoClient()
  if (!db) return 0
  if (!PAYMENT_STATUSES.has(status)) return 0
  await ensureChatSchema()
  const rs = await db.execute({
    sql: `SELECT msg.id, msg.payment_tx FROM messages msg
          JOIN conversation_members m ON m.conversation_id = msg.conversation_id
          WHERE msg.payment_tx IS NOT NULL AND m.address = ? LIMIT 1000`,
    args: [lower(address)],
  })
  const needle = txHash.toLowerCase()
  let updated = 0
  for (const row of rs.rows) {
    const pay = parseJson<Record<string, unknown> | null>((row as Row).payment_tx, null)
    if (!pay) continue
    if (String((pay as { txHash?: unknown }).txHash ?? '').toLowerCase() !== needle) continue
    await db.execute({
      sql: `UPDATE messages SET payment_tx = ?, status = ? WHERE id = ?`,
      args: [JSON.stringify({ ...(pay as object), status }), 'sent', String((row as Row).id)],
    })
    updated++
  }
  return updated
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
  // Profile picture and color were added later: add the columns once, ignore if they exist.
  for (const col of ['avatar_url', 'accent']) {
    try {
      await db.execute(`ALTER TABLE profiles ADD COLUMN ${col} TEXT NOT NULL DEFAULT ''`)
    } catch {
      /* column already exists */
    }
  }
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
  avatarUrl?: string
  accent?: string
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
    avatarUrl: String(row.avatar_url ?? ''),
    accent: String(row.accent ?? ''),
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

/** True when another address already uses this username (case-insensitive). */
export async function isUsernameTaken(username: string, address: string): Promise<boolean> {
  const db = getTursoClient()
  if (!db) return false
  await ensureSocialSchema()
  const rs = await db.execute({
    sql: `SELECT 1 FROM profiles WHERE lower(username) = lower(?) AND lower(address) != lower(?) LIMIT 1`,
    args: [username, address],
  })
  return rs.rows.length > 0
}

/** Signed profile edit: the only way to change name, bio, picture or color on the server. */
export async function updateProfileIdentity(p: {
  address: string
  username: string
  bio: string
  avatarUrl: string
  accent: string
}): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureSocialSchema()
  await db.execute({
    sql: `INSERT INTO profiles (address, username, bio, avatar_seed, avatar_url, accent, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(address) DO UPDATE SET
            username=excluded.username,
            bio=excluded.bio,
            avatar_url=excluded.avatar_url,
            accent=excluded.accent`,
    args: [p.address, p.username, p.bio, p.address, p.avatarUrl, p.accent, Date.now()],
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
  // Swap and bridge entries were added later: add the columns once, ignore if they exist.
  for (const col of ['kind', 'summary', 'symbol']) {
    try {
      await db.execute(`ALTER TABLE tx_records ADD COLUMN ${col} TEXT`)
    } catch {
      /* column already exists */
    }
  }
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
  kind?: string
  summary?: string
  symbol?: string
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
    kind: row.kind != null ? String(row.kind) : undefined,
    summary: row.summary != null ? String(row.summary) : undefined,
    symbol: row.symbol != null ? String(row.symbol) : undefined,
  }))
}

export async function upsertTxRecord(tx: DbTxRecord): Promise<void> {
  const db = getTursoClient()
  if (!db) return
  await ensureTxSchema()
  await db.execute({
    sql: `INSERT INTO tx_records (tx_hash, id, chain_id, direction, amount, from_address, to_address, status, timestamp, note, block_number, kind, summary, symbol)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(tx_hash) DO UPDATE SET
            status=excluded.status,
            note=excluded.note,
            block_number=excluded.block_number,
            kind=COALESCE(excluded.kind, tx_records.kind),
            summary=COALESCE(excluded.summary, tx_records.summary),
            symbol=COALESCE(excluded.symbol, tx_records.symbol)`,
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
      tx.kind ?? null,
      tx.summary ?? null,
      tx.symbol ?? null,
    ],
  })
}
