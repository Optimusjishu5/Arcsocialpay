import type { ReactNode } from 'react'
import { useAppStore } from '../../store/appStore'
import { formatAddress } from '../../utils/format'

/** Fired to open someone's profile; App listens and shows it. */
export const OPEN_PROFILE_EVENT = 'socialpay:open-profile'

export function openProfile(address: string): void {
  window.dispatchEvent(new CustomEvent(OPEN_PROFILE_EVENT, { detail: { address } }))
}

/** Their username when they have one, otherwise the short address. */
export function AuthorName({ address }: { address: string }) {
  const { profiles } = useAppStore()
  const p = profiles[address.toLowerCase()] ?? profiles[address]
  const name = p?.username && !p.username.includes('...') ? p.username : ''
  return <>{name || formatAddress(address)}</>
}

/** Makes a picture or a name open that wallet's profile. */
export function ProfileLink({ address, children, className = '', label }: { address: string; children: ReactNode; className?: string; label?: string }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); openProfile(address) }}
      aria-label={label ?? `Open profile of ${formatAddress(address)}`}
      className={`text-left transition-opacity active:opacity-70 hover:opacity-90 ${className}`}
    >
      {children}
    </button>
  )
}
