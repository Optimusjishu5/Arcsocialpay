'use client'

import { ConnectKitButton } from 'connectkit'
import { Power } from 'lucide-react'
import { toast } from 'sonner'
import { useDisconnect } from 'wagmi'
import { Avatar } from './Avatar'
import { formatAddress } from '../../utils/format'

/** Disconnects the wallet in one tap, with a toast so it is clear it worked. */
export function useQuickDisconnect() {
  const { disconnect } = useDisconnect()
  return () => {
    disconnect()
    toast.success('Wallet disconnected', { duration: 1800 })
  }
}

/** Disconnect button on its own: a round power icon. */
export function DisconnectButton({ size = 36 }: { size?: number }) {
  const quickDisconnect = useQuickDisconnect()
  return (
    <button
      type="button"
      onClick={quickDisconnect}
      aria-label="Disconnect wallet"
      title="Disconnect wallet"
      className="flex-shrink-0 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--danger-bg)] hover:text-[var(--danger)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      style={{ width: size, height: size, color: 'var(--muted)' }}
    >
      <Power size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </button>
  )
}

/**
 * Connected wallet: avatar and short address (tap for the wallet menu) with a power button
 * beside it that disconnects straight away.
 */
export function WalletPill({ address }: { address: string }) {
  return (
    <div
      className="inline-flex items-center gap-1 pl-1.5 pr-1 h-11 rounded-2xl"
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
    >
      <ConnectKitButton.Custom>
        {({ show }) => (
          <button
            type="button"
            onClick={show}
            aria-label="Open wallet menu"
            className="flex items-center gap-2.5 h-9 pl-0.5 pr-2 rounded-xl transition-colors hover:bg-[var(--surface-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <Avatar address={address} size={32} />
            <span className="mono text-sm font-semibold" style={{ color: 'var(--ink)' }}>{formatAddress(address)}</span>
          </button>
        )}
      </ConnectKitButton.Custom>
      <DisconnectButton />
    </div>
  )
}
