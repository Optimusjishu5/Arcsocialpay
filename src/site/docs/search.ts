import { DOC_PAGES } from './registry'
import type { Block, DocPage } from './types'

export interface SearchEntry {
  slug: string
  page: string
  section: string
  sectionId: string
  text: string
}

export interface SearchHit extends SearchEntry {
  score: number
  snippet: string
}

function blockText(b: Block): string {
  switch (b.t) {
    case 'p':
    case 'h3':
    case 'code':
      return b.text
    case 'callout':
      return `${b.title ?? ''} ${b.text}`
    case 'ul':
    case 'ol':
      return b.items.join(' ')
    case 'table':
      return [...b.head, ...b.rows.flat()].join(' ')
    case 'links':
      return b.items.map((i) => `${i.label} ${i.note ?? ''}`).join(' ')
    default:
      return ''
  }
}

export function buildIndex(pages: DocPage[]): SearchEntry[] {
  return pages.flatMap((p) =>
    p.sections.map((s) => ({
      slug: p.slug,
      page: p.title,
      section: s.title,
      sectionId: s.id,
      text: `${p.summary} ${s.blocks.map(blockText).join(' ')}`.replace(/`/g, ''),
    })),
  )
}

const INDEX = buildIndex(DOC_PAGES)

function snippetFor(text: string, terms: string[]): string {
  const lower = text.toLowerCase()
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0
  const start = Math.max(0, at - 40)
  const slice = text.slice(start, start + 140).trim()
  return `${start > 0 ? '...' : ''}${slice}${start + 140 < text.length ? '...' : ''}`
}

/** Every word must appear in the page title, section title or text. Titles weigh more than body text. */
export function searchDocs(query: string, limit = 8, index: SearchEntry[] = INDEX): SearchHit[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1)
  if (terms.length === 0) return []
  const hits: SearchHit[] = []
  for (const e of index) {
    const title = `${e.page} ${e.section}`.toLowerCase()
    const body = e.text.toLowerCase()
    let score = 0
    let all = true
    for (const t of terms) {
      const inTitle = title.includes(t)
      const inBody = body.includes(t)
      if (!inTitle && !inBody) { all = false; break }
      score += (inTitle ? 5 : 0) + (inBody ? 1 : 0)
    }
    if (all) hits.push({ ...e, score, snippet: snippetFor(e.text, terms) })
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit)
}
