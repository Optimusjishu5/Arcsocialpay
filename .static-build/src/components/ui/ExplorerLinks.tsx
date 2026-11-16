'use client'

// "View on Arc Explorer" for a transaction or an address.
//
// A transaction link is only drawn for a well-formed hash. For a transaction the app has not seen
// in a block yet (just sent, or saved on this device only) the Arc node is asked first, and the
// links appear once the node has it. Transactions on other chains (a bridge's first leg) get the
// one explorer of that chain.

import { ExternalLink } from 'lucide-react'
import { useVerifiedTx } from '../../hooks/useVerifiedTx'
import { addressLinks, isArcChain, isTxHash, txLinks, type ExplorerLink } from '../../lib/arcExplorers'
import { txUrl as chainTxUrl } from '../../utils/txPresentation'

type Variant = 'icon' | 'text'

interface BaseProps {
  variant?: Variant
  className?: string
}

function LinkView({ links, variant = 'text', className }: BaseProps & { links: ExplorerLink[] }) {
  if (links.length === 0) return null
  if (variant === 'icon') {
    return (
      <span className={`inline-flex items-center ${className ?? ''}`}>
        {links.map((l) => (
          <a
            key={l.id}
            href={l.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View on ${l.label}`}
            title={`View on ${l.label}`}
            className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors hover:bg-[var(--surface-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            style={{ color: 'var(--muted)' }}
          >
            <ExternalLink size={15} />
          </a>
        ))}
      </span>
    )
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-3 gap-y-1 ${className ?? ''}`}>
      {links.map((l) => (
        <a
          key={l.id}
          href={l.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium hover:underline"
          style={{ color: 'var(--accent)' }}
        >
          View on {l.label} <ExternalLink size={11} />
        </a>
      ))}
    </span>
  )
}

/** Links for a transaction the node has to confirm first. */
function VerifiedLinks(props: BaseProps & { hash: string }) {
  const v = useVerifiedTx(props.hash)
  return <LinkView {...props} links={v.state === 'verified' ? txLinks(v.tx.hash) : []} />
}

export function ExplorerLinks({ hash, chainId, trusted = false, ...rest }: BaseProps & {
  hash: string | undefined | null
  /** Chain the transaction is on. Anything but Arc gets that chain's own explorer. */
  chainId?: number
  /** The hash came from a block (an explorer or node read), so it needs no further check. */
  trusted?: boolean
}) {
  if (!isTxHash(hash)) return null
  if (!isArcChain(chainId)) {
    let url: string | undefined
    try { url = chainTxUrl({ chainId: chainId as number, txHash: hash }) } catch { url = undefined }
    return url ? <LinkView {...rest} links={[{ id: 'arc', name: 'Explorer', label: 'Explorer', url }]} /> : null
  }
  if (trusted) return <LinkView {...rest} links={txLinks(hash)} />
  return <VerifiedLinks {...rest} hash={hash} />
}

/** Both explorers for a wallet or contract address. */
export function AddressExplorerLinks({ address, ...rest }: BaseProps & { address: string | undefined | null }) {
  return <LinkView {...rest} links={addressLinks(address)} />
}
