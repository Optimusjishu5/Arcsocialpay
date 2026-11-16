'use client'

// ── Turso-backed persistent chat (Next.js App Router) ────────────────────────
// Local appStore stays the realtime source of truth (instant UX + offline).
// This hook adds server persistence on top when Turso is configured:
//
//  0. The wallet signs in once (a free signature) so the server knows who is asking.
//  1. On sign-in: GET /api/conversations + /api/messages → only this wallet's chats come back
//  2. On local chat writes: POST through to /api/* (fire-and-forget, debounced)
//  3. When Turso is NOT configured: no sign-in, no requests; localStorage path unchanged
//
// Everything is tied to the connected wallet: switching or disconnecting drops the old sign-in,
// the old wallet's chats leave memory (see appStore.setActiveWallet) and the new wallet's chats
// are fetched again from scratch.
//
// Mount once globally (App.tsx) — not per view — to avoid duplicate sync loops.

import { useEffect, useRef, useState } from 'react'
import { useAccount, useSignTypedData, useSwitchChain } from 'wagmi'
import { appStore } from '@/store/appStore'
import { ARC_CHAIN_ID } from '@/chains'
import {
  authedFetch, clearSession, readSession, registerSignInRetry, setChatAuthState, signIn,
  type ChatSession, type SignTyped,
} from '@/lib/chatSession'
import type { Conversation, Message } from '@/types/index'

async function safeJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function toConversation(raw: unknown): Conversation | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (typeof c.id !== 'string') return null
  return {
    id: c.id,
    participants: Array.isArray(c.participants) ? (c.participants as string[]) : [],
    lastMessage: (c.lastMessage ?? undefined) as Conversation['lastMessage'],
    unreadCount: typeof c.unreadCount === 'number' ? c.unreadCount : 0,
    createdAt: typeof c.createdAt === 'number' ? c.createdAt : Date.now(),
    isGroup: !!(c.isGroup ?? c.is_group),
    groupId: typeof c.groupId === 'string' ? c.groupId : undefined,
  }
}

function toMessage(raw: unknown): Message | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string') return null
  const convId =
    typeof m.conversationId === 'string'
      ? m.conversationId
      : typeof m.conversation_id === 'string'
        ? (m.conversation_id as string)
        : ''
  if (!convId) return null
  return {
    id: m.id,
    conversationId: convId,
    senderAddress: String(m.senderAddress ?? m.sender_address ?? ''),
    content: String(m.content ?? ''),
    createdAt: typeof m.createdAt === 'number' ? m.createdAt : Number(m.created_at) || Date.now(),
    status: (m.status as Message['status']) ?? 'sent',
    replyToId:
      typeof m.replyToId === 'string'
        ? m.replyToId
        : typeof m.reply_to_id === 'string'
          ? (m.reply_to_id as string)
          : undefined,
    paymentTx: (m.paymentTx ?? m.payment_tx ?? undefined) as Message['paymentTx'],
    signature: typeof m.signature === 'string' ? m.signature : undefined,
  }
}

