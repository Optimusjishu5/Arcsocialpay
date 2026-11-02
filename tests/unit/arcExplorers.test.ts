import { describe, expect, test } from 'bun:test'
import { addressLinks, blockLinks, isTxHash, primaryTxUrl, txLinks } from '../../src/lib/arcExplorers'

// A transaction that really happened on Arc Mainnet (SocialPay Payment).
const HASH = '0x1f7b4ef06be7fd99e3d0b4c99b127ccd1d6530bb62be7bcc6d89eda44cf188e4'

describe('explorer links', () => {
  test('a real hash opens on Arc Explorer, and nowhere else', () => {
    expect(txLinks(HASH).map((l) => l.url)).toEqual([`https://explorer.arc.io/tx/${HASH}`])
    expect(primaryTxUrl(HASH)).toBe(`https://explorer.arc.io/tx/${HASH}`)
  })

  test('links use the lower-case hash', () => {
    expect(txLinks(HASH.toUpperCase().replace('0X', '0x'))[0].url).toBe(`https://explorer.arc.io/tx/${HASH}`)
  })

  test('anything that is not a 32-byte hash gets no link', () => {
    for (const bad of ['', '0x', '0x1234', HASH.slice(0, -1), `${HASH}0`, 'pending-123', undefined, null, '0xZZ' + HASH.slice(4)]) {
      expect(isTxHash(bad)).toBe(false)
      expect(txLinks(bad as string)).toEqual([])
    }
  })

  test('address and block links', () => {
    const a = '0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54'
    expect(addressLinks(a).map((l) => l.url)).toEqual([`https://explorer.arc.io/address/${a}`])
    expect(addressLinks('0x12')).toEqual([])
    expect(blockLinks(29048706)[0].url).toBe('https://explorer.arc.io/block/29048706')
    expect(blockLinks(-1)).toEqual([])
    expect(blockLinks('abc')).toEqual([])
  })
})
