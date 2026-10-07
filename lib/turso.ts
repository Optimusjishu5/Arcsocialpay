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
    const pay = parseJson<Record<string, unknown>>(row.payment_tx, null)
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
