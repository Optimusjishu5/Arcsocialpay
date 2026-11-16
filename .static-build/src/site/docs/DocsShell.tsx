'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { SiteHeader } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { DOC_GROUPS, DOC_PAGES, findDoc } from './registry'
import { searchDocs } from './search'

function SearchBox({ onNavigate }: { onNavigate?: () => void }) {
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const ref = useRef<HTMLInputElement>(null)
  const hits = useMemo(() => searchDocs(query), [query])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(input|textarea|select)$/i.test((e.target as HTMLElement | null)?.tagName ?? '')
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        ref.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const open = focused && query.trim().length > 1

  return (
    <div className="relative">
      <label htmlFor="doc-search" className="sr-only">Search the documentation</label>
      <Search size={16} className="site-subtle pointer-events-none absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
      <input
        id="doc-search" ref={ref} type="search" value={query} autoComplete="off"
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
        placeholder="Search docs ( / )"
        className="site-focus site-ink h-11 w-full rounded-xl pl-9 pr-9 text-sm"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        role="combobox" aria-expanded={open} aria-controls="doc-search-results"
      />
      {query && (
        <button type="button" onClick={() => { setQuery(''); ref.current?.focus() }} aria-label="Clear search" className="site-focus site-subtle absolute right-1.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full">
          <X size={14} aria-hidden />
        </button>
      )}
      {open && (
        <ul id="doc-search-results" role="listbox" className="absolute left-0 right-0 top-12 z-30 max-h-[70vh] overflow-y-auto rounded-2xl p-1.5 shadow-2xl" style={{ background: 'var(--bg)', border: '1px solid var(--border-strong)' }}>
          {hits.length === 0 && <li className="site-muted px-3 py-3 text-sm">No results for &ldquo;{query}&rdquo;.</li>}
          {hits.map((h) => (
            <li key={`${h.slug}#${h.sectionId}`} role="option" aria-selected={false}>
              <Link
                href={`/docs/${h.slug}#${h.sectionId}`}
                onClick={() => { setQuery(''); onNavigate?.() }}
                className="site-focus block rounded-xl px-3 py-2.5 hover:bg-[var(--surface)]"
              >
                <span className="block text-sm font-semibold site-ink">{h.page} <span className="site-subtle font-normal">/ {h.section}</span></span>
                <span className="site-muted mt-0.5 block text-xs leading-relaxed">{h.snippet}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Nav({ current, onNavigate }: { current: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Documentation" className="space-y-6">
      <div>
        <Link href="/docs" onClick={onNavigate} className={`site-focus flex min-h-[40px] items-center rounded-lg px-3 text-sm font-semibold ${current === '' ? 'site-ink' : 'site-muted'}`} style={current === '' ? { background: 'var(--surface-strong)' } : undefined}>
          Documentation home
        </Link>
      </div>
      {DOC_GROUPS.map((g) => (
        <div key={g}>
          <p className="site-eyebrow mb-1.5 px-3">{g}</p>
          <ul className="space-y-0.5">
            {DOC_PAGES.filter((p) => p.group === g).map((p) => {
              const active = p.slug === current
              return (
                <li key={p.slug}>
                  <Link
                    href={`/docs/${p.slug}`} onClick={onNavigate} aria-current={active ? 'page' : undefined}
                    className={`site-focus flex min-h-[40px] items-center rounded-lg px-3 text-sm ${active ? 'site-ink font-semibold' : 'site-muted font-medium hover:text-[color:var(--ink)]'}`}
                    style={active ? { background: 'var(--surface-strong)', boxShadow: 'inset 2px 0 0 var(--accent)' } : undefined}
                  >
                    {p.title}
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Toc({ slug }: { slug: string }) {
  const page = findDoc(slug)
  const [active, setActive] = useState('')

  useEffect(() => {
    if (!page) return
    const els = page.sections.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e)
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-80px 0px -65% 0px' },
    )
    els.forEach((e) => obs.observe(e))
    return () => obs.disconnect()
  }, [page])

  if (!page) return null
  return (
    <nav aria-label="On this page">
      <p className="site-eyebrow mb-2">On this page</p>
      <ul className="space-y-1" style={{ borderLeft: '1px solid var(--border)' }}>
        {page.sections.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} className={`site-focus -ml-px block border-l-2 py-1 pl-3 text-[13px] ${active === s.id ? 'site-ink font-semibold' : 'site-muted'}`} style={{ borderColor: active === s.id ? 'var(--accent)' : 'transparent' }}>
              {s.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export function DocsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const current = pathname.startsWith('/docs/') ? pathname.slice('/docs/'.length).split('/')[0] : ''
  const [drawer, setDrawer] = useState(false)

  // Close the menu when a link inside it moves to another page.
  const [drawerPath, setDrawerPath] = useState(pathname)
  if (drawerPath !== pathname) {
    setDrawerPath(pathname)
    setDrawer(false)
  }
  useEffect(() => {
    if (!drawer) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawer(false) }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' }
  }, [drawer])

  return (
    <div className="site-bg">
      <SiteHeader onMenu={() => setDrawer(true)} />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] xl:grid-cols-[250px_minmax(0,1fr)_200px]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] space-y-5 overflow-y-auto pb-6 pr-2">
            <SearchBox />
            <Nav current={current} />
          </div>
        </aside>
        <main id="doc-main" className="min-w-0 pb-10">
          <div className="mb-6 lg:hidden"><SearchBox /></div>
          {children}
        </main>
        <aside className="hidden xl:block">
          <div className="sticky top-24"><Toc slug={current} /></div>
        </aside>
      </div>
      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Documentation menu">
          <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/50" onClick={() => setDrawer(false)} />
          <div className="absolute inset-y-0 left-0 w-[86%] max-w-xs space-y-5 overflow-y-auto p-4" style={{ background: 'var(--bg)', borderRight: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <p className="display text-base font-bold site-ink">Documentation</p>
              <button type="button" onClick={() => setDrawer(false)} aria-label="Close menu" className="site-focus inline-flex h-11 w-11 items-center justify-center rounded-full site-ink"><X size={18} aria-hidden /></button>
            </div>
            <SearchBox onNavigate={() => setDrawer(false)} />
            <Nav current={current} onNavigate={() => setDrawer(false)} />
          </div>
        </div>
      )}
      <SiteFooter />
    </div>
  )
}
