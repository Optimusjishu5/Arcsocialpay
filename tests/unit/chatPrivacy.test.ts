// Wallet A / Wallet B / outsider C against the real API route handlers and a real SQLite database,
// with real wallet signatures. Nothing is mocked: every request goes through the same code the app runs.
import { describe, expect, test, beforeAll } from 'bun:test'
import { createClient } from '@libsql/client'
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { createHmac } from 'node:crypto'

const dbFile = `/tmp/socialpay-privacy-${Date.now()}-${Math.random().toString(36).slice(2)}.db`
process.env.TURSO_DATABASE_URL = `file:${dbFile}`
process.env.TURSO_AUTH_TOKEN = 'test-token-not-a-secret'
process.env.CHAT_SESSION_SECRET = 'unit-test-session-secret-0123456789'

const A = privateKeyToAccount(generatePrivateKey())
const B = privateKeyToAccount(generatePrivateKey())
const C = privateKeyToAccount(generatePrivateKey())
const D = privateKeyToAccount(generatePrivateKey())

type Handlers = {
  conv: typeof import('../../app/api/conversations/route')
  msg: typeof import('../../app/api/messages/route')
  challenge: typeof import('../../app/api/auth/challenge/route')
  session: typeof import('../../app/api/auth/session/route')
  auth: typeof import('../../src/lib/chatAuth')
  sess: typeof import('../../lib/session')
}
let h: Handlers

