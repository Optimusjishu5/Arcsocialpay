import { describe, expect, test } from 'bun:test'
import { reconcileWithServer } from '../../src/utils/socialSync'

const post = (id: string, createdAt: number, extra: Record<string, unknown> = {}) => ({ id, createdAt, content: id, ...extra })

describe('reconcileWithServer', () => {
  test('a new local post survives a poll that started before the server saved it', () => {
    const mine = post('new', 1000)
    const ack = new Map([['new', 5_000]]) // saved at t=5000
    const { items, gone } = reconcileWithServer({
      server: [post('old', 500)], local: [mine, post('old', 500)], confirmedAt: ack, startedAt: 4_000, limit: 200,
    })
    expect(gone.size).toBe(0)
    expect(items.map((p) => p.id)).toEqual(['old'])
  })

  test('a post removed on another device is reported as gone', () => {
    const ack = new Map([['x', 1_000]])
    const { gone } = reconcileWithServer({
      server: [post('y', 900)], local: [post('x', 800), post('y', 900)], confirmedAt: ack, startedAt: 5_000, limit: 200,
    })
    expect([...gone]).toEqual(['x'])
  })

  test('posts older than a full page are not treated as deleted', () => {
    const ack = new Map([['ancient', 1_000]])
    const server = [post('a', 5000), post('b', 4000)]
    const { gone } = reconcileWithServer({
      server, local: [...server, post('ancient', 10)], confirmedAt: ack, startedAt: 9_000, limit: 2,
    })
    expect(gone.size).toBe(0)
  })

  test('an unsent local edit is kept over the older server copy', () => {
    const snaps = new Map([['p', JSON.stringify(post('p', 1, { likes: [] }))]])
    const edited = post('p', 1, { likes: ['0xabc'] })
    const { items } = reconcileWithServer({
      server: [post('p', 1, { likes: [] })], local: [edited], confirmedAt: new Map([['p', 1]]), startedAt: 9, limit: 200, snapshots: snaps,
    })
    expect(items[0]).toBe(edited)
  })

  test('a post deleted here is not brought back before the delete is sent', () => {
    const snaps = new Map([['p', JSON.stringify(post('p', 1))]])
    const { items } = reconcileWithServer({
      server: [post('p', 1)], local: [], confirmedAt: new Map([['p', 1]]), startedAt: 9, limit: 200, snapshots: snaps,
    })
    expect(items).toHaveLength(0)
  })
})
