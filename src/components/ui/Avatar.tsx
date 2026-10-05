import { getAvatarColor, getInitials, formatAddress } from '../../utils/format'
import { appStore } from '../../store/appStore'

interface AvatarProps {
  address: string
  size?: number
  className?: string
  showRing?: boolean
}

export function Avatar({ address, size = 36, className = '', showRing = false }: AvatarProps) {
  const profile = appStore.getProfile(address)
  const name = profile?.username ?? formatAddress(address)
  const seed = profile?.avatarSeed ?? address
  const color = getAvatarColor(seed)
  const initials = getInitials(name, address)
  const fontSize = Math.max(10, Math.round(size * 0.38))

  return (
    <div
      className={`inline-flex items-center justify-center rounded-full select-none flex-shrink-0 font-semibold ${showRing ? 'ring-2 ring-white dark:ring-gray-800' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        background: color,
        color: '#fff',
        fontSize,
        fontFamily: "'Space Grotesk', sans-serif",
      }}
    >
      {initials}
    </div>
  )
}
