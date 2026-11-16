// Structured documentation content. Pages are plain data so they can be searched, indexed and
// rendered the same way everywhere. Inline `code` in any text field is drawn as code.

export type Tone = 'info' | 'warn' | 'ok'

export type Block =
  | { t: 'p'; text: string }
  | { t: 'h3'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'code'; text: string; lang?: string }
  | { t: 'callout'; tone: Tone; title?: string; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'diagram'; id: 'architecture' | 'payment-flow' | 'bridge-flow' }
  | { t: 'links'; items: { label: string; href: string; note?: string }[] }
  | { t: 'addresses'; group: 'own' | 'protocol' }
  | { t: 'facts' }

export interface DocSection {
  id: string
  title: string
  blocks: Block[]
}

export type DocGroup = 'Start here' | 'Using SocialPay' | 'Integrations' | 'Reference'

export interface DocPage {
  slug: string
  title: string
  summary: string
  group: DocGroup
  sections: DocSection[]
}
