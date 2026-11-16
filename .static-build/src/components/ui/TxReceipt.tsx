'use client'

// The blockchain transaction behind a "Successful" message: network, transaction hash (tap to copy),
// and for Arc what the Arc network itself says about it (confirmed, block, fee, SocialPay events),
// with a link to Arc Explorer. Only shown once the transaction hash is known.

import { Copy } from 'lucide-react'
import { ExplorerLinks } from './ExplorerLinks'
import { TxVerification } from './TxVerification'
import { copyText } from '../../utils/copy'
import { formatAddress } from '../../utils/format'
import { ARC_CHAIN_ID } from '../../chains'
import { getChain } from '@/onchain-facts'
import { isArcChain, isTxHash } from '../../lib/arcExplorers'

interface Props {
  hash: string | undefined | null
  /** Chain the transaction is on. Defaults to Arc. */
  chainId?: number
  /** What the transaction was, e.g. "Payment", "Swap", "Burn on Base". */
  label?: string
  /** Explorer link to show for a chain that is not Arc (the Arc explorers are used on Arc). */
  explorerUrl?: string
  className?: string
}

export function TxReceipt({ hash, chainId = ARC_CHAIN_ID, label = 'Transaction', explorerUrl, className }: Props) {
  if (!isTxHash(hash)) return null
  const arc = isArcChain(chainId)
  const network = arc ? 'Arc Mainnet' : getChain(chainId)?.name ?? `Chain ${chainId}`

  return (
    <div className={`rounded-xl p-3 text-left space-y-2 ${className ?? ''}`} style={{ background: 'var(--surface-muted)' }}>
      <div className="flex items-center justify-between gap-3 min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>{label}</span>
        <span className="text-xs" style={{ color: 'var(--muted)' }}>{network}</span>
      </div>
      <button
        type="button"
        onClick={() => { void copyText(hash, 'Transaction hash copied') }}
        aria-label="Copy transaction hash"
        className="inline-flex items-center gap-1.5 max-w-full rounded-md -mx-1 px-1 py-0.5 font-mono text-[13px] transition-colors hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        style={{ color: 'var(--ink)' }}
      >
        <span className="truncate">{formatAddress(hash)}</span>
        <Copy size={12} className="flex-shrink-0" style={{ color: 'var(--subtle)' }} />
      </button>
      {arc && <TxVerification hash={hash} />}
      {arc ? (
        <ExplorerLinks hash={hash} chainId={chainId} variant="text" />
      ) : explorerUrl ? (
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-medium hover:underline" style={{ color: 'var(--accent)' }}>
          View on {network} explorer
        </a>
      ) : (
        <ExplorerLinks hash={hash} chainId={chainId} variant="text" />
      )}
    </div>
  )
}
