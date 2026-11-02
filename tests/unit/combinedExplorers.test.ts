import { describe, expect, test } from 'bun:test'
import { combineSources, SourceError, streamExplorerHistory, type Feed, type NamedSource, type Page } from '../../src/lib/explorerHistory'

const ME = '0x180D51df0C75495303095DF858874fCCBe487c61'
const YOU = '0xff69c7Bcd38cA45D804c285b551C4988fB74463f'
const T0 = '2026-11-01T10:00:00.000000Z'
const tx = (hash: string, block: number) => ({ hash, block_number: block, timestamp: T0, from: { hash: ME }, to: { hash: YOU }, value: '1000000000000000000', status: 'ok', method: '' })

/** A source that serves `pages` of the transactions feed and nothing for the other feeds. */
function source(id: string, pages: Record<string, unknown>[][], opts: { fail?: SourceError } = {}): NamedSource {
  return {
    id, label: id,
    fetch: async (feed: Feed, _a: string, cursor: Record<string, string> | null): Promise<Page> => {
      if (opts.fail) throw opts.fail
      if (feed !== 'transactions') return { items: [], next: null }
      const i = cursor ? Number(cursor.p) : 0
      return { items: (pages[i] ?? []) as never, next: pages[i + 1] ? { p: String(i + 1) } : null }
    },
  }
}

async function history(fetchPage: ReturnType<typeof combineSources>) {
  const got: { hash: string; amount: string }[] = []
  const res = await streamExplorerHistory(ME, { fetchPage, onRecords: (r) => got.push(...r.map((x) => ({ hash: x.txHash, amount: x.amount }))) })
  return { res, hashes: got.map((g) => g.hash).sort(), got }
}

describe('two sources read together', () => {
  test('a transaction both explorers know is listed once', async () => {
    const a = source('primary', [[tx('0xa1', 300), tx('0xa2', 200)]])
    const b = source('secondary', [[tx('0xa1', 300), tx('0xa2', 200)]])
    const { hashes, res } = await history(combineSources([a, b]))
    expect(res.complete).toBe(true)
    expect(hashes).toEqual(['0xa1', '0xa2'])
  })

  test('a transaction only one explorer has still shows up', async () => {
    const a = source('primary', [[tx('0xa1', 300)]])
    const b = source('secondary', [[tx('0xa1', 300), tx('0xa3', 250)]])
    expect((await history(combineSources([a, b]))).hashes).toEqual(['0xa1', '0xa3'])
  })

  test('explorers with different page depths are both read to the end', async () => {
    const a = source('primary', [[tx('0xb1', 900)], [tx('0xb2', 800)], [tx('0xb3', 100)]])
    const b = source('secondary', [[tx('0xb1', 900), tx('0xb2', 800), tx('0xb3', 100), tx('0xb4', 50)]])
    const { hashes, res } = await history(combineSources([a, b]))
    expect(res.complete).toBe(true)
    expect(hashes).toEqual(['0xb1', '0xb2', '0xb3', '0xb4'])
  })

  test('one explorer not set up leaves the other working, and says so', async () => {
    const a = source('primary', [[tx('0xc1', 10)]])
    const b = source('secondary', [], { fail: new SourceError('not set up', 'not_configured') })
    const fetcher = combineSources([a, b])
    const { hashes } = await history(fetcher)
    expect(hashes).toEqual(['0xc1'])
    const st = Object.fromEntries(fetcher.status().map((s) => [s.id, s.state]))
    expect(st.secondary).toBe('not-configured')
    expect(st.primary).toBe('done')
  })

  test('one explorer rate limited leaves the other working', async () => {
    const a = source('primary', [], { fail: new SourceError('slow down', 'rate_limited', 5) })
    const b = source('secondary', [[tx('0xd1', 10)]])
    const fetcher = combineSources([a, b])
    expect((await history(fetcher)).hashes).toEqual(['0xd1'])
    expect(fetcher.status().find((s) => s.id === 'primary')?.state).toBe('rate-limited')
  })

  test('when every explorer fails the error surfaces, so the app falls back to the nodes', async () => {
    const f = combineSources([source('primary', [], { fail: new SourceError('down', 'unavailable') }), source('secondary', [], { fail: new SourceError('no key', 'not_configured') })])
    await expect(history(f)).rejects.toThrow()
  })
})
