import { describe, expect, test } from 'bun:test'
import { isAddress } from 'viem'
import { DOC_GROUPS, DOC_PAGES, findDoc, neighbours } from '../../src/site/docs/registry'
import { searchDocs } from '../../src/site/docs/search'
import { OWN_CONTRACTS, PROTOCOL_CONTRACTS } from '../../src/site/links'

const REQUIRED = [
  'getting-started', 'platform-overview', 'user-guide', 'send-receive-usdc', 'batch-split-payments',
  'requests-scheduling', 'messaging-social', 'swap-integration', 'bridge-integration', 'circle-integrations',
  'smart-contract', 'security', 'faq', 'developers',
]

describe('documentation registry', () => {
  test('has every required page exactly once', () => {
    const slugs = DOC_PAGES.map((p) => p.slug)
    for (const s of REQUIRED) expect(slugs.filter((x) => x === s)).toHaveLength(1)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  test('every page belongs to a known group and has sections with unique ids', () => {
    for (const p of DOC_PAGES) {
      expect(DOC_GROUPS).toContain(p.group)
      expect(p.sections.length).toBeGreaterThan(0)
      const ids = p.sections.map((s) => s.id)
      expect(new Set(ids).size).toBe(ids.length)
    }
  })

  test('internal doc links point at pages that exist', () => {
    for (const p of DOC_PAGES) {
      for (const s of p.sections) {
        for (const b of s.blocks) {
          if (b.t !== 'links') continue
          for (const l of b.items) {
            if (l.href.startsWith('/docs/')) expect(findDoc(l.href.slice('/docs/'.length))).toBeDefined()
          }
        }
      }
    }
  })

  test('previous and next follow the sidebar order', () => {
    expect(neighbours(DOC_PAGES[0].slug).prev).toBeUndefined()
    expect(neighbours(DOC_PAGES[1].slug).prev?.slug).toBe(DOC_PAGES[0].slug)
    expect(neighbours(DOC_PAGES[DOC_PAGES.length - 1].slug).next).toBeUndefined()
  })
})

describe('listed addresses', () => {
  test('are valid, unique, and the contract matches the app binding', () => {
    const all = [...OWN_CONTRACTS, ...PROTOCOL_CONTRACTS].map((a) => a.address)
    for (const a of all) expect(isAddress(a, { strict: false })).toBe(true)
    expect(new Set(all.map((a) => a.toLowerCase())).size).toBe(all.length)
    expect(OWN_CONTRACTS[0].address).toBe('0x3b61FC789342B02Ae9DA3Bcece910AFaAd40bf54')
  })
})

describe('documentation search', () => {
  test('finds a page by a topic word and ranks title matches first', () => {
    const hits = searchDocs('bridge')
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].slug).toBe('bridge-integration')
  })

  test('requires every word to match and ignores empty queries', () => {
    expect(searchDocs('')).toHaveLength(0)
    expect(searchDocs('zzzzqqq nonexistent')).toHaveLength(0)
    expect(searchDocs('allowance approval').length).toBeGreaterThan(0)
  })
})
