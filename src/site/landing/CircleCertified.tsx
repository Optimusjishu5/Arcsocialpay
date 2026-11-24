import { ArrowUpRight, Check } from 'lucide-react'
import { CIRCLE_PARTNER_URL } from '../links'

// A scalloped "verified" seal: a circle whose edge ripples 12 times.
const SEAL_PATH = (() => {
  const pts: string[] = []
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2
    const r = 10.6 + Math.cos(a * 12) * 1.15
    pts.push(`${(12 + Math.cos(a) * r).toFixed(2)} ${(12 + Math.sin(a) * r).toFixed(2)}`)
  }
  return `M${pts.join(' L')} Z`
})()

function VerifiedSeal({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="flex-shrink-0">
      <path d={SEAL_PATH} fill="#3d5af1" />
      <path d="M7.6 12.4l3 3 5.8-6.2" fill="none" stroke="#fff" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * SocialPay's Circle Alliance Program certificate. The card keeps the same light look in light and dark
 * themes, like a printed certificate, so it reads as an official badge.
 */
export function CircleCertified() {
  return (
    <section aria-label="Circle Alliance Program certification" className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
      <a
        href={CIRCLE_PARTNER_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="site-focus group relative mx-auto block w-full max-w-md overflow-hidden rounded-[32px] p-7 sm:p-8 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.99]"
        style={{ background: '#fdfcfa', border: '1px solid rgba(20,27,56,0.08)', boxShadow: '0 28px 60px -28px rgba(20,27,56,0.45), 0 2px 0 rgba(255,255,255,0.6) inset' }}
      >
        {/* Soft ring in the corner, as on a certificate */}
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full" style={{ border: '40px solid #ecefff' }} />

        <div className="relative">
          {/* Circle's own logo and name, as supplied by Circle */}
          <img src="/circle-logo.svg" alt="Circle" width={192} height={40} className="h-10 w-auto" draggable={false} />

          <p className="mt-6 text-base" style={{ color: '#5b6275' }}>Circle Alliance Program</p>
          <h2 className="display mt-1 flex items-center gap-2 text-3xl font-bold leading-tight sm:text-4xl" style={{ color: '#111a3c', letterSpacing: '-0.02em' }}>
            Certified Member
            <VerifiedSeal size={30} />
          </h2>
          <p className="mt-3 max-w-xs text-base leading-relaxed" style={{ color: '#5b6275' }}>
            SocialPay is a certified member of the Circle Alliance Program.
          </p>

          <div className="mt-5 flex items-center gap-4">
            <span className="inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold" style={{ background: '#e9f5ec', border: '1px solid #bfe3c9', color: '#2f7a45' }}>
              <Check size={16} strokeWidth={3} aria-hidden /> Verified
            </span>
          </div>

          <span className="mt-5 inline-flex min-h-[44px] items-center gap-1.5 text-base font-semibold transition-all group-hover:gap-2.5" style={{ color: '#3d5af1' }}>
            View certificate
            <ArrowUpRight size={18} aria-hidden />
            <span className="sr-only">(opens Circle's partner page in a new tab)</span>
          </span>
        </div>
      </a>
    </section>
  )
}
