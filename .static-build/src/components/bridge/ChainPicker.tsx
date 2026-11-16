'use client'

import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { LogoImg } from '../ui/LogoImg'
import { TONES, type Tone } from '../dashboard/ui'
import { fieldLabel } from '../pay/ShareLinkBox'

export interface ChainOption {
  key: string
  id: number
  name: string
  logoURI?: string
}

const FALLBACK_TONES: Tone[] = ['blue', 'violet', 'amber', 'green', 'rose', 'teal', 'indigo', 'pink']

/** Round network logo; falls back to a coloured initial when the image is missing. */
export function ChainLogo({ name, logoURI, size = 32 }: { name: string; logoURI?: string; size?: number }) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const [from, to] = TONES[FALLBACK_TONES[h % FALLBACK_TONES.length]]
  return (
    <LogoImg
      src={logoURI}
      size={size}
      fallback={
        <span
          aria-hidden
          className="inline-flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
          style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: `linear-gradient(135deg, ${from}, ${to})` }}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      }
    />
  )
}

interface ChainPickerProps {
  label: string
  value: string
  options: readonly ChainOption[]
  onChange: (key: string) => void
  disabled?: boolean
  loading?: boolean
}

/** Field that shows the chosen network with its logo and opens a searchable list of every network. */
export function ChainPicker({ label, value, options, onChange, disabled, loading }: ChainPickerProps) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.key === value)
  return (
    <div>
      <label className={fieldLabel} style={{ color: 'var(--muted)' }}>{label}</label>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`${label} network, ${selected?.name ?? 'none'} selected`}
        className="w-full flex items-center gap-3 h-14 px-3 rounded-2xl text-left transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border-strong)', color: 'var(--ink)' }}
      >
        <ChainLogo name={selected?.name ?? '?'} logoURI={selected?.logoURI} size={32} />
        <span className="flex-1 font-semibold truncate">{selected?.name ?? 'Select network'}</span>
        <ChevronDown size={16} style={{ color: 'var(--muted)' }} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Select network" maxWidth="max-w-md">
        <ChainList
          options={options} value={value} loading={loading}
          onPick={(k) => { onChange(k); setOpen(false) }}
        />
      </Modal>
    </div>
  )
}

function ChainList({ options, value, loading, onPick }: { options: readonly ChainOption[]; value: string; loading?: boolean; onPick: (k: string) => void }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = useMemo(() => (q ? options.filter((o) => o.name.toLowerCase().includes(q) || String(o.id) === q) : options), [options, q])
  return (
    <div className="space-y-3 -mx-1">
      <div className="flex items-center gap-2 h-11 px-3 rounded-xl" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <Search size={16} style={{ color: 'var(--muted)' }} />
        <input
          value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search network" aria-label="Search networks"
          autoComplete="off" spellCheck={false} className="flex-1 bg-transparent outline-none text-sm" style={{ color: 'var(--ink)' }}
        />
      </div>
      <p className="text-[11px] uppercase tracking-wider px-1" style={{ color: 'var(--subtle)' }}>
        {loading ? 'Loading networks...' : `${options.length} networks`}
      </p>
      <ul className="max-h-[56dvh] overflow-y-auto -mx-1 px-1 space-y-0.5" role="listbox" aria-label="Networks">
        {rows.map((o) => {
          const isSel = o.key === value
          return (
            <li key={o.key}>
              <button
                type="button" role="option" aria-selected={isSel} onClick={() => onPick(o.key)}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left min-h-[56px] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                style={isSel ? { background: 'var(--surface-muted)' } : undefined}
              >
                <ChainLogo name={o.name} logoURI={o.logoURI} size={40} />
                <span className="flex-1 text-sm font-semibold" style={{ color: 'var(--ink)' }}>{o.name}</span>
                {isSel && <Check size={16} style={{ color: 'var(--success)' }} />}
              </button>
            </li>
          )
        })}
        {loading && options.length <= 1 && [0, 1, 2, 3, 4, 5].map((i) => (
          <li key={`sk${i}`} className="flex items-center gap-3 p-2.5 min-h-[56px]" aria-hidden>
            <span className="w-10 h-10 rounded-full animate-pulse" style={{ background: 'var(--surface-muted)' }} />
            <span className="h-4 w-32 rounded-lg animate-pulse" style={{ background: 'var(--surface-muted)' }} />
          </li>
        ))}
        {rows.length === 0 && <li className="p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No network matches "{query.trim()}".</li>}
      </ul>
    </div>
  )
}
