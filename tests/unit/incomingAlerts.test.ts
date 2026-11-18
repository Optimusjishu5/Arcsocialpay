// New-message alerts: each message is announced once, and a chat you are looking at stays quiet.
import { describe, expect, test, beforeEach, mock } from 'bun:test'

// The toast library needs a real page; here only whether an alert is raised matters.
mock.module('sonner', () => ({ toast: Object.assign(() => undefined, { success: () => undefined }) }))

const mem = new Map<string, string>()
const area = {
  getItem: (k: string) => mem.get(k) ?? null,
  setItem: (k: string, v: string) => { mem.set(k, v) },
  removeItem: (k: string) => { mem.delete(k) },
}
const doc = { visibilityState: 'visible', title: 'SocialPay', addEventListener: () => undefined }
const g = globalThis as unknown as Record<string, unknown>
g.localStorage = area
g.window = { localStorage: area, addEventListener: () => undefined, dispatchEvent: () => true }
g.document = doc
g.navigator = {}

const ME = '0x00000000000000000000000000000000000000aa'
const FROM = '0x00000000000000000000000000000000000000bb'

beforeEach(() => { mem.clear(); doc.visibilityState = 'visible'; doc.title = 'SocialPay' })

describe('seen messages', () => {
  test('the first time for a wallet there is no record yet, then ids are remembered', async () => {
    const { loadSeen, saveSeen } = await import('../../src/lib/incomingAlerts')
    expect(loadSeen(ME)).toBeNull()
    saveSeen(ME, new Set(['m1', 'm2']))
    expect([...(loadSeen(ME) ?? [])]).toEqual(['m1', 'm2'])
  })

  test('each wallet keeps its own record', async () => {
    const { loadSeen, saveSeen } = await import('../../src/lib/incomingAlerts')
    saveSeen(ME, new Set(['m1']))
    expect(loadSeen(FROM)).toBeNull()
  })

  test('only the newest ids are kept', async () => {
    const { loadSeen, saveSeen } = await import('../../src/lib/incomingAlerts')
    saveSeen(ME, new Set(Array.from({ length: 600 }, (_, i) => `m${i}`)))
    const back = loadSeen(ME) ?? new Set<string>()
    expect(back.size).toBe(400)
    expect(back.has('m599')).toBe(true)
    expect(back.has('m0')).toBe(false)
  })
})

describe('announcing', () => {
  test('a message in the chat you have open does not ring', async () => {
    const { announceMessage, setViewingConversation } = await import('../../src/lib/incomingAlerts')
    setViewingConversation('conv-1')
    expect(announceMessage({ convId: 'conv-1', from: FROM, preview: 'hi', count: 1 })).toBe(false)
  })

  test('a message in another chat, or with the app in the background, rings', async () => {
    const { announceMessage, setViewingConversation } = await import('../../src/lib/incomingAlerts')
    setViewingConversation('conv-1')
    expect(announceMessage({ convId: 'conv-2', from: FROM, preview: 'hi', count: 1 })).toBe(true)
    doc.visibilityState = 'hidden'
    expect(announceMessage({ convId: 'conv-1', from: FROM, preview: 'hi', count: 2 })).toBe(true)
    expect(doc.title).toBe('(2) SocialPay')
  })
})
