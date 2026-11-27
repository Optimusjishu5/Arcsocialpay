// The AchSwap proxy: the key stays on the server, requests are checked, limits are respected,
// and a transaction that does not point at AchSwap's own contract is refused.
import { beforeEach, describe, expect, test } from 'bun:test'
import { ACHSWAP_EXECUTOR, AchError, callAchswap, cleanAchResponse, parseAchRequest, resetAchswapState, visitorAllowed } from '../../lib/achswap'

process.env.ACHSWAP_API_KEY = 'test-key-not-a-real-key'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1'
const ME = '0x00000000000000000000000000000000000000aa'

const quoteBody = { chainId: 5042, tokenIn: USDC, tokenOut: EURC, amountIn: '1000000', amountOut: '884689', minAmountOut: '875842', slippageBps: 100, fees: { protocolBps: 12 }, route: [{ shareBps: 10000, hops: [{ dex: 'Aero CL' }] }], requestId: 'req_1', secretField: 'x' }
const swapBody = { ...quoteBody, sender: ME, recipient: ME, deadline: 1, simulated: true, tx: { to: ACHSWAP_EXECUTOR, data: '0xabcd', value: '0', gas: '300000' }, approval: { token: USDC, spender: ACHSWAP_EXECUTOR, amount: '1000000' } }

const reply = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const req = (over: Record<string, unknown> = {}) => parseAchRequest({ action: 'quote', tokenIn: USDC, tokenOut: EURC, amountIn: '1000000', slippageBps: 50, ...over })

beforeEach(() => { resetAchswapState(); process.env.ACHSWAP_API_KEY = 'test-key-not-a-real-key' })

describe('request checks', () => {
  test('accepts a clean request and fills in the default slippage', () => {
    expect(parseAchRequest({ action: 'quote', tokenIn: USDC, tokenOut: EURC, amountIn: '5' }).slippageBps).toBe(50)
  })
  test('refuses bad addresses, amounts, slippage, same-token and a swap without a sender', () => {
    expect(() => req({ tokenIn: 'nope' })).toThrow()
    expect(() => req({ amountIn: '0' })).toThrow()
    expect(() => req({ amountIn: '1.5' })).toThrow()
    expect(() => req({ amountIn: '-1' })).toThrow()
    expect(() => req({ slippageBps: 5000 })).toThrow()
    expect(() => req({ tokenOut: USDC })).toThrow()
    expect(() => req({ action: 'swap' })).toThrow()
    expect(() => req({ action: 'steal' })).toThrow()
    expect(req({ action: 'swap', sender: ME }).sender).toBe(ME)
  })
})

