import { START_PAGES } from './content/start'
import { PAYMENT_PAGES } from './content/payments'
import { INTEGRATION_PAGES } from './content/integrations'
import { REFERENCE_PAGES } from './content/reference'
import type { DocGroup, DocPage } from './types'

export const DOC_GROUPS: DocGroup[] = ['Start here', 'Using SocialPay', 'Integrations', 'Reference']

/** Sidebar order. */
export const DOC_PAGES: DocPage[] = [...START_PAGES, ...PAYMENT_PAGES, ...INTEGRATION_PAGES, ...REFERENCE_PAGES]

export const findDoc = (slug: string): DocPage | undefined => DOC_PAGES.find((p) => p.slug === slug)

export function neighbours(slug: string): { prev?: DocPage; next?: DocPage } {
  const i = DOC_PAGES.findIndex((p) => p.slug === slug)
  if (i < 0) return {}
  return { prev: DOC_PAGES[i - 1], next: DOC_PAGES[i + 1] }
}