const URL_BASE = 'http://localhost'
const req = (path: string, method: string, token?: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function login(account: typeof A): Promise<string> {
  const ch = await h.challenge.POST(req('/api/auth/challenge', 'POST', undefined, { address: account.address }))
  const { challenge } = (await ch.json()) as { challenge: { address: string; nonce: string; issuedAt: number; expiresAt: number } }
  const signature = await account.signTypedData({
    domain: h.auth.LOGIN_DOMAIN, types: h.auth.LOGIN_TYPES, primaryType: 'ChatLogin',
    message: h.auth.loginTypedMessage({ address: account.address, nonce: challenge.nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt }),
  })
  const res = await h.session.POST(req('/api/auth/session', 'POST', undefined, { challenge, signature }))
  expect(res.status).toBe(200)
  return ((await res.json()) as { token: string }).token
}

let n = 0
async function say(account: typeof A, token: string, conversationId: string, content: string) {
  const id = `m${Date.now()}${++n}`
  const createdAt = Date.now()
  const signature = await account.signTypedData({
    domain: h.auth.CHAT_DOMAIN, types: h.auth.CHAT_TYPES, primaryType: 'ChatMessage',
    message: h.auth.chatTypedMessage({ id, conversationId, sender: account.address, content, createdAt }),
  })
  return h.msg.POST(req('/api/messages', 'POST', token, { id, conversationId, senderAddress: account.address, content, createdAt, signature }))
}

const DM = 'dmconv_ab_000001'
const GROUP = 'groupconv_000001'
const LEGACY_AB = 'legacyconv_ab_01'
const LEGACY_CD = 'legacyconv_cd_01'
let tokenA = ''
let tokenB = ''
let tokenC = ''

beforeAll(async () => {
  // A database written by the OLD version: no member table, rows already there. It must keep working.
  const old = createClient({ url: `file:${dbFile}` })
  await old.batch([
    `CREATE TABLE conversations (id TEXT PRIMARY KEY, participants TEXT NOT NULL, created_at INTEGER NOT NULL, is_group INTEGER NOT NULL DEFAULT 0, group_id TEXT, last_message TEXT, unread_count INTEGER NOT NULL DEFAULT 0)`,
    `CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, sender_address TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'sent', reply_to_id TEXT, payment_tx TEXT, FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE)`,
    { sql: `INSERT INTO conversations (id, participants, created_at) VALUES (?, ?, ?)`, args: [LEGACY_AB, JSON.stringify([A.address, B.address]), 1000] },
    { sql: `INSERT INTO conversations (id, participants, created_at) VALUES (?, ?, ?)`, args: [LEGACY_CD, JSON.stringify([C.address, D.address]), 2000] },
    { sql: `INSERT INTO messages (id, conversation_id, sender_address, content, created_at) VALUES (?, ?, ?, ?, ?)`, args: ['old1', LEGACY_AB, A.address, 'old message between A and B', 1001] },
    { sql: `INSERT INTO messages (id, conversation_id, sender_address, content, created_at) VALUES (?, ?, ?, ?, ?)`, args: ['old2', LEGACY_CD, C.address, 'old message between C and D', 2001] },
  ])
  old.close()
  h = {
    conv: await import('../../app/api/conversations/route'),
    msg: await import('../../app/api/messages/route'),
    challenge: await import('../../app/api/auth/challenge/route'),
    session: await import('../../app/api/auth/session/route'),
    auth: await import('../../src/lib/chatAuth'),
    sess: await import('../../lib/session'),
  }
  tokenA = await login(A)
  tokenB = await login(B)
  tokenC = await login(C)
})

const listIds = async (token: string) => {
  const r = await h.conv.GET(req('/api/conversations', 'GET', token))
  expect(r.status).toBe(200)
  return ((await r.json()) as { conversations: { id: string }[] }).conversations.map((c) => c.id).sort()
}

describe('signing in', () => {
  test('a wrong wallet signature does not get a session', async () => {
    const ch = await h.challenge.POST(req('/api/auth/challenge', 'POST', undefined, { address: A.address }))
    const { challenge } = (await ch.json()) as { challenge: { nonce: string; issuedAt: number; expiresAt: number; address: string } }
    // C signs a challenge that names A.
    const signature = await C.signTypedData({
      domain: h.auth.LOGIN_DOMAIN, types: h.auth.LOGIN_TYPES, primaryType: 'ChatLogin',
      message: h.auth.loginTypedMessage({ address: A.address, nonce: challenge.nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt }),
    })
    const res = await h.session.POST(req('/api/auth/session', 'POST', undefined, { challenge, signature }))
    expect(res.status).toBe(401)
  })

  test('a tampered or expired challenge is refused', async () => {
    const ch = await h.challenge.POST(req('/api/auth/challenge', 'POST', undefined, { address: A.address }))
    const { challenge } = (await ch.json()) as { challenge: { nonce: string; issuedAt: number; expiresAt: number; address: string; proof: string } }
    const sign = (c: typeof challenge) => A.signTypedData({
      domain: h.auth.LOGIN_DOMAIN, types: h.auth.LOGIN_TYPES, primaryType: 'ChatLogin',
      message: h.auth.loginTypedMessage({ address: A.address, nonce: c.nonce, issuedAt: c.issuedAt, expiresAt: c.expiresAt }),
    })
    const longer = { ...challenge, expiresAt: challenge.expiresAt + 3_600_000 }
    expect((await h.session.POST(req('/api/auth/session', 'POST', undefined, { challenge: longer, signature: await sign(longer) }))).status).toBe(401)
    const old = h.sess.makeChallenge(A.address, Date.now() - 10 * 60_000)!
    expect((await h.session.POST(req('/api/auth/session', 'POST', undefined, { challenge: old, signature: await sign(old) }))).status).toBe(401)
  })

  test('forged, altered and expired session tokens are refused', async () => {
    const [v, payload, sig] = tokenA.split('.')
    const forgedPayload = Buffer.from(JSON.stringify({ a: B.address.toLowerCase(), e: Date.now() + 1e9 })).toString('base64url')
    for (const bad of [`${v}.${forgedPayload}.${sig}`, `${v}.${payload}.${sig}x`, 'garbage', '', `v1.${payload}.`]) {
      expect((await h.conv.GET(req('/api/conversations', 'GET', bad))).status).toBe(401)
    }
    const secret = Buffer.from(process.env.CHAT_SESSION_SECRET!)
    const expiredPayload = Buffer.from(JSON.stringify({ a: A.address.toLowerCase(), e: Date.now() - 1000 })).toString('base64url')
    const expired = `v1.${expiredPayload}.${createHmac('sha256', secret).update(`session|${expiredPayload}`).digest('base64url')}`
    expect((await h.conv.GET(req('/api/conversations', 'GET', expired))).status).toBe(401)
  })
})

describe('no sign-in, no private data', () => {
  test('unauthenticated requests get nothing from any endpoint', async () => {
    expect((await h.conv.GET(req('/api/conversations?address=' + A.address, 'GET'))).status).toBe(401)
    expect((await h.msg.GET(req('/api/messages?conversationId=' + LEGACY_AB, 'GET'))).status).toBe(401)
    expect((await h.conv.POST(req('/api/conversations', 'POST', undefined, { id: 'whatever_id_1', participants: [A.address] }))).status).toBe(401)
    expect((await h.msg.POST(req('/api/messages', 'POST', undefined, { id: 'x', conversationId: LEGACY_AB, senderAddress: A.address, content: 'hi' }))).status).toBe(401)
    expect((await h.conv.PATCH(req('/api/conversations', 'PATCH', undefined, { conversationId: LEGACY_AB }))).status).toBe(401)
    expect((await h.msg.PATCH(req('/api/messages', 'PATCH', undefined, { txHash: '0x1', status: 'failed' }))).status).toBe(401)
  })
})

describe('existing history is kept and fenced', () => {
  test('wallets see their own old conversations, and only those', async () => {
    expect(await listIds(tokenA)).toEqual([LEGACY_AB])
    expect(await listIds(tokenB)).toEqual([LEGACY_AB])
    expect(await listIds(tokenC)).toEqual([LEGACY_CD])
  })

  test('old messages are readable by their two people and nobody else', async () => {
    const a = await h.msg.GET(req('/api/messages?conversationId=' + LEGACY_AB, 'GET', tokenA))
    expect(((await a.json()) as { messages: { content: string }[] }).messages.map((m) => m.content)).toEqual(['old message between A and B'])
    expect((await h.msg.GET(req('/api/messages?conversationId=' + LEGACY_AB, 'GET', tokenB))).status).toBe(200)
    const c = await h.msg.GET(req('/api/messages?conversationId=' + LEGACY_AB, 'GET', tokenC))
    expect(c.status).toBe(404)
    expect(JSON.stringify(await c.json())).not.toContain('old message')
  })
})

describe('Wallet A and Wallet B', () => {
  test('A starts a chat with B and both see it; the outsider does not', async () => {
    const created = await h.conv.POST(req('/api/conversations', 'POST', tokenA, { id: DM, participants: [A.address, B.address], createdAt: Date.now() }))
    expect(created.status).toBe(200)
    expect((await say(A, tokenA, DM, 'hello B')).status).toBe(200)
    expect((await say(B, tokenB, DM, 'hello A')).status).toBe(200)
    expect(await listIds(tokenA)).toEqual([DM, LEGACY_AB].sort())
    expect(await listIds(tokenB)).toEqual([DM, LEGACY_AB].sort())
    expect(await listIds(tokenC)).toEqual([LEGACY_CD])
    const msgsB = (await (await h.msg.GET(req('/api/messages?conversationId=' + DM, 'GET', tokenB))).json()) as { messages: { content: string; senderAddress: string }[] }
    expect(msgsB.messages.map((m) => m.content)).toEqual(['hello B', 'hello A'])
    expect(msgsB.messages.map((m) => m.senderAddress.toLowerCase())).toEqual([A.address.toLowerCase(), B.address.toLowerCase()])
  })

  test('messages are saved under the signed-in sender, whatever the request says', async () => {
    // C is signed in but names A as the sender.
    const id = 'spoof' + Date.now()
    const createdAt = Date.now()
    const signature = await C.signTypedData({
      domain: h.auth.CHAT_DOMAIN, types: h.auth.CHAT_TYPES, primaryType: 'ChatMessage',
      message: h.auth.chatTypedMessage({ id, conversationId: DM, sender: C.address, content: 'spoof', createdAt }),
    })
    const asA = await h.msg.POST(req('/api/messages', 'POST', tokenC, { id, conversationId: DM, senderAddress: A.address, content: 'spoof', createdAt, signature }))
    expect(asA.status).toBe(403)
    const asC = await h.msg.POST(req('/api/messages', 'POST', tokenC, { id, conversationId: DM, senderAddress: C.address, content: 'spoof', createdAt, signature }))
    expect(asC.status).toBe(404)
    const all = (await (await h.msg.GET(req('/api/messages?conversationId=' + DM, 'GET', tokenA))).json()) as { messages: { content: string }[] }
    expect(all.messages.some((m) => m.content === 'spoof')).toBe(false)
  })

  test('a valid session cannot send a message signed by someone else', async () => {
    const id = 'forged' + Date.now()
    const createdAt = Date.now()
    const signature = await C.signTypedData({
      domain: h.auth.CHAT_DOMAIN, types: h.auth.CHAT_TYPES, primaryType: 'ChatMessage',
      message: h.auth.chatTypedMessage({ id, conversationId: DM, sender: A.address, content: 'forged', createdAt }),
    })
    const res = await h.msg.POST(req('/api/messages', 'POST', tokenA, { id, conversationId: DM, senderAddress: A.address, content: 'forged', createdAt, signature }))
    expect(res.status).toBe(401)
  })
})

describe('changing parameters does not get around it', () => {
  test('asking for another wallet\'s conversation list is refused', async () => {
    expect((await h.conv.GET(req('/api/conversations?address=' + A.address, 'GET', tokenC))).status).toBe(403)
    expect((await h.conv.GET(req('/api/conversations?address=' + A.address.toLowerCase(), 'GET', tokenB))).status).toBe(403)
    // Naming yourself is fine.
    expect((await h.conv.GET(req('/api/conversations?address=' + B.address, 'GET', tokenB))).status).toBe(200)
  })

  test('guessing a conversation id returns nothing, and looks like a missing id', async () => {
    const real = await h.msg.GET(req('/api/messages?conversationId=' + DM, 'GET', tokenC))
    const missing = await h.msg.GET(req('/api/messages?conversationId=doesnotexist1', 'GET', tokenC))
    expect(real.status).toBe(404)
    expect(missing.status).toBe(404)
    expect(await real.text()).toBe(await missing.text())
  })

  test('an outsider cannot overwrite, join or mark-read someone else\'s chat', async () => {
    const hijack = await h.conv.POST(req('/api/conversations', 'POST', tokenC, { id: DM, participants: [A.address, B.address, C.address], lastMessage: { content: 'owned' } }))
    expect(hijack.status).toBe(403)
    const ownIdOther = await h.conv.POST(req('/api/conversations', 'POST', tokenC, { id: 'newconv_for_ab_1', participants: [A.address, B.address] }))
    expect(ownIdOther.status).toBe(403) // C may not create a chat between two other people
    expect((await h.conv.PATCH(req('/api/conversations', 'PATCH', tokenC, { conversationId: DM }))).status).toBe(404)
    expect(await listIds(tokenC)).toEqual([LEGACY_CD])
    const conv = ((await (await h.conv.GET(req('/api/conversations', 'GET', tokenA))).json()) as { conversations: { id: string; participants: string[]; lastMessage?: { content?: string } }[] }).conversations.find((c) => c.id === DM)!
    expect(conv.participants.map((p) => p.toLowerCase())).not.toContain(C.address.toLowerCase())
    expect(conv.lastMessage?.content).not.toBe('owned')
  })

  test('a member cannot plant a fake preview line either', async () => {
    await h.conv.POST(req('/api/conversations', 'POST', tokenA, { id: DM, participants: [A.address, B.address], lastMessage: { content: 'fake preview' } }))
    const list = ((await (await h.conv.GET(req('/api/conversations', 'GET', tokenB))).json()) as { conversations: { id: string; lastMessage?: { content?: string } }[] }).conversations
    expect(list.find((c) => c.id === DM)?.lastMessage?.content).toBe('hello A')
  })

  test('a member cannot add a third person to a direct chat', async () => {
    await h.conv.POST(req('/api/conversations', 'POST', tokenA, { id: DM, participants: [A.address, B.address, C.address] }))
    expect(await listIds(tokenC)).toEqual([LEGACY_CD])
  })

  test('a payment status cannot be changed by someone outside the conversation', async () => {
    expect((await h.msg.PATCH(req('/api/messages', 'PATCH', tokenC, { txHash: '0xabc', status: 'failed' }))).status).toBe(404)
  })
})

describe('groups', () => {
  test('only members read a group; members can add people but not remove them; the creator can', async () => {
    expect((await h.conv.POST(req('/api/conversations', 'POST', tokenA, { id: GROUP, participants: [A.address, B.address], isGroup: true, groupId: 'g1' }))).status).toBe(200)
    expect((await say(A, tokenA, GROUP, 'group hello')).status).toBe(200)
    expect((await h.msg.GET(req('/api/messages?conversationId=' + GROUP, 'GET', tokenC))).status).toBe(404)
    expect((await say(C, tokenC, GROUP, 'let me in')).status).toBe(404)
    // C cannot add themselves.
    expect((await h.conv.POST(req('/api/conversations', 'POST', tokenC, { id: GROUP, participants: [A.address, B.address, C.address], isGroup: true }))).status).toBe(403)
    // B (a member) tries to remove A: ignored. B adds C: allowed.
    await h.conv.POST(req('/api/conversations', 'POST', tokenB, { id: GROUP, participants: [B.address, C.address], isGroup: true }))
    expect(await listIds(tokenA)).toContain(GROUP)
    expect(await listIds(tokenC)).toContain(GROUP)
    expect((await h.msg.GET(req('/api/messages?conversationId=' + GROUP, 'GET', tokenC))).status).toBe(200)
    // The creator removes C.
    await h.conv.POST(req('/api/conversations', 'POST', tokenA, { id: GROUP, participants: [A.address, B.address], isGroup: true }))
    expect(await listIds(tokenC)).not.toContain(GROUP)
    expect((await h.msg.GET(req('/api/messages?conversationId=' + GROUP, 'GET', tokenC))).status).toBe(404)
  })
})
