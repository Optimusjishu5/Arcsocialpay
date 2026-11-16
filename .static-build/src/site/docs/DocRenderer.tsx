import { AlertTriangle, ArrowUpRight, CheckCircle2, Info } from 'lucide-react'
import type { ReactNode } from 'react'
import { ArchitectureDiagram, BridgeFlowDiagram, PaymentFlowDiagram } from '../diagrams'
import { ARC_FACTS, OWN_CONTRACTS, PROTOCOL_CONTRACTS, explorerAddress } from '../links'
import type { Block, DocSection, Tone } from './types'

/** Draws `code` spans inside plain text. */
export function Inline({ text }: { text: string }): ReactNode {
  return text.split('`').map((part, i) =>
    i % 2 === 1 ? <code key={i} className="doc-code">{part}</code> : <span key={i}>{part}</span>,
  )
}

const TONES: Record<Tone, { icon: typeof Info; color: string; bg: string }> = {
  info: { icon: Info, color: 'var(--accent)', bg: 'var(--surface)' },
  warn: { icon: AlertTriangle, color: 'var(--danger)', bg: 'var(--danger-bg)' },
  ok: { icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-bg)' },
}

function isExternal(href: string) {
  return /^https?:\/\//.test(href)
}

function AddressTable({ group }: { group: 'own' | 'protocol' }) {
  const rows = group === 'own' ? OWN_CONTRACTS : PROTOCOL_CONTRACTS
  return (
    <div className="space-y-3">
      {rows.map((r) => (
        <div key={r.address} className="site-card-strong p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <p className="display text-sm font-semibold site-ink">{r.name}</p>
            <a href={explorerAddress(r.address)} target="_blank" rel="noopener noreferrer" className="site-link inline-flex min-h-[28px] items-center gap-1 text-xs font-medium">
              Arc Explorer <ArrowUpRight size={12} aria-hidden />
            </a>
          </div>
          <p className="mono mt-1.5 break-all text-xs site-muted">{r.address}</p>
          <p className="site-muted mt-2 text-sm">{r.note}</p>
          <p className="site-subtle mt-1 text-xs">In this repository: <code className="doc-code">{r.where}</code></p>
        </div>
      ))}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-2xl" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full min-w-[480px] border-collapse text-left text-sm">
        <thead>
          <tr style={{ background: 'var(--surface-muted)' }}>
            {head.map((h) => <th key={h} scope="col" className="px-4 py-2.5 text-xs font-semibold uppercase tracking-wider site-muted">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
              {r.map((c, j) => <td key={j} className="px-4 py-2.5 align-top site-muted"><Inline text={c} /></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case 'p':
      return <p><Inline text={b.text} /></p>
    case 'h3':
      return <h3 className="display pt-2 text-lg font-semibold site-ink">{b.text}</h3>
    case 'ul':
      return <ul className="list-disc space-y-1.5 pl-5 marker:text-[color:var(--subtle)]">{b.items.map((i) => <li key={i}><Inline text={i} /></li>)}</ul>
    case 'ol':
      return <ol className="list-decimal space-y-1.5 pl-5 marker:text-[color:var(--subtle)]">{b.items.map((i) => <li key={i}><Inline text={i} /></li>)}</ol>
    case 'code':
      return <pre className="doc-pre"><code>{b.text}</code></pre>
    case 'callout': {
      const t = TONES[b.tone]
      return (
        <div role="note" className="flex gap-3 rounded-2xl p-4" style={{ background: t.bg, border: '1px solid var(--border)' }}>
          <t.icon size={18} className="mt-0.5 flex-none" style={{ color: t.color }} aria-hidden />
          <div className="min-w-0 space-y-1">
            {b.title && <p className="text-sm font-semibold site-ink">{b.title}</p>}
            <p className="!max-w-none text-sm leading-relaxed" style={{ color: 'var(--ink-2)' }}><Inline text={b.text} /></p>
          </div>
        </div>
      )
    }
    case 'table':
      return <Table head={b.head} rows={b.rows} />
    case 'diagram':
      return b.id === 'architecture' ? <ArchitectureDiagram /> : b.id === 'payment-flow' ? <PaymentFlowDiagram /> : <BridgeFlowDiagram />
    case 'links':
      return (
        <ul className="grid gap-3 sm:grid-cols-2">
          {b.items.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                {...(isExternal(l.href) ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="site-card-strong site-focus block h-full p-4 transition-transform hover:-translate-y-0.5"
              >
                <span className="flex items-center justify-between gap-2 text-sm font-semibold site-ink">{l.label}{isExternal(l.href) && <ArrowUpRight size={14} aria-hidden />}</span>
                {l.note && <span className="site-muted mt-1 block text-xs leading-relaxed">{l.note}</span>}
              </a>
            </li>
          ))}
        </ul>
      )
    case 'addresses':
      return <AddressTable group={b.group} />
    case 'facts':
      return <Table head={['Detail', 'Value']} rows={ARC_FACTS.map((f) => [f.label, f.value])} />
  }
}

export function DocSections({ sections }: { sections: DocSection[] }) {
  return (
    <div className="doc-prose space-y-12">
      {sections.map((s) => (
        <section key={s.id} id={s.id} className="scroll-mt-24 space-y-4">
          <h2 className="display text-2xl font-bold site-ink">
            <a href={`#${s.id}`} className="site-focus rounded no-underline">{s.title}</a>
          </h2>
          {s.blocks.map((b, i) => <BlockView key={i} b={b} />)}
        </section>
      ))}
    </div>
  )
}
