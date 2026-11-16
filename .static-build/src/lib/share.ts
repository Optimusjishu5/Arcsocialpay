// Share-safe link helpers. Inside Arc Studio the app is framed, so
// window.location is a private preview URL nobody else can open. Ask the
// framing Studio for the public base, and fall back to the app's own origin.

const STUDIO_ORIGINS = ['https://studio.arc.io', 'https://studio-staging.arc.io']
const HANDSHAKE_TIMEOUT_MS = 1500

const trimSlash = (url: string) => url.replace(/\/+$/, '')
const ownBase = () => trimSlash(window.location.origin)

let known: string | undefined
let listening = false
const waiters = new Set<(url: string) => void>()

function originOf(url: string): string {
  try {
    return new URL(url).origin
  } catch {
    return ''
  }
}

function parentOrigins(): string[] {
  const ancestor = window.location.ancestorOrigins?.[0] ?? ''
  const hit = [ancestor, originOf(document.referrer)].find((o) => STUDIO_ORIGINS.includes(o))
  return hit ? [hit] : STUDIO_ORIGINS
}

function onMessage(event: MessageEvent) {
  if (!STUDIO_ORIGINS.includes(event.origin) || event.source !== window.parent) return
  const data = event.data as { type?: string; url?: unknown } | null
  if (data?.type !== 'arc-share:url' || typeof data.url !== 'string') return
  if (!data.url.startsWith(`${event.origin}/`)) return
  known = trimSlash(data.url)
  listening = false
  window.removeEventListener('message', onMessage)
  for (const resolve of waiters) resolve(known)
  waiters.clear()
}

export function getShareBase(): Promise<string> {
  if (typeof window === 'undefined') return Promise.resolve('')
  if (window.self === window.top) return Promise.resolve(ownBase())
  if (known) return Promise.resolve(known)
  return new Promise<string>((resolve) => {
    const settle = (url: string) => {
      clearTimeout(timer)
      resolve(url)
    }
    const timer = setTimeout(() => {
      waiters.delete(settle)
      resolve(ownBase())
    }, HANDSHAKE_TIMEOUT_MS)
    waiters.add(settle)
    if (!listening) {
      listening = true
      window.addEventListener('message', onMessage)
    }
    for (const origin of parentOrigins()) {
      window.parent.postMessage({ type: 'arc-share:hello' }, origin)
    }
  })
}

/** Build a public link from an app-relative path such as "/?pay=0x...". */
export async function buildShareLink(path: string): Promise<string> {
  const base = await getShareBase()
  return base + (path.startsWith('/') ? path : `/${path}`)
}
