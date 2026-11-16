import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { DOC_PAGES, findDoc, neighbours } from '@/site/docs/registry'
import { DocSections } from '@/site/docs/DocRenderer'
import { GITHUB_ISSUES_URL } from '@/site/links'

type Params = { slug: string }

export function generateStaticParams(): Params[] {
  return DOC_PAGES.map((p) => ({ slug: p.slug }))
}

export const dynamicParams = false

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params
  const page = findDoc(slug)
  return page ? { title: page.title, description: page.summary } : {}
}

export default async function DocPageRoute({ params }: { params: Promise<Params> }) {
  const { slug } = await params
  const page = findDoc(slug)
  if (!page) notFound()
  const { prev, next } = neighbours(slug)

  return (
    <article>
      <p className="site-eyebrow">{page.group}</p>
      <h1 className="display mt-2 text-4xl font-bold site-ink text-balance">{page.title}</h1>
      <p className="site-muted mt-3 max-w-2xl text-lg leading-relaxed text-pretty">{page.summary}</p>
      <div className="mt-10"><DocSections sections={page.sections} /></div>

      <div className="mt-14 grid gap-3 sm:grid-cols-2">
        {prev ? (
          <Link href={`/docs/${prev.slug}`} className="site-card site-focus flex flex-col p-4 transition-transform hover:-translate-y-0.5">
            <span className="site-subtle inline-flex items-center gap-1 text-xs"><ArrowLeft size={12} aria-hidden /> Previous</span>
            <span className="display mt-1 text-sm font-semibold site-ink">{prev.title}</span>
          </Link>
        ) : <span />}
        {next ? (
          <Link href={`/docs/${next.slug}`} className="site-card site-focus flex flex-col p-4 text-right transition-transform hover:-translate-y-0.5">
            <span className="site-subtle inline-flex items-center justify-end gap-1 text-xs">Next <ArrowRight size={12} aria-hidden /></span>
            <span className="display mt-1 text-sm font-semibold site-ink">{next.title}</span>
          </Link>
        ) : <span />}
      </div>
      <p className="site-subtle mt-8 text-sm">
        Found something unclear or out of date? <a href={GITHUB_ISSUES_URL} target="_blank" rel="noopener noreferrer" className="site-link">Open an issue on GitHub</a>.
      </p>
    </article>
  )
}
