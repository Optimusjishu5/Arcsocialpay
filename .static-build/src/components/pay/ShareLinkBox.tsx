'use client'

import { useEffect, useState } from 'react'
import { Check, Copy, Share2 } from 'lucide-react'
import { buildShareLink } from '../../lib/share'
import { copyText } from '../../utils/copy'

/** Resolves the public link for an app-relative path; null until ready. */
function useShareLink(path: string): string | null {
  const [resolved, setResolved] = useState<{ path: string; url: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    void buildShareLink(path).then((url) => {
      if (!cancelled) setResolved({ path, url })
    })
    return () => {
      cancelled = true
    }
  }, [path])
  return resolved && resolved.path === path ? resolved.url : null
}

export function ShareLinkBox({ path, label, hint }: { path: string; label: string; hint?: string }) {
  const link = useShareLink(path)
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  function copy() {
    if (!link) return
    void copyText(link, 'Link copied').then((ok) => {
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  function share() {
    if (!link) return
    navigator.share({ title: 'SocialPay payment request', url: link }).catch(() => copy())
  }

  return (
    <div>
      <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
        {label}
      </label>
      <div className="flex items-center gap-2 p-3 rounded-xl"
        data-tp="">
        <span className="text-xs flex-1 truncate" style={{ color: 'var(--ink-2)' }}>{link ?? 'Preparing link...'}</span>
        {canShare && (
          <button onClick={share} disabled={!link} aria-label="Share link"
            className="p-2 rounded-lg flex-shrink-0 disabled:opacity-50"
            style={{ background: 'var(--surface-strong)', color: 'var(--muted)' }}>
            <Share2 size={14} />
          </button>
        )}
        <button onClick={copy} disabled={!link} aria-label="Copy link"
          className="p-2 rounded-lg flex-shrink-0 disabled:opacity-50"
          style={{ background: 'var(--surface-strong)', color: copied ? 'var(--success)' : 'var(--muted)' }}>
          {copied ? <Check size={14} /> : <Copy size={14} />}
        </button>
      </div>
      {hint && <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>{hint}</p>}
    </div>
  )
}

export const fieldLabel = 'text-xs font-semibold uppercase tracking-wider mb-1.5 block'
export const fieldClass =
  'w-full h-11 rounded-xl px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--tone-from,var(--focus))]'
export const fieldStyle = {
  background: 'color-mix(in srgb, var(--tone-from, #5fbeff) 9%, var(--surface-muted))',
  border: '1px solid color-mix(in srgb, var(--tone-to, #2563eb) 30%, var(--border))',
  color: 'var(--ink)',
} as const
