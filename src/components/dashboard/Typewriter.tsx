'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from 'framer-motion'

interface Props {
  text: string
  /** Milliseconds per character. */
  speed?: number
  /** Wait before typing starts. */
  delay?: number
  className?: string
  style?: React.CSSProperties
}

/**
 * Types the text out one character at a time with a blinking caret. The full text is
 * always laid out (the untyped part is hidden) so the page and its line breaks do not jump, and screen readers
 * get the whole sentence at once. With reduced motion on, the text just appears.
 */
export function Typewriter({ text, speed = 38, delay = 500, className, style }: Props) {
  const calm = useReducedMotion()
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (calm) return
    let timer: ReturnType<typeof setInterval> | undefined
    const start = setTimeout(() => {
      timer = setInterval(() => {
        setCount((c) => {
          if (c >= text.length) { if (timer) clearInterval(timer); return c }
          return c + 1
        })
      }, speed)
    }, delay)
    return () => { clearTimeout(start); if (timer) clearInterval(timer) }
  }, [text, speed, delay, calm])

  const shown = calm ? text.length : count
  const done = shown >= text.length

  return (
    <p className={`text-center [text-wrap:pretty] ${className ?? ''}`} style={style} aria-label={text}>
      {/* One layer: the typed part is visible and the rest is laid out but hidden, so lines wrap and centre exactly as they will when finished. */}
      <span aria-hidden>
        {text.slice(0, shown)}
        <span className={done ? 'animate-pulse' : ''} style={{ display: 'inline-block', width: 0, height: '1em', position: 'relative', verticalAlign: '-0.12em', opacity: calm ? 0 : 1 }}>
          <span style={{ position: 'absolute', left: 1, top: 0, width: 2, height: '100%', borderRadius: 1, background: 'var(--accent, #4f6bff)' }} />
        </span>
        <span className="invisible">{text.slice(shown)}</span>
      </span>
    </p>
  )
}
