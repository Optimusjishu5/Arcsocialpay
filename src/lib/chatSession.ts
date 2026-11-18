'use client'

// Browser side of wallet sign-in for private chat data. The signed-in session names a single wallet
// and lasts a few hours, so a different wallet can never reuse it. It is kept in localStorage: phones
// often reload or restore the tab while the wallet app is open, and sessionStorage would lose the
// sign-in each time and ask again.

import { useSyncExternalStore } from 'react'

const KEY = 'socialpay:chat-session:v1'
const MARGIN_MS = 60_000

export interface ChatSession { address: string; token: string; expiresAt: number }

export type ChatAuthState =
  | 'off'          // the server keeps no chat history: nothing to sign in to
  | 'idle'         // chats are kept on the server; this wallet has not signed in yet and has not been asked
  | 'signing'      // waiting for the wallet signature
  | 'ready'        // signed in
  | 'declined'     // the wallet signature was refused or failed
  | 'unavailable'  // the server could not be reached

let state: ChatAuthState = 'off'
const listeners = new Set<() => void>()
export function setChatAuthState(next: ChatAuthState) {
  if (state === next) return
  state = next
  listeners.forEach((l) => l())
}
/** Why the last sign-in did not finish, in plain words (shown under the sign-in notice). */
let lastError = ''
export function setChatAuthError(msg: string) {
  if (lastError === msg) return
  lastError = msg
  listeners.forEach((l) => l())
}
export function useChatAuthError(): string {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => lastError,
    () => '',
  )
}
export function useChatAuthState(): ChatAuthState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => { listeners.delete(l) } },
    () => state,
    () => 'off' as ChatAuthState,
  )
}

/** Set by the chat sync hook so any screen can ask to try signing in again. */
let retry: (() => void) | null = null
export const registerSignInRetry = (fn: (() => void) | null) => { retry = fn }
/** Starts (or restarts) the wallet sign-in. Call it from a tap so mobile wallets are allowed to open. */
export const retrySignIn = () => retry?.()

function store(): Storage | null {
  try { return localStorage } catch { return null }
}

export function readSession(address: string, now = Date.now()): ChatSession | null {
  // An older version kept the session in sessionStorage; still honour it once.
  for (const area of [store(), (() => { try { return sessionStorage } catch { return null } })()]) {
    try {
      const raw = area?.getItem(KEY)
      if (!raw) continue
      const s = JSON.parse(raw) as ChatSession
      if (!s || s.address !== address.toLowerCase() || typeof s.token !== 'string' || s.expiresAt - MARGIN_MS <= now) continue
      return s
    } catch {
      /* try the next place */
    }
  }
  return null
}

export function clearSession(): void {
  try { localStorage.removeItem(KEY) } catch { /* storage unavailable */ }
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}

function saveSession(s: ChatSession): void {
  try { store()?.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
}

export type SignTyped = (args: {
  domain: Record<string, unknown>
  types: Record<string, unknown>
  primaryType: string
  message: Record<string, unknown>
}) => Promise<string>

/** Asks the server for a challenge, has the wallet sign it, and stores the session. Throws on refusal. */
export async function signIn(address: string, sign: SignTyped): Promise<ChatSession> {
  const { LOGIN_DOMAIN, LOGIN_TYPES, loginTypedMessage } = await import('./chatAuth')
  const ch = await fetch('/api/auth/challenge', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ address }),
  })
  if (!ch.ok) throw new Error('unavailable')
  const { challenge } = (await ch.json()) as { challenge: { address: string; nonce: string; issuedAt: number; expiresAt: number } }
  const signature = await sign({
    domain: LOGIN_DOMAIN, types: LOGIN_TYPES, primaryType: 'ChatLogin',
    message: loginTypedMessage({ address: address as `0x${string}`, nonce: challenge.nonce, issuedAt: challenge.issuedAt, expiresAt: challenge.expiresAt }),
  })
  const res = await fetch('/api/auth/session', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ challenge, signature }),
  })
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(res.status >= 500 || res.status === 503 ? 'unavailable' : `refused: ${j.error ?? 'the server did not accept the signature'}`)
  }
  const j = (await res.json()) as { token: string; expiresAt: number; address: string }
  const session = { address: j.address.toLowerCase(), token: j.token, expiresAt: j.expiresAt }
  saveSession(session)
  return session
}

// One sign-in per wallet at a time. A phone often re-renders the page while the wallet app is open;
// without this each re-render asked for another signature and threw the first one away.
const inflight = new Map<string, Promise<ChatSession>>()

/** Like signIn, but joins a sign-in that is already waiting for the wallet. `fresh` starts a new request. */
export function signInOnce(address: string, sign: SignTyped, fresh = false): Promise<ChatSession> {
  const key = address.toLowerCase()
  const running = inflight.get(key)
  if (running && !fresh) return running
  const p = signIn(address, sign).finally(() => { if (inflight.get(key) === p) inflight.delete(key) })
  inflight.set(key, p)
  return p
}

/** fetch() with the session attached. A 401 drops the stored session so the next call signs in again. */
export async function authedFetch(session: ChatSession, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string> | undefined), authorization: `Bearer ${session.token}` },
  })
  if (res.status === 401) clearSession()
  return res
}
