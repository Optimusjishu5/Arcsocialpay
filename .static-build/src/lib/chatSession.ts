'use client'

// Browser side of wallet sign-in for private chat data. The signed-in session lives in
// sessionStorage (one tab, cleared when the tab closes) and always names a single wallet, so a
// different wallet can never reuse it.

import { useSyncExternalStore } from 'react'

const KEY = 'socialpay:chat-session:v1'
const MARGIN_MS = 60_000

export interface ChatSession { address: string; token: string; expiresAt: number }

export type ChatAuthState =
  | 'off'          // the server keeps no chat history: nothing to sign in to
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
export const retrySignIn = () => retry?.()

export function readSession(address: string, now = Date.now()): ChatSession | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as ChatSession
    if (!s || s.address !== address.toLowerCase() || typeof s.token !== 'string' || s.expiresAt - MARGIN_MS <= now) return null
    return s
  } catch {
    return null
  }
}

export function clearSession(): void {
  try { sessionStorage.removeItem(KEY) } catch { /* storage unavailable */ }
}

function saveSession(s: ChatSession): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage unavailable */ }
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
  if (!res.ok) throw new Error('refused')
  const j = (await res.json()) as { token: string; expiresAt: number; address: string }
  const session = { address: j.address.toLowerCase(), token: j.token, expiresAt: j.expiresAt }
  saveSession(session)
  return session
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
