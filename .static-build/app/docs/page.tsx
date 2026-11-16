import Link from 'next/link'
import { ArrowRight, Github } from 'lucide-react'
import { DOC_GROUPS, DOC_PAGES } from '@/site/docs/registry'
import { APP_URL, GITHUB_URL } from '@/site/links'

export default function DocsHome() {
  return (
    <div>
      <p className="site-eyebrow">Documentation</p>
      <h1 className="display mt-2 text-4xl font-bold site-ink text-balance sm:text-5xl">SocialPay Documentation</h1>
      <p className="site-muted mt-4 max-w-2xl text-lg leading-relaxed text-pretty">
        Learn how to send, request, split, swap and bridge USDC on Arc, how the smart contract works, and how SocialPay uses Circle products. Everything here describes what is in the open-source repository.
      </p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/docs/getting-started" className="site-btn site-focus">Get started <ArrowRight size={16} aria-hidden /></Link>
        <Link href={APP_URL} className="site-btn-ghost site-focus">Launch App</Link>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="site-btn-ghost site-focus"><Github size={16} aria-hidden /> GitHub</a>
      </div>

      <div className="mt-12 space-y-10">
        {DOC_GROUPS.map((g) => (
          <section key={g} aria-labelledby={`g-${g}`}>
            <h2 id={`g-${g}`} className="site-eyebrow mb-3">{g}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {DOC_PAGES.filter((p) => p.group === g).map((p) => (
                <li key={p.slug}>
                  <Link href={`/docs/${p.slug}`} className="site-card site-focus block h-full p-5 transition-transform hover:-translate-y-0.5">
                    <span className="display text-base font-semibold site-ink">{p.title}</span>
                    <span className="site-muted mt-1.5 block text-sm leading-relaxed">{p.summary}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  )
}
