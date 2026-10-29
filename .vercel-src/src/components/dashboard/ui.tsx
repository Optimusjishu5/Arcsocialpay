'use client'

import type { CSSProperties, ReactNode } from 'react'
import { motion } from 'framer-motion'
import type { LucideIcon } from 'lucide-react'

// Colorful icon palette (from the Arc spectral accents, pushed a bit deeper so white icons stay readable).
export const TONES = {
  blue: ['#5fbeff', '#2563eb'],
  green: ['#7ef1b3', '#059669'],
  violet: ['#af8ff4', '#6d28d9'],
  amber: ['#ffcd83', '#ea580c'],
  rose: ['#ff8a9b', '#e11d48'],
  teal: ['#5eead4', '#0f766e'],
  indigo: ['#a5b4fc', '#4338ca'],
  pink: ['#f9a8d4', '#c026d3'],
} as const

export type Tone = keyof typeof TONES

/** Rounded gradient tile with a white icon and a soft colored glow. */
export function GradientIcon({ icon: Icon, tone, size = 44 }: { icon: LucideIcon; tone: Tone; size?: number }) {
  const [from, to] = TONES[tone]
  return (
    <span
      className="inline-flex items-center justify-center flex-shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: Math.round(size * 0.32),
        background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
        boxShadow: `0 10px 22px -8px ${to}b3, inset 0 1px 0 rgba(255,255,255,0.4)`,
        color: '#fff',
      }}
    >
      <Icon size={Math.round(size * 0.46)} strokeWidth={2.2} />
    </span>
  )
}

/** CSS variables that tint cards, fields, labels and primary buttons inside a `.tone-scope` page. */
export function toneVars(tone: Tone): CSSProperties {
  const [from, to] = TONES[tone]
  return { '--tone-from': from, '--tone-to': to, '--tone-glow': `${to}73` } as CSSProperties
}

/** Gradient fill + colored glow for buttons that should match a GradientIcon. */
export function toneStyle(tone: Tone): CSSProperties {
  const [from, to] = TONES[tone]
  return {
    background: `linear-gradient(135deg, ${from} 0%, ${to} 100%)`,
    boxShadow: `0 10px 22px -8px ${to}b3, inset 0 1px 0 rgba(255,255,255,0.4)`,
    color: '#fff',
  }
}

export const glassCard: CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  backdropFilter: 'blur(18px) saturate(160%)',
  WebkitBackdropFilter: 'blur(18px) saturate(160%)',
  boxShadow: '0 10px 30px -12px rgba(8,20,40,0.28), inset 0 1px 0 rgba(255,255,255,0.06)',
}

export function ActionTile({ icon, tone, label, onClick }: { icon: LucideIcon; tone: Tone; label: string; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
      className="flex flex-col items-center gap-2 py-3 rounded-2xl min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      style={glassCard}
    >
      <GradientIcon icon={icon} tone={tone} />
      <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{label}</span>
    </motion.button>
  )
}

export function StatCard({ icon, tone, label, value, unit }: { icon: LucideIcon; tone: Tone; label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl p-3 flex flex-col gap-2 min-w-0" style={glassCard}>
      <GradientIcon icon={icon} tone={tone} size={32} />
      <div className="min-w-0">
        <div className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{label}</div>
        <div className="flex items-baseline gap-1 min-w-0">
          <span className="display font-bold text-base tabnum truncate" style={{ color: 'var(--ink)' }}>{value}</span>
          {unit && <span className="text-[10px] font-semibold" style={{ color: 'var(--subtle)' }}>{unit}</span>}
        </div>
      </div>
    </div>
  )
}

export function Section({
  title, icon, tone, action, children,
}: { title: string; icon: LucideIcon; tone: Tone; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl overflow-hidden" style={glassCard}>
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div className="flex items-center gap-2.5">
          <GradientIcon icon={icon} tone={tone} size={30} />
          <h2 className="display font-semibold text-base" style={{ color: 'var(--ink)' }}>{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-2 pt-1">{children}</div>
    </section>
  )
}

export function EmptyRow({ icon: Icon, text, cta, onCta }: { icon: LucideIcon; text: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 py-6 text-center">
      <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'var(--surface-muted)', color: 'var(--subtle)' }}>
        <Icon size={18} />
      </span>
      <p className="text-sm" style={{ color: 'var(--muted)' }}>{text}</p>
      {cta && onCta && (
        <button onClick={onCta} className="text-xs font-semibold px-3 h-8 rounded-full" style={{ background: 'var(--surface-muted)', color: 'var(--accent)' }}>
          {cta}
        </button>
      )}
    </div>
  )
}
