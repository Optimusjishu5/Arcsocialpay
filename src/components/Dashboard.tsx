import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownLeft, ArrowLeftRight, Compass,
  Heart, MessageCircle, Send, Waypoints,
} from 'lucide-react'
import { useArcAccount, useUsdcBalance } from '../hooks/useArcWallet'
import { appStore, useAppStore, filterConversationsForAddress, isSameAddress } from '../store/appStore'
import { useTxReconciliationOnLoad, useUsdcTransferWatcher, useBackfillMissingTxRecords } from '../hooks/useTxHistory'
import { Avatar } from './ui/Avatar'
import { BalanceCard } from './dashboard/BalanceCard'
import { LandingHero } from './dashboard/LandingHero'
import { RecentActivity } from './dashboard/RecentActivity'
import { Typewriter } from './dashboard/Typewriter'
import { ActionTile, EmptyRow, Section } from './dashboard/ui'
import { formatAddress, formatTimestamp } from '../utils/format'
import { copyText } from '../utils/copy'
import type { NavView } from '../types/index'
import { useWalletActivity } from '../hooks/useWalletActivity'

interface Props {
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

export function Dashboard({ onNavigate }: Props) {
  const { address, isConnected, isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { display, isLoading: balanceLoading, known: balanceKnown, stale: balanceStale, refetch } = useUsdcBalance(address)
  const { conversations, posts } = useAppStore()
  // Same list as the Pay and Activity screens: every transaction plus social activity.
  const { entries } = useWalletActivity(address)
  const [copied, setCopied] = useState(false)

  // Reconcile pending history on load and refresh the balance on every USDC transfer.
  useTxReconciliationOnLoad()
  useBackfillMissingTxRecords()
  useUsdcTransferWatcher(address, () => { void refetch() })

  const recentConvs = filterConversationsForAddress(conversations, address).slice(0, 3)
  // Newest first, whatever order the list was merged in (own posts, other devices, the server).
  const recentPosts = [...posts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 3)

  function copyAddress() {
    if (!address) return
    void copyText(address, 'Address copied').then((ok) => {
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  if (!isConnected) return <Landing />

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
  }
  const item = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { type: 'spring' as const, damping: 24, stiffness: 280 } } }

  return (
    <div className="relative">
      <Ambient />
      <motion.div variants={container} initial="hidden" animate="show"
        className="relative z-10 flex flex-col gap-5 px-4 pt-4 pb-10 max-w-2xl mx-auto">
        <BalanceCard
          address={address!}
          display={display}
          loading={balanceLoading}
          unavailable={!balanceKnown && !balanceLoading}
          stale={balanceStale}
          copied={copied}
          isArcChain={isArcChain}
          isSwitching={isSwitching}
          onCopy={copyAddress}
          onRefresh={() => { void refetch() }}
          onSwitch={switchToArc}
        />

        <motion.div variants={item} className="grid grid-cols-4 gap-3">
          <ActionTile icon={Send} tone="blue" label="Send" onClick={() => onNavigate('pay', { mode: 'send' })} />
          <ActionTile icon={ArrowDownLeft} tone="green" label="Receive" onClick={() => onNavigate('pay', { mode: 'receive' })} />
          <ActionTile icon={ArrowLeftRight} tone="violet" label="Swap" onClick={() => onNavigate('swap')} />
          <ActionTile icon={Waypoints} tone="amber" label="Bridge" onClick={() => onNavigate('bridge')} />
        </motion.div>

        <motion.div variants={item}>
          <RecentActivity
            entries={entries}
            onViewAll={() => onNavigate('activity')}
            onSend={() => onNavigate('pay', { mode: 'send' })}
          />
        </motion.div>

        <motion.div variants={item}>
          <Section title="Messages" icon={MessageCircle} tone="violet"
            action={<LinkButton onClick={() => onNavigate('messages')}>View all</LinkButton>}>
            {recentConvs.length === 0 ? (
              <EmptyRow icon={MessageCircle} text="No conversations yet" cta="Start a chat" onCta={() => onNavigate('messages')} />
            ) : (
              recentConvs.map((conv) => {
                const other = conv.participants.find((p) => !isSameAddress(p, address)) ?? conv.participants[0]
                return (
                  <button key={conv.id} onClick={() => onNavigate('messages', { convId: conv.id })}
                    className="flex items-center gap-3 w-full p-3 rounded-2xl text-left transition-colors hover:bg-[var(--surface-muted)]">
                    <Avatar address={other} size={40} />
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{formatAddress(other)}</div>
                      {conv.lastMessage && <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>{conv.lastMessage.content}</div>}
                    </div>
                    {conv.unreadCount > 0 && (
                      <span className="min-w-[22px] h-[22px] rounded-full text-xs font-bold flex items-center justify-center px-1.5 text-white"
                        style={{ background: 'linear-gradient(135deg,#af8ff4,#6d28d9)' }}>
                        {conv.unreadCount}
                      </span>
                    )}
                  </button>
                )
              })
            )}
          </Section>
        </motion.div>

        <motion.div variants={item}>
          <Section title="Social feed" icon={Compass} tone="amber"
            action={<LinkButton onClick={() => onNavigate('explore')}>Explore</LinkButton>}>
            {recentPosts.length === 0 ? (
              <EmptyRow icon={Compass} text="No posts yet" cta="Write the first post" onCta={() => onNavigate('explore')} />
            ) : (
              recentPosts.map((post) => (
                <button key={post.id} onClick={() => onNavigate('explore')}
                  className="flex items-start gap-3 w-full p-3 rounded-2xl text-left transition-colors hover:bg-[var(--surface-muted)]">
                  <Avatar address={post.authorAddress} size={36} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium mb-0.5" style={{ color: 'var(--muted)' }}>
                      {isSameAddress(post.authorAddress, address) ? 'You' : (appStore.getProfile(post.authorAddress)?.username || formatAddress(post.authorAddress))} · {formatTimestamp(post.createdAt)}
                    </div>
                    <p className="text-sm line-clamp-2 break-words" style={{ color: 'var(--ink-2)' }}>{post.content}</p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] tabnum" style={{ color: 'var(--subtle)' }}>
                      <span className="inline-flex items-center gap-1"><Heart size={11} /> {post.likes.length}</span>
                      <span className="inline-flex items-center gap-1"><MessageCircle size={11} /> {post.commentCount}</span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </Section>
        </motion.div>
      </motion.div>
    </div>
  )
}

/** Soft colored light behind the content. Decorative only. */
function Ambient() {
  return (
    <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden">
      <div style={{ position: 'absolute', top: '-6%', left: '-8%', width: 380, height: 380, borderRadius: '50%', background: 'radial-gradient(circle, rgba(59,130,246,0.30) 0%, transparent 70%)', filter: 'blur(70px)' }} />
      <div style={{ position: 'absolute', top: '34%', right: '-10%', width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.24) 0%, transparent 70%)', filter: 'blur(70px)' }} />
      <div style={{ position: 'absolute', bottom: '-8%', left: '18%', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(251,146,60,0.18) 0%, transparent 70%)', filter: 'blur(70px)' }} />
    </div>
  )
}

function Landing() {
  return (
    <div className="relative min-h-[calc(100dvh-60px)] flex flex-col items-center justify-center px-6 gap-8 overflow-hidden">
      <Ambient />
      <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 260 }} className="relative z-10 text-center">
        <LandingHero />
        <h1 className="display font-bold text-4xl mt-2 mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.035em' }}>SocialPay</h1>
        <Typewriter
          text="Pay, Swap, Bridge, Message & Explore with USDC on Arc. Tap Connect at the top right to get started."
          className="w-full max-w-sm mx-auto px-2 text-[15px] leading-6 sm:text-base min-h-[6rem] sm:min-h-[4.5rem]"
          style={{ color: 'var(--muted)' }}
        />
      </motion.div>
    </div>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-xs font-semibold px-3 h-8 rounded-full transition-colors hover:bg-[var(--surface-muted)]" style={{ color: 'var(--accent)' }}>
      {children}
    </button>
  )
}
