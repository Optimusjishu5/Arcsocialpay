/**
 * Wallet sign-in sessions for private chat data (server only).
 *
 * 1. challenge(address)      -> a short-lived, tamper-proof challenge (stateless: signed with the server secret)
 * 2. the wallet signs it     -> proves the visitor controls the address
 * 3. mintSession(address)    -> a token tied to that single address
 * 4. requireSession(request) -> the verified address of the caller, or null
 *
 * The address used to decide what a caller may read or write always comes from the verified
 * token, never from a query string or request body.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const CHALLENGE_TTL_MS = 5 * 60 * 1000
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

/** Secret for signing challenges and sessions. Set CHAT_SESSION_SECRET; falls back to a key derived from the database token. */
function secret(): Buffer | null {
  const explicit = process.env.CHAT_SESSION_SECRET?.trim()
  if (explicit && explicit.length >= 16) return Buffer.from(explicit)
  const token = process.env.TURSO_AUTH_TOKEN?.trim()
  if (token) return createHmac('sha256', token).update('socialpay-session-key-v1').digest()
  return null
}

export function sessionsAvailable(): boolean {
  return secret() !== null
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const mac = (key: Buffer, data: string) => createHmac('sha256', key).update(data).digest()

function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b)
}

export interface Challenge { address: string; nonce: string; issuedAt: number; expiresAt: number; proof: string }

const proofOf = (key: Buffer, c: Omit<Challenge, 'proof'>) =>
  mac(key, `challenge|${c.address.toLowerCase()}|${c.nonce}|${c.issuedAt}|${c.expiresAt}`).toString('base64url')

export function makeChallenge(address: string, now = Date.now()): Challenge | null {
  const key = secret()
  if (!key) return null
  const base = { address, nonce: b64(randomBytes(18)), issuedAt: now, expiresAt: now + CHALLENGE_TTL_MS }
  return { ...base, proof: proofOf(key, base) }
}

/** True when the challenge came from this server, belongs to this address and has not expired. */
export function challengeIsValid(c: Challenge, now = Date.now()): boolean {
  const key = secret()
  if (!key) return false
  if (typeof c.proof !== 'string' || typeof c.nonce !== 'string') return false
  if (!Number.isFinite(c.issuedAt) || !Number.isFinite(c.expiresAt)) return false
  if (c.expiresAt <= now || c.expiresAt - c.issuedAt > CHALLENGE_TTL_MS || c.issuedAt > now + 60_000) return false
  const expected = Buffer.from(proofOf(key, c))
  const got = Buffer.from(c.proof)
  return safeEqual(expected, got)
}

export function mintSession(address: string, now = Date.now()): { token: string; expiresAt: number } | null {
  const key = secret()
  if (!key) return null
  const expiresAt = now + SESSION_TTL_MS
  const payload = b64(JSON.stringify({ a: address.toLowerCase(), e: expiresAt }))
  const sig = mac(key, `session|${payload}`).toString('base64url')
  return { token: `v1.${payload}.${sig}`, expiresAt }
}

/** The verified lowercase address behind a session token, or null. */
export function verifySessionToken(token: string, now = Date.now()): string | null {
  const key = secret()
  if (!key) return null
  const parts = token.split('.')
  if (parts.length !== 3 || parts[0] !== 'v1') return null
  const expected = mac(key, `session|${parts[1]}`)
  let got: Buffer
  try { got = Buffer.from(parts[2], 'base64url') } catch { return null }
  if (!safeEqual(expected, got)) return null
  try {
    const { a, e } = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { a?: unknown; e?: unknown }
    if (typeof a !== 'string' || !/^0x[0-9a-f]{40}$/.test(a) || typeof e !== 'number' || e <= now) return null
    return a
  } catch {
    return null
  }
}

/** The verified address of the caller (from `Authorization: Bearer <token>`), or null. */
export function requireSession(req: Request): string | null {
  const header = req.headers.get('authorization') ?? ''
  const m = /^Bearer\s+(\S+)$/i.exec(header)
  return m ? verifySessionToken(m[1]) : null
}