describe('calling AchSwap', () => {
  test('sends the key in the header, never in the body, and returns only the fields the app uses', async () => {
    let seen: { url: string; headers: Headers; body: string } | undefined
    const out = await callAchswap(req(), async (url, init) => {
      seen = { url: String(url), headers: new Headers(init?.headers), body: String(init?.body) }
      return reply(200, quoteBody)
    })
    expect(seen?.url).toEndWith('/quote')
    expect(seen?.headers.get('x-api-key')).toBe('test-key-not-a-real-key')
    expect(seen?.body).not.toContain('test-key')
    expect(JSON.parse(seen!.body)).not.toHaveProperty('feeBps')
    expect(out.amountOut).toBe('884689')
    expect(out).not.toHaveProperty('secretField')
    expect(JSON.stringify(out)).not.toContain('test-key')
  })

  test('a swap returns the transaction and approval for AchSwap\'s executor', async () => {
    const out = await callAchswap(req({ action: 'swap', sender: ME }), async () => reply(200, swapBody))
    expect((out.tx as { to: string }).to).toBe(ACHSWAP_EXECUTOR)
    expect((out.approval as { spender: string }).spender).toBe(ACHSWAP_EXECUTOR)
  })

  test('a transaction or approval that points anywhere else is refused', () => {
    const other = '0x1111111111111111111111111111111111111111'
    expect(() => cleanAchResponse('swap', { ...swapBody, tx: { ...swapBody.tx, to: other } })).toThrow(AchError)
    expect(() => cleanAchResponse('swap', { ...swapBody, approval: { ...swapBody.approval, spender: other } })).toThrow(AchError)
    expect(() => cleanAchResponse('swap', { ...swapBody, tx: { ...swapBody.tx, data: 'not hex' } })).toThrow(AchError)
  })

  test('the same quote asked twice within seconds is fetched once; swaps are never cached', async () => {
    let calls = 0
    const f = async () => { calls++; return reply(200, quoteBody) }
    await callAchswap(req(), f); await callAchswap(req(), f)
    expect(calls).toBe(1)
    const g = async () => { calls++; return reply(200, swapBody) }
    await callAchswap(req({ action: 'swap', sender: ME }), g); await callAchswap(req({ action: 'swap', sender: ME }), g)
    expect(calls).toBe(3)
  })

  test('without a key it says so, and a refused key is reported as unavailable without detail', async () => {
    delete process.env.ACHSWAP_API_KEY
    await expect(callAchswap(req(), async () => reply(200, quoteBody))).rejects.toMatchObject({ status: 503, code: 'NOT_CONFIGURED' })
    process.env.ACHSWAP_API_KEY = 'test-key-not-a-real-key'
    const e = await callAchswap(req(), async () => reply(401, { error: { code: 'UNAUTHORIZED', message: 'bad key ach_dev_xyz' } })).catch((x: AchError) => x)
    expect(e).toMatchObject({ status: 503, code: 'NOT_CONFIGURED' })
    expect((e as AchError).message).not.toContain('ach_dev')
  })

  test('AchSwap\'s own errors are passed on in plain words, with the failure reason', async () => {
    const noRoute = await callAchswap(req(), async () => reply(422, { error: { code: 'NO_ROUTE', message: 'No route' } })).catch((x: AchError) => x)
    expect(noRoute).toMatchObject({ status: 422, code: 'NO_ROUTE' })
    const sim = await callAchswap(req({ action: 'swap', sender: ME }), async () => reply(409, { error: { code: 'SIMULATION_FAILED', message: 'would revert', reason: 'Slippage' } })).catch((x: AchError) => x)
    expect((sim as AchError).message).toContain('Slippage')
    const busy = await callAchswap(req({ amountIn: '7' }), async () => reply(429, { error: { code: 'RATE_LIMITED', message: 'slow down' } }, { 'retry-after': '9' })).catch((x: AchError) => x)
    expect(busy).toMatchObject({ status: 429, retryAfter: 9 })
  })

  test('stays under the key\'s per-minute limit instead of getting the key blocked', async () => {
    let calls = 0
    const f = async () => { calls++; return reply(200, swapBody) }
    const results = await Promise.allSettled(Array.from({ length: 60 }, () => callAchswap(req({ action: 'swap', sender: ME }), f)))
    expect(calls).toBeLessThanOrEqual(50)
    expect(results.some((r) => r.status === 'rejected' && (r.reason as AchError).status === 429)).toBe(true)
  })

  test('never more than two requests at once', async () => {
    let open = 0, most = 0
    const f = async () => { open++; most = Math.max(most, open); await new Promise((r) => setTimeout(r, 15)); open--; return reply(200, swapBody) }
    await Promise.all(Array.from({ length: 6 }, () => callAchswap(req({ action: 'swap', sender: ME }), f)))
    expect(most).toBeLessThanOrEqual(2)
  })
})

describe('visitors', () => {
  test('one visitor is limited per minute without affecting another', () => {
    let allowed = 0
    for (let i = 0; i < 50; i++) if (visitorAllowed('1.1.1.1', 40)) allowed++
    expect(allowed).toBe(40)
    expect(visitorAllowed('2.2.2.2', 40)).toBe(true)
  })
})
