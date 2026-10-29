'use client'

import { motion } from 'framer-motion'
import { Check, Copy, RefreshCw, Wifi } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import { Button } from '../ui/Button'
import { NetworkBadge } from '../ui/NetworkBadge'
import { formatAddress } from '../../utils/format'

interface Props {
  address: string
  display: string
  loading: boolean
  copied: boolean
  isArcChain: boolean
  isSwitching: boolean
  onCopy: () => void
  onRefresh: () => void
  onSwitch: () => void
}

/** Debit-card style hero: live USDC balance, wallet address and network. */
export function BalanceCard({ address, display, loading, copied, isArcChain, isSwitching, onCopy, onRefresh, onSwitch }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', damping: 24, stiffness: 260 }}
      className="relative overflow-hidden rounded-[28px] p-6"
      style={{
        background:
          'radial-gradient(120% 130% at 0% 0%, rgba(59,130,246,0.95) 0%, transparent 52%),' +
          'radial-gradient(90% 100% at 100% 100%, rgba(124,58,237,0.85) 0%, transparent 55%),' +
          'radial-gradient(60% 70% at 85% 5%, rgba(244,114,182,0.45) 0%, transparent 60%),' +
          'linear-gradient(135deg, #0b1f3a 0%, #122d45 100%)',
        boxShadow: '0 28px 60px -22px rgba(37,99,235,0.65), inset 0 1px 0 rgba(255,255,255,0.28)',
        color: '#fff',
      }}
    >
      {/* soft sheen + fine grid for a printed-card feel */}
      <div aria-hidden className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.10) 48%, transparent 60%),' +
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 22px)',
        }} />

      <div className="relative flex items-start justify-between">
        <div className="flex items-center gap-3">
          {/* card chip */}
          <span aria-hidden className="block w-10 h-7 rounded-md"
            style={{
              background: 'linear-gradient(135deg, #fde68a 0%, #f59e0b 55%, #fcd34d 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(120,53,15,0.35), inset 0 1px 0 rgba(255,255,255,0.5)',
            }} />
          <Wifi size={18} className="rotate-90 opacity-70" />
        </div>
        <NetworkBadge />
      </div>

      <div className="relative mt-7">
        <p className="text-[11px] font-semibold uppercase mb-1.5" style={{ letterSpacing: '0.12em', color: 'rgba(255,255,255,0.7)' }}>
          Available balance
        </p>
        <div className="flex items-center gap-3">
          {loading ? (
            <div className="h-11 w-44 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.18)' }} />
          ) : (
            <span className="display font-bold tabnum" style={{ fontSize: '2.75rem', lineHeight: 1, letterSpacing: '-0.04em', textShadow: '0 2px 18px rgba(0,0,0,0.25)' }}>
              {display}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 h-8 pl-1.5 pr-2.5 rounded-full text-sm font-semibold"
            style={{ background: 'rgba(255,255,255,0.16)', border: '1px solid rgba(255,255,255,0.22)' }}>
            <TokenUSDC variant="branded" size={20} />
            USDC
          </span>
        </div>
      </div>

      <div className="relative mt-7 flex items-center justify-between gap-3">
        <button onClick={onCopy}
          className="flex items-center gap-2 h-9 px-3 rounded-full text-xs font-medium mono transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.92)' }}
          title="Copy wallet address">
          {formatAddress(address)}
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
        <button onClick={onRefresh}
          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors hover:bg-white/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          style={{ background: 'rgba(255,255,255,0.14)', border: '1px solid rgba(255,255,255,0.2)' }}
          title="Refresh balance" aria-label="Refresh balance">
          <RefreshCw size={14} />
        </button>
      </div>

      {!isArcChain && (
        <div className="relative mt-4 p-3 rounded-2xl flex items-center gap-3"
          style={{ background: 'rgba(225,29,72,0.28)', border: '1px solid rgba(251,113,133,0.5)' }}>
          <span className="text-xs font-medium" style={{ color: '#ffe4e9' }}>You are not on Arc. Switch network to send USDC.</span>
          <Button size="sm" onClick={onSwitch} loading={isSwitching}
            className="ml-auto flex-shrink-0 !bg-white !text-[#be123c] text-xs">
            Switch
          </Button>
        </div>
      )}
    </motion.div>
  )
}
