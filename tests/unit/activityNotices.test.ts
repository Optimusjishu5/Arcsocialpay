// Notifications for everything that can happen to a wallet: each one is announced once, and old activity stays quiet.
import { describe, expect, test } from 'bun:test'
import { findNewNotices, freshState, type NoticeInput } from '../../src/lib/activityNotices'
import type { Comment, Post, TxRecord } from '../../src/types/index'

const ME = '0x00000000000000000000000000000000000000aa'
const BOB = '0x00000000000000000000000000000000000000bb'
const CAT = '0x00000000000000000000000000000000000000cc'
const NOW = 1_800_000_000_000

const post = (over: Partial<Post> = {}): Post => ({
  id: 'p1', authorAddress: ME, content: 'hello world', createdAt: NOW - 1000, likeCount: 0, commentCount: 0, repostCount: 0, likes: [], reposts: [], ...over,
})
const comment = (over: Partial<Comment> = {}): Comment => ({ id: 'c1', postId: 'p1', authorAddress: BOB, content: 'nice', createdAt: NOW - 500, ...over })
const pay = (over: Partial<TxRecord> = {}): TxRecord => ({
  id: 't1', txHash: '0x' + 'ab'.repeat(32), chainId: 5042, direction: 'received', amount: '5.00', fromAddress: BOB, toAddress: ME, status: 'confirmed', timestamp: NOW - 2000, kind: 'payment', ...over,
})
const input = (over: Partial<NoticeInput> = {}): NoticeInput => ({
  me: ME, myUsername: 'alice', posts: [], comments: [], txHistory: [], chatPaymentHashes: new Set(), followerCount: 0, followerAddrs: null, socialReady: true, now: NOW, ...over,
})

describe('payments', () => {
  test('a payment received in the last day is announced once', () => {
    const first = findNewNotices(input({ txHistory: [pay()] }), freshState(NOW))
    expect(first.notices.map((n) => [n.type, n.from, n.content])).toEqual([['payment', BOB, '5.00 USDC']])
    const again = findNewNotices(input({ txHistory: [pay()] }), first.state)
    expect(again.notices).toHaveLength(0)
  })

  test('old payments, payments you sent, failed ones and swaps stay quiet', () => {
    const old = pay({ timestamp: NOW - 3 * 24 * 60 * 60 * 1000 })
    const sent = pay({ id: 't2', txHash: '0x' + 'cd'.repeat(32), direction: 'sent', fromAddress: ME, toAddress: BOB })
    const failed = pay({ id: 't3', txHash: '0x' + 'ef'.repeat(32), status: 'failed' })
    const swap = pay({ id: 't4', txHash: '0x' + '12'.repeat(32), kind: 'swap' })
    expect(findNewNotices(input({ txHistory: [old, sent, failed, swap] }), freshState(NOW)).notices).toHaveLength(0)
  })

  test('a payment card sent in chat is announced as a message, not twice', () => {
    const p = pay()
    const r = findNewNotices(input({ txHistory: [p], chatPaymentHashes: new Set([p.txHash]) }), freshState(NOW))
    expect(r.notices).toHaveLength(0)
  })
})

describe('likes, reposts, comments, mentions', () => {
  test('likes and reposts already on your posts are recorded quietly, then new ones are announced', () => {
    const before = findNewNotices(input({ posts: [post({ likes: [BOB] })] }), freshState(NOW))
    expect(before.notices).toHaveLength(0)
    const after = findNewNotices(input({ posts: [post({ likes: [BOB, CAT], reposts: [BOB] })] }), before.state)
    expect(after.notices.map((n) => [n.type, n.from])).toEqual(expect.arrayContaining([['like', CAT], ['repost', BOB]]))
    expect(after.notices).toHaveLength(2)
    expect(findNewNotices(input({ posts: [post({ likes: [BOB, CAT], reposts: [BOB] })] }), after.state).notices).toHaveLength(0)
  })

  test('your own likes on your own post are ignored', () => {
    const base = findNewNotices(input({ posts: [post()] }), freshState(NOW))
    expect(findNewNotices(input({ posts: [post({ likes: [ME] })] }), base.state).notices).toHaveLength(0)
  })

  test('a comment on your post is announced, your own comment is not', () => {
    const r = findNewNotices(input({ posts: [post()], comments: [comment(), comment({ id: 'c2', authorAddress: ME })] }), freshState(NOW))
    expect(r.notices.map((n) => [n.type, n.from, n.targetId])).toEqual([['comment', BOB, 'p1']])
  })

  test('a mention in someone else\'s post or comment is announced; a comment that also mentions you is announced once', () => {
    const other = post({ id: 'p9', authorAddress: CAT, content: 'thanks @alice!' })
    const both = comment({ id: 'c5', content: 'hey @Alice look' })
    const r = findNewNotices(input({ posts: [post(), other], comments: [both] }), freshState(NOW))
    expect(r.notices.map((n) => n.type).sort()).toEqual(['comment', 'mention'])
  })

  test('a similar name is not a mention', () => {
    const other = post({ id: 'p9', authorAddress: CAT, content: 'hi @alicia and email a@alice.com' })
    expect(findNewNotices(input({ posts: [other] }), freshState(NOW)).notices).toHaveLength(0)
  })

  test('nothing about posts or followers is announced before the server data has loaded', () => {
    const r = findNewNotices(input({ socialReady: false, posts: [post({ likes: [BOB] })], comments: [comment()], followerCount: 4 }), freshState(NOW))
    expect(r.notices).toHaveLength(0)
    expect(r.state.baselined).toBe(false)
  })
})

describe('followers', () => {
  test('the first look records the count, a higher count later is announced', () => {
    const first = findNewNotices(input({ followerCount: 3 }), freshState(NOW))
    expect(first.notices).toHaveLength(0)
    const grew = findNewNotices(input({ followerCount: 5 }), first.state)
    expect(grew.notices.map((n) => [n.type, n.count])).toEqual([['follow', 2]])
    expect(findNewNotices(input({ followerCount: 5 }), grew.state).notices).toHaveLength(0)
    const dropped = findNewNotices(input({ followerCount: 4 }), grew.state)
    expect(dropped.notices).toHaveLength(0)
    expect(findNewNotices(input({ followerCount: 5 }), dropped.state).notices).toHaveLength(1)
  })
})

describe('named followers', () => {
  test('the first look records who follows you, then each new follower is named once', () => {
    const first = findNewNotices(input({ followerAddrs: [BOB] }), freshState(NOW))
    expect(first.notices).toHaveLength(0)
    const next = findNewNotices(input({ followerAddrs: [BOB, CAT] }), first.state)
    expect(next.notices.map((n) => [n.type, n.from, n.count])).toEqual([['follow', CAT, undefined]])
    expect(findNewNotices(input({ followerAddrs: [BOB, CAT] }), next.state).notices).toHaveLength(0)
  })
})
