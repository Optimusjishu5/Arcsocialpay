'use client'

// ── Turso-backed persistent chat (Next.js App Router) ────────────────────────
// Local appStore stays the realtime source of truth (instant UX + offline).
// This hook adds server persistence on top when Turso is configured:
//
//  1. On wallet connect: GET /api/conversations + /api/messages → import into store
//  2. On local chat writes: POST through to /api/* (fire-and-forget, debounced)
//  3. When Turso is NOT configured: silently no-op, localStorage path unchanged
//
// Mount once globally (App.tsx) — not per view — to avoid duplicate sync loops.

import { useEffect, useRef } from 'react'
import { appStore } from '@/store/appStore'
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
  }
}

export function usePersistentChat(address: string | undefined) {
  const hydratedFor = useRef<string | null>(null)
  const postedConvs = useRef<Set<string>>(new Set())
  const postedMsgs = useRef<Set<string>>(new Set())

  // 1) Hydrate from Turso on connect
  useEffect(() => {
    if (!address) return
    if (hydratedFor.current === address.toLowerCase()) return
    hydratedFor.current = address.toLowerCase()
    let cancelled = false

    void (async () => {
      try {
        const convRes = await fetch(`/api/conversations?address=${encodeURIComponent(address)}`)
        if (!convRes.ok) return
        const convJson = await safeJson(convRes)
        if (cancelled) return
        if (convJson.configured === false) return // Turso not set — keep local-only
        const convs = Array.isArray(convJson.conversations)
          ? (convJson.conversations as unknown[]).map(toConversation).filter((c): c is Conversation => !!c)
          : []
        if (convs.length > 0) appStore.importConversations(convs)

        // Fetch messages per conversation (bounded: max 30 recent convs)
        const targets = convs.slice(0, 30)
        for (const c of targets) {
          if (cancelled) break
          try {
            const msgRes = await fetch(
              `/api/messages?conversationId=${encodeURIComponent(c.id)}`,
            )
            if (!msgRes.ok) continue
            const msgJson = await safeJson(msgRes)
            if (msgJson.configured === false) break
            const msgs = Array.isArray(msgJson.messages)
              ? (msgJson.messages as unknown[]).map(toMessage).filter((m): m is Message => !!m)
              : []
            if (msgs.length > 0) {
              appStore.importMessages(c.id, msgs)
              for (const m of msgs) postedMsgs.current.add(m.id)
            }
            for (const conv of convs) postedConvs.current.add(conv.id)
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
  }, [address])

  // 2) Write-through: persist new local conversations/messages to Turso
  useEffect(() => {
    if (!address) return
    let timer: ReturnType<typeof setTimeout> | null = null

    const sync = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        void (async () => {
          try {
            // Quick probe: skip entirely when Turso is not configured.
            // (Single cheap GET; result is not used beyond the flag.)
            const state = appStore.getState()
            const myConvs = state.conversations.filter((c) =>
              (c.participants ?? []).some(
                (p) => p.toLowerCase() === address.toLowerCase(),
              ),
            )
            for (const c of myConvs.slice(0, 100)) {
              if (postedConvs.current.has(c.id)) continue
              postedConvs.current.add(c.id)
              await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  id: c.id,
                  participants: c.participants,
                  createdAt: c.createdAt,
                  isGroup: c.isGroup,
                  groupId: c.groupId,
                  lastMessage: c.lastMessage ?? null,
                  unreadCount: c.unreadCount ?? 0,
                }),
              }).catch(() => {
                postedConvs.current.delete(c.id)
              })
            }
            for (const [convId, list] of Object.entries(state.messages)) {
              for (const m of list.slice(-50)) {
                if (postedMsgs.current.has(m.id)) continue
                postedMsgs.current.add(m.id)
                await fetch('/api/messages', {
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
                  }),
                }).catch(() => {
                  postedMsgs.current.delete(m.id)
                })
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
  }, [address])
}
