import Link from 'next/link'
import { FOOTER_LINKS } from './links'

export function SiteFooter() {
  return (
    <footer style={{ borderTop: '1px solid var(--border)' }}>
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="" width={28} height={28} className="rounded-lg" style={{ width: 28, height: 28 }} />
            <p className="display text-base font-semibold site-ink">
              SocialPay <span className="site-subtle" aria-hidden>|</span> Built on Arc
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              {FOOTER_LINKS.map((l) => (
                <li key={l.label}>
                  {l.external ? (
                    <a href={l.href} target="_blank" rel="noopener noreferrer" className="site-focus site-muted inline-flex min-h-[44px] items-center text-sm font-medium hover:text-[color:var(--ink)]">
                      {l.label}
                    </a>
                  ) : (
                    <Link href={l.href} className="site-focus site-muted inline-flex min-h-[44px] items-center text-sm font-medium hover:text-[color:var(--ink)]">
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <p className="site-subtle mt-6 max-w-3xl text-xs leading-relaxed">
          SocialPay runs on Arc Mainnet and moves real USDC. Transactions are final once confirmed. No independent audit report is
          published for SocialPay. Review every transaction in your wallet before you sign it.
        </p>
      </div>
    </footer>
  )
}
