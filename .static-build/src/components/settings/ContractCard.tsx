'use client'

import { useState } from 'react'
import { Check, Copy, FileCode2 } from 'lucide-react'
import { useReadContracts } from 'wagmi'
import { ARC_CHAIN_ID } from '../../chains'
import { SOCIAL_PAY_ABI, isSocialPayConfigured, socialPayDisplayAddress } from '../../contracts/arcSocialPay'
import { GradientIcon } from '../dashboard/ui'
import { copyText } from '../../utils/copy'
import { formatAddress } from '../../utils/format'
import { useArcAccount } from '../../hooks/useArcWallet'
import { AddressExplorerLinks } from '../ui/ExplorerLinks'

/** Highlighted card with this project's own contract: address, live status, copy and explorer. */
export function ContractCard() {
  const { address: me } = useArcAccount()
  const contract = socialPayDisplayAddress() as `0x${string}`
  const routing = isSocialPayConfigured()
  const [copied, setCopied] = useState(false)

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: contract, abi: SOCIAL_PAY_ABI, functionName: 'paused', chainId: ARC_CHAIN_ID },
      { address: contract, abi: SOCIAL_PAY_ABI, functionName: 'owner', chainId: ARC_CHAIN_ID },
    ],
    query: { staleTime: 30_000 },
  })
  const paused = data?.[0]?.status === 'success' ? (data[0].result as boolean) : undefined
  const owner = data?.[1]?.status === 'success' ? (data[1].result as string) : undefined
  const isOwner = !!me && !!owner && me.toLowerCase() === owner.toLowerCase()

  const status =
    isLoading ? { text: 'Checking...', color: 'var(--muted)', bg: 'var(--surface-muted)' }
    : paused === undefined ? { text: 'Status unavailable', color: 'var(--muted)', bg: 'var(--surface-muted)' }
    : paused ? { text: 'Paused', color: 'var(--danger)', bg: 'var(--danger-bg)' }
    : { text: 'Live on Arc', color: 'var(--success)', bg: 'var(--success-bg)' }

  function copy() {
    void copyText(contract, 'Contract address copied').then((ok) => {
      if (ok) { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    })
  }

  return (
    <section
      aria-label="SocialPay contract"
      className="relative rounded-3xl p-[1.5px]"
      style={{
        background: 'linear-gradient(135deg, #5fbeff, #6d28d9 55%, #c026d3)',
        boxShadow: '0 22px 44px -26px rgba(79,70,229,0.75)',
      }}
    >
      <div className="rounded-[calc(1.5rem-1.5px)] p-4 space-y-3" style={{ background: 'var(--surface-strong)' }}>
        <div className="flex items-center gap-3">
          <GradientIcon icon={FileCode2} tone="violet" size={40} />
          <div className="min-w-0 flex-1">
            <h3 className="display font-bold text-base leading-tight" style={{ color: 'var(--ink)' }}>SocialPay contract</h3>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>Arc Mainnet · tips and payments with memos</p>
          </div>
          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold flex-shrink-0" style={{ background: status.bg, color: status.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: status.color }} aria-hidden />
            {status.text}
          </span>
        </div>

        <button
          type="button"
          onClick={copy}
          aria-label="Copy contract address"
          className="w-full text-left rounded-2xl p-3 transition-colors hover:brightness-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          style={{ background: 'color-mix(in srgb, #6d28d9 7%, var(--surface-muted))', border: '1px solid color-mix(in srgb, #6d28d9 22%, var(--border))' }}
        >
          <span className="block text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>Contract address</span>
          <span className="flex items-start gap-2">
            <span className="mono text-[13px] font-semibold break-all flex-1" style={{ color: 'var(--ink)' }}>{contract}</span>
            <span className="flex-shrink-0 mt-0.5" style={{ color: copied ? 'var(--success)' : 'var(--accent)' }}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
            </span>
          </span>
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <AddressExplorerLinks address={contract} variant="text" />
          {isOwner && (
            <span className="inline-flex items-center h-9 px-3 rounded-full font-semibold" style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
              You are the owner
            </span>
          )}
          {!isOwner && owner && (
            <span className="inline-flex items-center h-9 px-3 rounded-full" style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              Owner {formatAddress(owner)}
            </span>
          )}
        </div>

        <p className="text-[11px]" style={{ color: routing ? 'var(--success)' : 'var(--subtle)' }}>
          {routing
            ? 'Payments and tips in the app go through this contract.'
            : 'Deployed and ready, but not used for payments right now.'}
        </p>
      </div>
    </section>
  )
}
