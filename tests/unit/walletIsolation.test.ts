// Wallet A and Wallet B on the same browser: private chat data must follow the connected wallet.
import { describe, expect, test } from 'bun:test'

const store = new Map<string, string>()
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}
;(globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage, addEventListener: () => {} }
;(globalThis as unknown as { localStorage: unknown }).localStorage = fakeStorage

const mod = await import('../../src/store/appStore')
const { appStore, splitLegacyPrivateData } = mod

const A = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa'
const B = '0xBbBbBbbBBbbBBBBBbbbBbBbbBBBBbbBbbBbBbbBb'
const C = '0xCcCcCcCCccCCCcCCCcCcCcCCCCCCccCcCcCCCcCc'
const D = '0xDdDdDdDDddDDddDDDDdDdDDDDDdDdDDDDddDdDdD'

const names = () => appStore.getState().conversations.map((c) => c.participants.map((p) => p.toLowerCase()).join('+'))
const texts = () => Object.values(appStore.getState().messages).flat().map((m) => m.content)

describe('switching wallets', () => {
  test('wallet B never sees what wallet A has on screen, and A gets everything back', () => {
    appStore.setActiveWallet(A)
    const conv = appStore.getOrCreateConversation(A, C)
    appStore.sendMessage(conv.id, A, 'secret for C')
    expect(texts()).toContain('secret for C')

    appStore.setActiveWallet(B)
    // Immediately after the switch: nothing of A's is in memory.
    expect(appStore.getState().conversations).toEqual([])
    expect(appStore.getState().messages).toEqual({})
    expect(appStore.getState().notifications).toEqual([])
    expect(JSON.stringify(appStore.getState())).not.toContain('secret for C')

    appStore.setActiveWallet(A)
    expect(texts()).toContain('secret for C')
    expect(names()).toEqual([`${A.toLowerCase()}+${C.toLowerCase()}`])
  })

  test('disconnecting clears everything private at once, and nothing is deleted', () => {
    appStore.setActiveWallet(A)
    appStore.setActiveWallet(null)
    expect(appStore.getState().conversations).toEqual([])
    expect(appStore.getState().messages).toEqual({})
    expect(appStore.getActiveWallet()).toBeNull()
    appStore.setActiveWallet(A)
    expect(texts()).toContain('secret for C')
  })

  test('switching right after sending (before the delayed save) files the message under the sender', () => {
    appStore.setActiveWallet(A)
    const conv = appStore.getOrCreateConversation(A, D)
    appStore.sendMessage(conv.id, A, 'sent just before switching')
    appStore.setActiveWallet(B) // no time for the debounced save
    expect(texts()).not.toContain('sent just before switching')
    appStore.setActiveWallet(A)
    expect(texts()).toContain('sent just before switching')
    expect(JSON.parse(store.get(`arc-socialpay-v1:private:${B.toLowerCase()}`) ?? '{"messages":{}}').messages).toEqual({})
  })

  test('the shared entry never contains anyone\'s chats', () => {
    appStore.setActiveWallet(A)
    appStore.sendMessage(appStore.getState().conversations[0].id, A, 'check the shared entry')
    appStore.setActiveWallet(null)
    const shared = store.get('arc-socialpay-v1') ?? ''
    expect(shared).not.toContain('check the shared entry')
    expect(shared).not.toContain('secret for C')
    expect(JSON.parse(shared).conversations).toEqual([])
  })
})

describe('participants find their own messages', () => {
  test('a message to wallet C is waiting for C when C connects on this device, but not for B', () => {
    appStore.setActiveWallet(C)
    expect(texts()).toContain('secret for C')
    expect(appStore.getState().conversations.find((c) => c.participants.some((p) => p.toLowerCase() === A.toLowerCase()))?.unreadCount).toBeGreaterThan(0)
    appStore.setActiveWallet(B)
    expect(texts()).not.toContain('secret for C')
    expect(appStore.getState().conversations).toEqual([])
  })
})

describe('results for a wallet that is no longer connected are dropped', () => {
  test('a late server answer for wallet A is ignored once B is connected', () => {
    appStore.setActiveWallet(B)
    appStore.importConversations([{ id: 'late_conv_000001', participants: [A, C], unreadCount: 0, createdAt: 1, isGroup: false }], A)
    appStore.importMessages('late_conv_000001', [{ id: 'late1', conversationId: 'late_conv_000001', senderAddress: A, content: 'late reply', createdAt: 1, status: 'sent' }], A)
    expect(appStore.getState().conversations).toEqual([])
    expect(texts()).not.toContain('late reply')
    // The same data for the connected wallet is accepted.
    appStore.importConversations([{ id: 'ok_conv_00000001', participants: [B, C], unreadCount: 0, createdAt: 1, isGroup: false }], B)
    expect(appStore.getState().conversations.map((c) => c.id)).toEqual(['ok_conv_00000001'])
  })
})

describe('old mixed data is split between its owners', () => {
  const msg = (id: string, conv: string, from: string, content: string) => ({ id, conversationId: conv, senderAddress: from, content, createdAt: 1, status: 'sent' as const })
  const legacy = {
    version: 1, profiles: {}, posts: [], comments: [], groups: [], txHistory: [], followMap: {}, theme: 'dark' as const,
    currentUserAddress: B,
    conversations: [
      { id: 'ab', participants: [A, B], unreadCount: 0, createdAt: 1, isGroup: false },
      { id: 'cd', participants: [C, D], unreadCount: 0, createdAt: 2, isGroup: false },
    ],
    messages: { ab: [msg('1', 'ab', A, 'A to B')], cd: [msg('2', 'cd', C, 'C to D')] },
    notifications: [
      { id: 'n1', type: 'message' as const, fromAddress: A, targetId: 'ab', content: 'A to B', createdAt: 1, read: false },
      { id: 'n2', type: 'like' as const, fromAddress: C, createdAt: 1, read: false },
    ],
  }
  const buckets = splitLegacyPrivateData(legacy as never, () => ({ conversations: [], messages: {}, notifications: [] }))
  const at = (w: string) => buckets.get(`arc-socialpay-v1:private:${w.toLowerCase()}`)

  test('each wallet gets only the conversations it is in', () => {
    expect(at(A)!.conversations.map((c) => c.id)).toEqual(['ab'])
    expect(at(B)!.conversations.map((c) => c.id)).toEqual(['ab'])
    expect(at(C)!.conversations.map((c) => c.id)).toEqual(['cd'])
    expect(at(D)!.conversations.map((c) => c.id)).toEqual(['cd'])
    expect(JSON.stringify(at(A))).not.toContain('C to D')
    expect(JSON.stringify(at(C))).not.toContain('A to B')
  })

  test('message alerts go to the receiver; others to the last user; nothing is dropped', () => {
    expect(at(B)!.notifications.map((n) => n.id).sort()).toEqual(['n1', 'n2'])
    expect(at(A)!.notifications).toEqual([])
    const all = [...buckets.values()].flatMap((b) => b.notifications.map((n) => n.id))
    expect(new Set(all)).toEqual(new Set(['n1', 'n2']))
  })
})
