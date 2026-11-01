'use client'

import { useState, type ReactNode } from 'react'

/** Same-origin URL that serves a remote logo, so it loads even when the logo host is blocked. */
export const proxiedLogo = (url: string) => (url.startsWith('/') ? url : `/api/logo?u=${encodeURIComponent(url)}`)

interface LogoImgProps {
  src?: string
  /** Second logo tried when the first fails. */
  alt?: string
  size: number
  /** Shown when there is no image or every source failed. */
  fallback: ReactNode
}

/**
 * Round logo that tries the app's own copy first, then the original host, then
 * shows the fallback. The image fades in once loaded and a soft placeholder
 * holds its place, so lists do not jump or flash while scrolling.
 */
export function LogoImg({ src, alt, size, fallback }: LogoImgProps) {
  // Which source we are on: 0 = this app's copy, 1 = original host, 2 = second logo via this app, 3 = second logo direct, 4 = give up.
  const [st, setSt] = useState({ src, attempt: 0, loaded: false })
  // A new logo starts over from the first source.
  const cur = st.src === src ? st : { src, attempt: 0, loaded: false }
  const { attempt, loaded } = cur

  const chain = [proxiedLogo(src ?? ''), src, alt ? proxiedLogo(alt) : undefined, alt]
  // Skip steps that have no source (no second logo, or a local file whose copy is itself).
  let step = attempt
  while (step < chain.length && (!chain[step] || (step > 0 && chain[step] === chain[step - 1]))) step++
  if (!src || step >= chain.length) return <>{fallback}</>
  const url = chain[step] as string
  return (
    <span
      className="relative inline-block flex-shrink-0 rounded-full overflow-hidden"
      style={{ width: size, height: size, background: 'var(--surface-muted)' }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={url}
        src={url}
        alt=""
        width={size}
        height={size}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setSt({ ...cur, loaded: true })}
        onError={() => setSt({ src, attempt: step + 1, loaded: false })}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-200"
        style={{ opacity: loaded ? 1 : 0 }}
      />
    </span>
  )
}
