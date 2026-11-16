import type { Metadata } from 'next'
import { DocsShell } from '@/site/docs/DocsShell'

export const metadata: Metadata = {
  title: { default: 'Documentation', template: '%s | SocialPay Docs' },
  description: 'Guides, architecture and developer resources for SocialPay on Arc Mainnet.',
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>
}
