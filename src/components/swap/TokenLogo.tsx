'use client'

import { findToken, useArcTokens } from '../../lib/arcTokens'
import { TONES, type Tone } from '../dashboard/ui'
import { LogoImg } from '../ui/LogoImg'

const FALLBACK_TONES: Tone[] = ['blue', 'violet', 'amber', 'green', 'rose', 'teal', 'indigo', 'pink']

function toneFor(symbol: string): Tone {
  let h = 0
  for (let i = 0; i < symbol.length; i++) h = (h * 31 + symbol.charCodeAt(i)) >>> 0
  return FALLBACK_TONES[h % FALLBACK_TONES.length]
}

interface TokenLogoProps {
  symbol: string
  /** Token logo; when omitted the token is looked up by contract address, then symbol. */
  logoURI?: string
  address?: string
  size?: number
}

/** Round token logo. Falls back to a coloured initial when the image is missing or fails to load. */
export function TokenLogo({ symbol, logoURI, address, size = 30 }: TokenLogoProps) {
  const { tokens } = useArcTokens()
  const known = address ? findToken(tokens, address) : tokens.find((t) => t.symbol === symbol)
  const src = logoURI ?? known?.logoURI
  const [from, to] = TONES[toneFor(symbol)]
  return (
    <LogoImg
      src={src}
      size={size}
      fallback={
        <span
          aria-hidden
          className="inline-flex items-center justify-center rounded-full font-bold text-white flex-shrink-0"
          style={{
            width: size, height: size, fontSize: Math.round(size * 0.42),
            background: `linear-gradient(135deg, ${from}, ${to})`,
            boxShadow: `0 6px 14px -6px ${to}, inset 0 1px 0 rgba(255,255,255,0.4)`,
          }}
        >
          {symbol.charAt(0).toUpperCase()}
        </span>
      }
    />
  )
}
