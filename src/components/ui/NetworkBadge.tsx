import { useArcAccount } from '../../hooks/useArcWallet'

export function NetworkBadge() {
  const { isArcChain, isConnected, chainId } = useArcAccount()

  if (!isConnected) return null

  if (isArcChain) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
        style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
        <span className="w-1.5 h-1.5 rounded-full bg-current" />
        Arc
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full"
      style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      Chain {chainId}
    </span>
  )
}
