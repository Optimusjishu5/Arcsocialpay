'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Github, Menu, X } from 'lucide-react'
import { ThemeToggle } from './theme'
import { APP_URL, DOCS_URL, GITHUB_URL, X_URL } from './links'

/** The X logo (lucide has no brand icons). */
export function XLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

const NAV = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'Security', href: '/#security' },
  { label: 'Roadmap', href: '/#roadmap' },
  { label: 'Docs', href: DOCS_URL },
] as const

export function Brand({ size = 32 }: { size?: number }) {
  return (
    <Link href="/" className="site-focus inline-flex min-w-0 items-center gap-2 rounded-lg sm:gap-2.5" aria-label="SocialPay home">
      <img src="/logo-96.png" alt="" width={size} height={size} className="flex-shrink-0 rounded-lg" style={{ width: size, height: size }} />
      <span className="display truncate text-base font-bold site-ink sm:text-lg">SocialPay</span>
    </Link>
  )
}

export function SiteHeader({ onMenu }: { onMenu?: () => void }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <header
      className="sticky top-0 z-40"
      style={{ background: 'color-mix(in srgb, var(--bg) 82%, transparent)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid var(--border)' }}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:gap-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {onMenu && (
            <button
              type="button" onClick={onMenu} aria-label="Open documentation menu"
              className="site-focus inline-flex h-11 w-11 items-center justify-center rounded-full site-ink lg:hidden"
              style={{ border: '1px solid var(--border)' }}
            >
              <Menu size={18} aria-hidden />
            </button>
          )}
          <Brand />
        </div>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link key={n.label} href={n.href} className="site-focus site-muted rounded-full px-3.5 py-2 text-sm font-medium transition-colors hover:text-[color:var(--ink)]">
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-shrink-0 items-center gap-1.5 sm:gap-2">
          <a
            href={GITHUB_URL} target="_blank" rel="noopener noreferrer" aria-label="SocialPay on GitHub"
            className="site-focus hidden h-11 w-11 items-center justify-center rounded-full site-ink hover:bg-[var(--surface)] lg:inline-flex"
            style={{ border: '1px solid var(--border)' }}
          >
            <Github size={18} aria-hidden />
          </a>
          <a
            href={X_URL} target="_blank" rel="noopener noreferrer" aria-label="SocialPay on X"
            className="site-focus hidden h-11 w-11 items-center justify-center rounded-full site-ink hover:bg-[var(--surface)] lg:inline-flex"
            style={{ border: '1px solid var(--border)' }}
          >
            <XLogo size={16} />
          </a>
          <ThemeToggle />
          <Link href={APP_URL} className="site-btn site-btn-sm site-focus">
            <span className="sm:hidden">Launch</span><span className="hidden sm:inline">Launch App</span>
            <ArrowUpRight size={16} aria-hidden className="flex-shrink-0" />
          </Link>
          <button
            type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={open ? 'Close menu' : 'Open menu'}
            className="site-focus inline-flex h-11 w-11 items-center justify-center rounded-full site-ink md:hidden"
            style={{ border: '1px solid var(--border)' }}
          >
            {open ? <X size={18} aria-hidden /> : <Menu size={18} aria-hidden />}
          </button>
        </div>
      </div>

      {open && (
        <nav aria-label="Mobile" className="md:hidden px-4 pb-4" style={{ borderTop: '1px solid var(--border)' }}>
          <ul className="mt-2 space-y-1">
            {NAV.map((n) => (
              <li key={n.label}>
                <Link href={n.href} onClick={() => setOpen(false)} className="site-focus site-ink flex min-h-[44px] items-center rounded-xl px-3 text-base font-medium hover:bg-[var(--surface)]">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="site-focus site-ink flex min-h-[44px] items-center rounded-xl px-3 text-base font-medium hover:bg-[var(--surface)]">
                GitHub
              </a>
            </li>
            <li>
              <a href={X_URL} target="_blank" rel="noopener noreferrer" className="site-focus site-ink flex min-h-[44px] items-center rounded-xl px-3 text-base font-medium hover:bg-[var(--surface)]">
                X (Twitter)
              </a>
            </li>
          </ul>
          <Link href={APP_URL} onClick={() => setOpen(false)} className="site-btn site-focus mt-3 w-full">
            Launch App <ArrowUpRight size={16} aria-hidden />
          </Link>
        </nav>
      )}
    </header>
  )
}
