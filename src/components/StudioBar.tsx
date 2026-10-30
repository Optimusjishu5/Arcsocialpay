import { ExternalLink } from 'lucide-react'

/** Slim bar at the very top of the app crediting Arc Studio. */
export function StudioBar() {
  return (
    <div
      className="flex items-center justify-center gap-2 h-8 px-4 text-xs"
      style={{ background: 'var(--surface-muted)', borderBottom: '1px solid var(--border)', color: 'var(--muted)' }}
    >
      <span>Built with</span>
      <a
        href="https://studio.arc.io"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 font-semibold transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] rounded"
        style={{ color: 'var(--ink)' }}
      >
        Arc Studio
        <ExternalLink size={11} aria-hidden />
      </a>
    </div>
  )
}
