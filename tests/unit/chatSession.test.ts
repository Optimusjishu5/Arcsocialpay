// Wallet sign-in on phones: one request at a time, and the sign-in survives a page reload.
import { describe, expect, test, beforeEach } from 'bun:test'

const store = new Map<string, string>()
const area = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}
;(globalThis as unknown as { localStorage: typeof area; sessionStorage: typeof area }).localStorage = area
;(globalThis as unknown as { sessionStorage: typeof area }).sessionStorage = { ...area, getItem: () => null }

const ADDR = '0x00000000000000000000000000000000000000aa'
let signCalls = 0
let release: (sig: string) => void = () => {}

function stubServer() {
  ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: string) => {
    if (String(url).includes('/challenge')) {
      return new Response(JSON.stringify({ challenge: { address: ADDR, nonce: 'n', issuedAt: 1, expiresAt: 2, proof: 'p' } }), { status: 200 })
    }
    return new Response(JSON.stringify({ token: 't1', expiresAt: Date.now() + 3_600_000, address: ADDR }), { status: 200 })
  }) as unknown as typeof fetch
}

const slowSign = () => { signCalls++; return new Promise<string>((r) => { release = r }) }

// The sign request is reached after the challenge is fetched; wait for it instead of guessing a delay.
const until = async (cond: () => boolean) => { for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 10)) }

beforeEach(() => { store.clear(); signCalls = 0; stubServer() })

describe('chat sign-in', () => {
  test('a second request while the wallet is open joins the first instead of asking again', async () => {
    const { signInOnce } = await import('../../src/lib/chatSession')
    const a = signInOnce(ADDR, slowSign)
    const b = signInOnce(ADDR, slowSign)
    await until(() => signCalls >= 1)
    await new Promise((r) => setTimeout(r, 30))
    expect(signCalls).toBe(1)
    release('0xsig')
    const [sa, sb] = await Promise.all([a, b])
    expect(sa.token).toBe('t1')
    expect(sb.token).toBe('t1')
  })

  test('"Ask again" starts a new request', async () => {
    const { signInOnce } = await import('../../src/lib/chatSession')
    void signInOnce(ADDR, slowSign).catch(() => undefined)
    await until(() => signCalls >= 1)
    const again = signInOnce(ADDR, slowSign, true)
    await until(() => signCalls >= 2)
    expect(signCalls).toBe(2)
    release('0xsig')
    await again
  })

  test('the saved sign-in is found again after a reload, only for the same wallet', async () => {
    const { signInOnce, readSession, clearSession } = await import('../../src/lib/chatSession')
    const p = signInOnce(ADDR, slowSign)
    await until(() => signCalls >= 1)
    release('0xsig')
    await p
    expect(readSession(ADDR)?.token).toBe('t1')
    expect(readSession('0x00000000000000000000000000000000000000bb')).toBeNull()
    clearSession()
    expect(readSession(ADDR)).toBeNull()
  })

  test('a refused signature reports the server reason', async () => {
    ;(globalThis as unknown as { fetch: typeof fetch }).fetch = (async (url: string) => {
      if (String(url).includes('/challenge')) return new Response(JSON.stringify({ challenge: { address: ADDR, nonce: 'n', issuedAt: 1, expiresAt: 2 } }), { status: 200 })
      return new Response(JSON.stringify({ error: 'That signature does not match this wallet' }), { status: 401 })
    }) as unknown as typeof fetch
    const { signIn } = await import('../../src/lib/chatSession')
    await expect(signIn(ADDR, async () => '0xsig')).rejects.toThrow('refused: That signature does not match this wallet')
  })
})
