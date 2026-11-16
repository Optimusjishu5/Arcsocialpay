'use client'

import { useEffect, useMemo, useState } from 'react'
import { isAddress, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { Check, Search, TriangleAlert } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { TokenLogo } from './TokenLogo'
import { ARC_CHAIN_ID } from '../../chains'
import { formatTokenAmount, readCustomToken, shortAddress, type ArcToken } from '../../lib/arcTokens'

interface TokenPickerProps {
  open: boolean
  onClose: () => void
  tokens: readonly ArcToken[]
  balances: Record<string, bigint>
  selected?: string
  onSelect: (t: ArcToken) => void
  /** Lets a pasted contract address be imported (only for routes that can price any pool). */
  allowCustom?: boolean
  loading?: boolean
  title?: string
}

/** Searchable list of every Arc token a route supports, with logos and your balances. */
export function TokenPicker(props: TokenPickerProps) {
  return (
    <Modal open={props.open} onClose={props.onClose} title={props.title ?? 'Select a token'} maxWidth="max-w-md">
      <PickerBody {...props} />
    </Modal>
  )
}

function PickerBody({ onClose, tokens, balances, selected, onSelect, allowCustom, loading }: TokenPickerProps) {
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [query, setQuery] = useState('')
  const [lookup, setLookup] = useState<{ addr: string; token?: ArcToken; error?: string } | null>(null)
  const q = query.trim().toLowerCase()
  // A lookup result only applies while the pasted address is still the one that was looked up.
  const custom = lookup && lookup.addr === q ? lookup.token ?? null : null
  const customError = lookup && lookup.addr === q ? lookup.error ?? '' : ''

  // Tokens you hold come first.
  const filtered = useMemo(() => {
    const rows = !q ? [...tokens] : tokens.filter((t) => t.symbol.toLowerCase().includes(q) || t.name.toLowerCase().includes(q) || t.address.toLowerCase() === q)
    const held = (t: ArcToken) => ((balances[t.address.toLowerCase()] ?? 0n) > 0n ? 1 : 0)
    return rows.sort((a, b) => held(b) - held(a))
  }, [tokens, q, balances])

  // A pasted address that is not in the list can be looked up onchain.
  useEffect(() => {
    if (!allowCustom || !client || !isAddress(query.trim())) return
    const addr = query.trim() as Address
    if (tokens.some((t) => t.address.toLowerCase() === addr.toLowerCase())) return
    let cancelled = false
    readCustomToken(client, addr)
      .then((token) => { if (!cancelled) setLookup({ addr: addr.toLowerCase(), token }) })
      .catch(() => { if (!cancelled) setLookup({ addr: addr.toLowerCase(), error: 'That address is not an ERC-20 token on Arc.' }) })
    return () => { cancelled = true }
  }, [query, allowCustom, client, tokens])

  return (
    <div className="space-y-3 -mx-1">
      <div className="flex items-center gap-2 h-11 px-3 rounded-xl" style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
        <Search size={16} style={{ color: 'var(--muted)' }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={allowCustom ? 'Search by name or paste an address' : 'Search by name or symbol'}
          aria-label="Search tokens"
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent outline-none text-sm"
          style={{ color: 'var(--ink)' }}
        />
      </div>
      <p className="text-[11px] uppercase tracking-wider px-1" style={{ color: 'var(--subtle)' }}>
        {loading ? 'Loading tokens on Arc...' : `${tokens.length} tokens on Arc`}
      </p>

      <ul className="max-h-[52dvh] overflow-y-auto -mx-1 px-1 space-y-0.5" role="listbox" aria-label="Tokens">
        {custom && (
          <li>
            <button
              type="button"
              onClick={() => { onSelect(custom); onClose() }}
              className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left min-h-[56px] hover:bg-[var(--surface-muted)]"
            >
              <TokenLogo symbol={custom.symbol} size={36} />
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-semibold" style={{ color: 'var(--ink)' }}>{custom.symbol}</span>
                <span className="flex items-center gap-1 text-[11px]" style={{ color: 'var(--danger)' }}>
                  <TriangleAlert size={11} /> Not on the token list. Check the contract {shortAddress(custom.address)} before you trade.
                </span>
              </span>
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>Import</span>
            </button>
          </li>
        )}
        {customError && <li className="p-3 text-xs" style={{ color: 'var(--danger)' }}>{customError}</li>}
        {filtered.map((t) => {
          const bal = balances[t.address.toLowerCase()]
          const isSel = selected?.toLowerCase() === t.address.toLowerCase()
          const usd = bal !== undefined && t.priceUSD ? (Number(bal) / 10 ** t.decimals) * t.priceUSD : undefined
          return (
            <li key={t.address}>
              <button
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => { onSelect(t); onClose() }}
                className="w-full flex items-center gap-3 p-2.5 rounded-xl text-left min-h-[56px] transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                style={isSel ? { background: 'var(--surface-muted)' } : undefined}
              >
                <TokenLogo symbol={t.symbol} logoURI={t.logoURI} address={t.address} size={36} />
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                    {t.symbol}{isSel && <Check size={13} style={{ color: 'var(--success)' }} />}
                  </span>
                  <span className="block text-[11px] truncate" style={{ color: 'var(--muted)' }}>{t.name} · {shortAddress(t.address)}</span>
                </span>
                {bal !== undefined && (
                  <span className="text-right flex-shrink-0">
                    <span className="block text-sm tabnum" style={{ color: bal > 0n ? 'var(--ink)' : 'var(--subtle)' }}>{formatTokenAmount(bal, t.decimals, 4)}</span>
                    {usd !== undefined && usd >= 0.01 && <span className="block text-[11px] tabnum" style={{ color: 'var(--muted)' }}>${usd.toFixed(2)}</span>}
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {loading && tokens.length <= 3 && [0, 1, 2, 3].map((i) => (
          <li key={`sk${i}`} className="flex items-center gap-3 p-2.5 min-h-[56px]" aria-hidden>
            <span className="w-9 h-9 rounded-full animate-pulse" style={{ background: 'var(--surface-muted)' }} />
            <span className="h-4 w-28 rounded-lg animate-pulse" style={{ background: 'var(--surface-muted)' }} />
          </li>
        ))}
        {filtered.length === 0 && !custom && !customError && (
          <li className="p-6 text-center text-sm" style={{ color: 'var(--muted)' }}>No token matches "{query.trim()}".</li>
        )}
      </ul>
    </div>
  )
}
