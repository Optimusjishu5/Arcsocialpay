// ── Formatting utilities ────────────────────────────────────────────────────

export function formatAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr)
}

export function isValidUsdcAmount(value: string): boolean {
  if (!value) return false
  const n = parseFloat(value)
  if (isNaN(n) || n <= 0) return false
  // max 6 decimal places
  const parts = value.split('.')
  if (parts[1] && parts[1].length > 6) return false
  return true
}

export function formatUsdcDisplay(amount: string | bigint): string {
  let num: number
  if (typeof amount === 'bigint') {
    num = Number(amount) / 1_000_000
  } else {
    num = parseFloat(amount)
  }
  if (isNaN(num)) return '0.00'
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(num)
}

export function formatUsdcCurrency(amount: string | bigint): string {
  let num: number
  if (typeof amount === 'bigint') {
    num = Number(amount) / 1_000_000
  } else {
    num = parseFloat(amount)
  }
  if (isNaN(num)) return '$0.00'
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num)
}

export function formatTimestamp(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const secs = Math.floor(diff / 1000)
  const mins = Math.floor(secs / 60)
  const hours = Math.floor(mins / 60)
  const days = Math.floor(hours / 24)

  if (secs < 60) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatFullTimestamp(ts: number): string {
  return new Date(ts).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatChatTime(ts: number): string {
  const now = new Date()
  const date = new Date(ts)
  const isToday = now.toDateString() === date.toDateString()
  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function parseOnchainError(error: unknown): string {
  const e = error as { message?: string; code?: number }
  const message = e?.message?.toLowerCase() ?? ''
  if (e?.code === 4001 || message.includes('user rejected') || message.includes('user denied')) {
    return 'Transaction cancelled.'
  }
  if (message.includes('insufficient funds') || message.includes('exceeds balance')) {
    return 'Insufficient USDC balance. Please add funds and try again.'
  }
  if (message.includes('nonce')) {
    return 'Transaction nonce error. Please try again.'
  }
  if (message.includes('reverted')) {
    const reasonMatch = message.match(/reason="([^"]+)"/)
    return reasonMatch ? `Transaction failed: ${reasonMatch[1]}` : 'Transaction failed. Please try again.'
  }
  if (message.includes('network') || message.includes('timeout') || message.includes('rpc')) {
    return 'Network error. Please check your connection and try again.'
  }
  if (message.includes('gas')) {
    return 'Gas estimation failed. You may not have enough USDC for fees.'
  }
  return 'Something went wrong. Please try again.'
}

export function generateId(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function getAvatarColor(seed: string): string {
  const colors = [
    '#1a5ca8', '#0d7460', '#7c3aed', '#b45309', '#0369a1',
    '#047857', '#9333ea', '#c2410c', '#155e75', '#1e40af',
  ]
  let hash = 0
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  }
  return colors[hash % colors.length]
}

export function getInitials(name: string, address?: string): string {
  if (name && name !== address?.slice(0, 6)) {
    return name.slice(0, 2).toUpperCase()
  }
  return address ? address.slice(2, 4).toUpperCase() : '??'
}
