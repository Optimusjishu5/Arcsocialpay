'use client'

import Link from 'next/link'
import { ArrowUpRight, BookOpen, Github } from 'lucide-react'
import { LandingHero } from '@/components/dashboard/LandingHero'
import { SiteHeader, XLogo } from '../SiteHeader'
import { SiteFooter } from '../SiteFooter'
import { APP_URL, DOCS_URL, GITHUB_URL, X_URL } from '../links'
import { ProductPreview } from './ProductPreview'
import { Features, HowItWorks, Integrations } from './Sections'
import { Architecture, FinalCta, Roadmap, Security } from './Trust'

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold site-ink" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      {children}
    </span>
  )
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="site-grid-bg pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.15fr_0.85fr]">
        <div>
          <div className="flex flex-wrap gap-2">
            <Pill><img src="/chains/arc.svg" alt="" width={14} height={14} /> Built on Arc Mainnet</Pill>
            <Pill><img src="/tokens/usdc.png" alt="" width={14} height={14} className="rounded-full" /> USDC-powered</Pill>
          </div>
          <h1 className="display mt-6 text-4xl font-bold leading-[1.05] site-ink text-balance sm:text-6xl">
            Social Payments. One Seamless Experience.
          </h1>
          <p className="site-muted mt-5 max-w-xl text-lg leading-relaxed text-pretty">
            SocialPay brings messaging, a social feed and native USDC payments into one app on Arc. Our mission: make sending money as easy and as personal as sending a message, without giving up control of your funds.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={APP_URL} className="site-btn site-focus">Launch App <ArrowUpRight size={16} aria-hidden /></Link>
            <Link href={DOCS_URL} className="site-btn-ghost site-focus"><BookOpen size={16} aria-hidden /> Documentation</Link>
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="site-btn-ghost site-focus"><Github size={16} aria-hidden /> GitHub</a>
            <a href={X_URL} target="_blank" rel="noopener noreferrer" className="site-btn-ghost site-focus"><XLogo size={14} /> Follow on X</a>
          </div>
          <p className="site-subtle mt-5 text-xs">Arc Mainnet moves real USDC. Start with a small amount.</p>
        </div>
        <div className="flex justify-center lg:justify-end">
          <LandingHero />
        </div>
      </div>
    </section>
  )
}

function Mission() {
  const items = [
    { title: 'One app, not five', text: 'Pay, chat, swap and bridge without hopping between tools.' },
    { title: 'USDC first', text: 'Every amount is a dollar amount. On Arc, USDC is also what you pay gas in.' },
    { title: 'Your keys, your funds', text: 'SocialPay never holds your money. You sign every transaction in your own wallet.' },
  ]
  return (
    <section className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <div className="grid gap-4 md:grid-cols-3">
        {items.map((i) => (
          <div key={i.title} className="site-card p-6">
            <h2 className="display text-lg font-semibold site-ink">{i.title}</h2>
            <p className="site-muted mt-2 text-sm leading-relaxed">{i.text}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/** Marketing homepage. Wrapped in .landing-root so a payment link (/?pay=...) can hide it while the app loads. */
export function Landing() {
  return (
    <div className="landing-root site-bg">
      <SiteHeader />
      <main>
        <Hero />
        <Mission />
        <ProductPreview />
        <Features />
        <Integrations />
        <HowItWorks />
        <Architecture />
        <Security />
        <Roadmap />
        <FinalCta />
      </main>
      <SiteFooter />
    </div>
  )
}