export function usePersistentChat(address: string | undefined) {
  const { chainId } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChainAsync } = useSwitchChain()
  const [session, setSession] = useState<ChatSession | null>(null)
  const [attempt, setAttempt] = useState(0)
  const postedConvs = useRef<Set<string>>(new Set())
  const postedMsgs = useRef<Set<string>>(new Set())
  const chainRef = useRef(chainId)
  chainRef.current = chainId

  // 0) Sign in for this wallet. A new wallet always starts from nothing.
  useEffect(() => {
    postedConvs.current = new Set()
    postedMsgs.current = new Set()
    setSession(null)
    if (!address) { setChatAuthState('off'); return }
    let cancelled = false
    registerSignInRetry(() => setAttempt((n) => n + 1))

    void (async () => {
      let configured = false
      try {
        const res = await fetch('/api/health')
        if (res.ok) configured = !!((await res.json()) as { turso?: { configured?: boolean } })?.turso?.configured
      } catch {
        /* no server routes (static host) or offline: chats stay on this device */
      }
      if (cancelled) return
      if (!configured) { setChatAuthState('off'); return }

      let s = readSession(address)
      if (!s) {
        setChatAuthState('signing')
        const sign: SignTyped = async (args) => {
          // Wallets only sign typed data for the chain named in the request.
          if (chainRef.current !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
          return signTypedDataAsync(args as unknown as Parameters<typeof signTypedDataAsync>[0])
        }
        try {
          s = await signIn(address, sign)
        } catch (e) {
          if (!cancelled) setChatAuthState(String((e as Error)?.message) === 'unavailable' ? 'unavailable' : 'declined')
          return
        }
      }
      if (cancelled) return
      setChatAuthState('ready')
      setSession(s)
    })()

    return () => {
      cancelled = true
      registerSignInRetry(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, attempt])

  // A request the server turned down because the sign-in is no longer valid.
  const expired = (res: Response): boolean => {
    if (res.status !== 401) return false
    clearSession()
    setSession(null)
    setChatAuthState('declined')
    return true
  }

  // 1) Hydrate from the server: only this wallet's conversations come back.
  useEffect(() => {
    if (!address || !session || session.address !== address.toLowerCase()) return
    const me = address.toLowerCase()
    let cancelled = false
    const stale = () => cancelled || appStore.getActiveWallet() !== me

    void (async () => {
      try {
        const convRes = await authedFetch(session, '/api/conversations')
        if (expired(convRes) || !convRes.ok) return
        const convJson = await safeJson(convRes)
        if (stale()) return
        if (convJson.configured === false) return // Turso not set — keep local-only
        const convs = Array.isArray(convJson.conversations)
          ? (convJson.conversations as unknown[]).map(toConversation).filter((c): c is Conversation => !!c)
          : []
        if (convs.length > 0) appStore.importConversations(convs, me)
        for (const conv of convs) postedConvs.current.add(conv.id)

        // Fetch messages per conversation (bounded: max 30 recent convs)
        for (const c of convs.slice(0, 30)) {
          if (stale()) break
          try {
            const msgRes = await authedFetch(session, `/api/messages?conversationId=${encodeURIComponent(c.id)}`)
            if (expired(msgRes)) break
            if (!msgRes.ok) continue
            const msgJson = await safeJson(msgRes)
            if (stale()) break
            if (msgJson.configured === false) break
            const msgs = Array.isArray(msgJson.messages)
              ? (msgJson.messages as unknown[]).map(toMessage).filter((m): m is Message => !!m)
              : []
            if (msgs.length > 0) {
              appStore.importMessages(c.id, msgs, me)
              for (const m of msgs) postedMsgs.current.add(m.id)
            }
          } catch {
            // per-conv failure must not break other convs
          }
        }
      } catch {
        // offline / server down — local store remains usable
      }
    })()

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, session])

  // 2) Write-through: persist this wallet's new local conversations/messages
  useEffect(() => {
    if (!address || !session || session.address !== address.toLowerCase()) return
    const me = address.toLowerCase()
    let timer: ReturnType<typeof setTimeout> | null = null

    const sync = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void (async () => {
          try {
            if (appStore.getActiveWallet() !== me) return
            const state = appStore.getState()
            const myConvs = state.conversations.filter((c) => (c.participants ?? []).some((p) => p.toLowerCase() === me))
            for (const c of myConvs.slice(0, 100)) {
              if (postedConvs.current.has(c.id)) continue
              postedConvs.current.add(c.id)
              const res = await authedFetch(session, '/api/conversations', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  id: c.id,
                  participants: c.participants,
                  createdAt: c.createdAt,
                  isGroup: c.isGroup,
                  groupId: c.groupId,
                  unreadCount: c.unreadCount ?? 0,
                }),
              }).catch(() => null)
              if (!res || !res.ok) postedConvs.current.delete(c.id)
              if (res && expired(res)) return
            }
            for (const [convId, list] of Object.entries(state.messages)) {
              for (const m of list.slice(-50)) {
                // Only messages this wallet sent are uploaded; the server rejects anything else.
                if (postedMsgs.current.has(m.id) || m.senderAddress.toLowerCase() !== me) continue
                postedMsgs.current.add(m.id)
                const res = await authedFetch(session, '/api/messages', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({
                    id: m.id,
                    conversationId: convId,
                    senderAddress: m.senderAddress,
                    content: m.content,
                    createdAt: m.createdAt,
                    status: m.status,
                    replyToId: m.replyToId,
                    paymentTx: m.paymentTx ?? null,
                    signature: m.signature,
                  }),
                }).catch(() => null)
                if (!res || !res.ok) postedMsgs.current.delete(m.id)
                if (res && expired(res)) return
              }
            }
          } catch {
            // best-effort only
          }
        })()
      }, 800)
    }

    // Poll-based write-through (appStore is event-based without subscribe API).
    // 2s interval is cheap (only POSTs deltas) and avoids patching every caller.
    const iv = setInterval(sync, 2000)
    return () => {
      if (timer) clearTimeout(timer)
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, session])

  // 3) Incoming: poll the server so messages sent by the other side appear without a manual
  //    refresh. Fresh inbound messages bump unread + raise a notification.
  useEffect(() => {
    if (!address || !session || session.address !== address.toLowerCase()) return
    const me = address.toLowerCase()
    let disabled = false
    let inFlight = false
    let cancelled = false
    const stale = () => cancelled || appStore.getActiveWallet() !== me

    const tick = () => {
      if (disabled || inFlight || stale()) return
      inFlight = true
      void (async () => {
        try {
          const convRes = await authedFetch(session, '/api/conversations')
          if (expired(convRes)) { disabled = true; return }
          if (!convRes.ok) return
          const convJson = await safeJson(convRes)
          if (stale()) return
          if (convJson.configured === false) {
            disabled = true
            return
          }
          const convs = Array.isArray(convJson.conversations)
            ? (convJson.conversations as unknown[]).map(toConversation).filter((c): c is Conversation => !!c)
            : []
          if (convs.length > 0) appStore.importConversations(convs, me)
          // Server convs plus local-only ones (not yet posted).
          const ids = new Set(convs.map((c) => c.id))
          for (const c of appStore.getState().conversations) {
            if ((c.participants ?? []).some((p) => p.toLowerCase() === me)) ids.add(c.id)
          }
          for (const id of [...ids].slice(0, 30)) {
            if (stale()) return
            try {
              const msgRes = await authedFetch(session, `/api/messages?conversationId=${encodeURIComponent(id)}`)
              if (expired(msgRes)) { disabled = true; return }
              if (!msgRes.ok) continue // a local-only chat the server does not have yet
              const msgJson = await safeJson(msgRes)
              if (stale()) return
              if (msgJson.configured === false) {
                disabled = true
                break
              }
              const msgs = Array.isArray(msgJson.messages)
                ? (msgJson.messages as unknown[]).map(toMessage).filter((m): m is Message => !!m)
                : []
              if (msgs.length === 0) continue
              const fresh = msgs.filter((m) => !postedMsgs.current.has(m.id))
              appStore.importMessages(id, msgs, me)
              for (const m of msgs) postedMsgs.current.add(m.id)
              const inbound = fresh.filter((m) => m.senderAddress.toLowerCase() !== me)
              if (inbound.length === 0) continue
              for (const m of inbound) appStore.bumpConversationUnread(m.conversationId)
              const latest = inbound[inbound.length - 1]
              appStore.addNotification({
                type: 'message',
                fromAddress: latest.senderAddress,
                targetId: id,
                content: latest.content.slice(0, 120),
                createdAt: Date.now(),
              })
            } catch {
              // per-conv failure must not break other convs
            }
          }
        } catch {
          // offline / server down — retry on next tick
        } finally {
          inFlight = false
        }
      })()
    }

    tick()
    const iv = setInterval(tick, 4000)
    return () => {
      cancelled = true
      clearInterval(iv)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, session])
}
