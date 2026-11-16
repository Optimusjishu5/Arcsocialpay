// Remembers each wallet's last known USDC balance in the browser, so the balance shows
// instantly on the next visit while the fresh value is still being fetched.

const KEY = (addr: string) => `socialpay:balance:v1:${addr.toLowerCase()}`

/** Last balance seen for this wallet (6-decimal units), or undefined if none was saved. */
export function readBalance(address: string | undefined): bigint | undefined {
  if (!address || typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(KEY(address))
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as { raw?: unknown }
    return typeof parsed.raw === 'string' && /^\d+$/.test(parsed.raw) ? BigInt(parsed.raw) : undefined
  } catch {
    return undefined
  }
}

export function saveBalance(address: string, raw: bigint): void {
  try {
    window.localStorage.setItem(KEY(address), JSON.stringify({ raw: raw.toString(), at: Date.now() }))
  } catch {
    // storage full or blocked: the balance simply is not remembered
  }
}
