'use client'

import { motion, useReducedMotion } from 'framer-motion'

const SIZE = 248
const TILE = 120

/** Coins that circle the logo, evenly spaced around the orbit (Circle tokens on Arc). */
const COINS = [
  { symbol: 'USDC', src: '/tokens/usdc.png' },
  { symbol: 'EURC', src: '/tokens/eurc.png' },
  { symbol: 'cirBTC', src: '/tokens/cirbtc.png' },
] as const

/**
 * Animated SocialPay mark for the signed-out dashboard: the logo floats inside a
 * slowly turning aurora, with USDC, EURC and cirBTC coins orbiting it. Motion is switched off
 * for people who ask their device to reduce it.
 */
export function LandingHero() {
  const calm = useReducedMotion()
  const spin = (from = 0, reverse = false) =>
    calm ? undefined : { rotate: reverse ? [from, from - 360] : [from, from + 360] }
  const loop = (seconds: number) => ({ duration: seconds, repeat: Infinity, ease: 'linear' as const })

  return (
    <div className="relative mx-auto" style={{ width: SIZE, height: SIZE }} aria-hidden>
      {/* Aurora glow behind the logo */}
      <motion.div
        className="absolute rounded-full"
        style={{
          inset: 34,
          background: 'conic-gradient(from 0deg, #22d3ee, #3b82f6, #7c3aed, #d946ef, #22d3ee)',
          filter: 'blur(34px)',
          opacity: 0.55,
        }}
        animate={spin()}
        transition={loop(10)}
      />

      {/* Soft pulse rings */}
      {!calm && [0, 1].map((i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ inset: 64, border: '1.5px solid rgba(99,102,241,0.55)' }}
          initial={{ scale: 1, opacity: 0.5 }}
          animate={{ scale: 1.9, opacity: 0 }}
          transition={{ duration: 3.6, repeat: Infinity, ease: 'easeOut', delay: i * 1.8 }}
        />
      ))}

      {/* Orbit track */}
      <span className="absolute rounded-full" style={{ inset: 14, border: '1px dashed rgba(99,102,241,0.28)' }} />

      {/* Token coins circling the logo */}
      {COINS.map((coin, i) => {
        const offset = (360 / COINS.length) * i
        return (
        <motion.div
          key={coin.symbol}
          className="absolute inset-0"
          style={{ rotate: offset }}
          animate={spin(offset)}
          transition={loop(14)}
        >
          <motion.span
            className="absolute left-1/2 top-[14px] -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full"
            style={{
              rotate: -offset, width: 36, height: 36,
              background: 'var(--surface-strong, #fff)',
              boxShadow: '0 10px 22px -8px rgba(37,99,235,0.6), inset 0 0 0 1px rgba(255,255,255,0.6)',
            }}
            // Counter-rotate so the coin stays upright while it circles.
            animate={spin(-offset, true)}
            transition={loop(14)}
          >
            <img src={coin.src} alt="" width={26} height={26} draggable={false} className="rounded-full select-none" />
          </motion.span>
        </motion.div>
        )
      })}

      {/* The logo */}
      <motion.div
        className="absolute left-1/2 top-1/2 overflow-hidden"
        style={{
          width: TILE, height: TILE, marginLeft: -TILE / 2, marginTop: -TILE / 2, borderRadius: 34,
          background: '#fff',
          boxShadow: '0 28px 50px -18px rgba(79,70,229,0.65), 0 0 0 1px rgba(255,255,255,0.7), inset 0 1px 0 rgba(255,255,255,0.9)',
        }}
        initial={calm ? false : { scale: 0.6, opacity: 0, rotate: -8 }}
        animate={calm ? undefined : { scale: 1, opacity: 1, rotate: 0, y: [0, -9, 0] }}
        transition={calm ? undefined : {
          scale: { type: 'spring', damping: 14, stiffness: 140 },
          opacity: { duration: 0.4 },
          rotate: { type: 'spring', damping: 14, stiffness: 140 },
          y: { duration: 4.2, repeat: Infinity, ease: 'easeInOut', delay: 0.6 },
        }}
      >
        <img src="/logo.png" alt="" width={TILE} height={TILE} draggable={false}
          className="block w-full h-full object-cover select-none" />
        {/* Light sweep across the tile */}
        {!calm && (
          <motion.span
            className="absolute inset-y-0 w-1/2"
            style={{ background: 'linear-gradient(105deg, transparent, rgba(255,255,255,0.75), transparent)' }}
            initial={{ left: '-60%' }}
            animate={{ left: '130%' }}
            transition={{ duration: 1.3, repeat: Infinity, repeatDelay: 3.4, ease: 'easeInOut' }}
          />
        )}
      </motion.div>
    </div>
  )
}
