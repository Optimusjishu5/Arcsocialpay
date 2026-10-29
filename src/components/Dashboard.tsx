import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Activity, Compass, ExternalLink, HandCoins, Layers,
  MessageCircle, Send, Sparkles, Users, CalendarClock, Wallet, Waypoints,
} from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { useArcAccount, useUsdcBalance, ARC_CHAIN_ID } from '../hooks/useArcWallet'
import { useAppStore, filterTxHistoryForAddress, filterConversationsForAddress, isSameAddress } from '../store/appStore'
import { useTxReconciliationOnLoad, useUsdcTransferWatcher, useBackfillMissingTxRecords } from '../hooks/useTxHistory'
import { Avatar } from './ui/Avatar'
import { TxStatusBadge } from './ui/TxStatusBadge'
import { BalanceCard } from './dashboard/BalanceCard'
import { ActionTile, EmptyRow, GradientIcon, Section, StatCard, glassCard, type Tone } from './dashboard/ui'
import { formatAddress, formatTimestamp, formatUsdcDisplay } from '../utils/format'
import { parseUsdc } from '@/onchain-money'
import { copyText } from '../utils/copy'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { NavView, TxRecord } from '../types/index'
import { describeTx, txUrl } from '../utils/txPresentation'

interface Props {
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

/** Sum of confirmed payments from the local history, in exact 6-decimal units. */
function totalRaw(txs: TxRecord[]): bigint {
  let sum = 0n
  for (const t of txs) {
    try { sum += parseUsdc(t.amount) } catch { /* skip malformed legacy rows */ }
  }
  return sum
}

export function Dashboard({ onNavigate }: Props) {
  const { address, isConnected, isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { display, isLoading: balanceLoading, refetch } = useUsdcBalance(address)
  const { txHistory, conversations, posts } = useAppStore()
  const [copied, setCopied] = useState(false)

  // Reconcile pending history on load and refresh the balance on every USDC transfer.
  useTxReconciliationOnLoad()
  useBackfillMissingTxRecords()
  useUsdcTransferWatcher(address, () => { void refetch() })

  const allTxs = filterTxHistoryForAddress(txHistory, address)
  const myTxs = allTxs.slice(0, 5)
  // Totals count USDC payments only; swaps and bridges are not money sent to or received from someone.
  const confirmed = allTxs.filter((t) => t.status === 'confirmed' && (!t.kind || t.kind === 'payment') && (!t.symbol || t.symbol === 'USDC'))
  const sentTotal = totalRaw(confirmed.filter((t) => isSameAddress(t.fromAddress, address)))
  const receivedTotal = totalRaw(confirmed.filter((t) => !isSameAddress(t.fromAddress, address)))
  const recentConvs = filterConversationsForAddress(conversations, address).slice(0, 3)
  const unread = filterConversationsForAddress(conversations, address).reduce((n, c) => n + (c.unreadCount ?? 0), 0)
  const recentPosts = posts.slice(0, 3)

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

        <motion.div variants={item} className="grid grid-cols-4 gap-2">
          {([
            { icon: HandCoins, tone: 'rose', label: 'Request', mode: 'request' },
            { icon: Users, tone: 'teal', label: 'Split', mode: 'split' },
            { icon: Layers, tone: 'indigo', label: 'Batch', mode: 'batch' },
            { icon: CalendarClock, tone: 'pink', label: 'Schedule', mode: 'schedule' },
          ] as const).map(({ icon: Icon, tone, label, mode }) => (
            <button key={label} onClick={() => onNavigate('pay', { mode })}
              className="flex items-center gap-2 h-11 px-2.5 rounded-xl text-xs font-semibold transition-transform active:scale-95 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              style={{ ...glassCard, color: 'var(--ink)' }}>
              <GradientIcon icon={Icon} tone={tone} size={26} />
              <span className="truncate">{label}</span>
            </button>
          ))}
        </motion.div>

        <motion.div variants={item} className="grid grid-cols-3 gap-3">
          <StatCard icon={ArrowDownLeft} tone="green" label="Received" value={formatUsdcDisplay(receivedTotal)} unit="USDC" />
          <StatCard icon={ArrowUpRight} tone="rose" label="Sent" value={formatUsdcDisplay(sentTotal)} unit="USDC" />
          <StatCard icon={MessageCircle} tone="violet" label="Unread" value={String(unread)} />
        </motion.div>

        <motion.div variants={item}>
          <Section title="Recent activity" icon={Activity} tone="blue"
            action={myTxs.length > 0 ? <LinkButton onClick={() => onNavigate('activity')}>View all</LinkButton> : undefined}>
            {myTxs.length === 0 ? (
              <EmptyRow icon={Wallet} text="No payments yet" cta="Send your first payment" onCta={() => onNavigate('pay', { mode: 'send' })} />
            ) : (
              myTxs.map((tx) => <TxRow key={tx.id} tx={tx} myAddress={address!} />)
            )}
          </Section>
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
                      {formatAddress(post.authorAddress)} · {formatTimestamp(post.createdAt)}
                    </div>
                    <p className="text-sm line-clamp-2" style={{ color: 'var(--ink-2)' }}>{post.content}</p>
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
        <div className="w-24 h-24 mx-auto rounded-[30px] flex items-center justify-center mb-6"
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #7c3aed 100%)',
            boxShadow: '0 24px 50px -16px rgba(79,70,229,0.7), inset 0 1px 0 rgba(255,255,255,0.4)',
          }}>
          <TokenUSDC variant="branded" size={52} />
        </div>
        <h1 className="display font-bold text-4xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.035em' }}>SocialPay</h1>
        <p className="text-base mb-8 max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
          Chat, post and pay with USDC on Arc. Connect a wallet to get started.
        </p>
        <ConnectKitButton label="Connect wallet" />
      </motion.div>

      <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full max-w-md">
        {([
          { icon: MessageCircle, tone: 'violet', label: 'Chat + pay' },
          { icon: Compass, tone: 'amber', label: 'Social feed' },
          { icon: ArrowLeftRight, tone: 'blue', label: 'Swap + bridge' },
          { icon: Sparkles, tone: 'green', label: 'Gas in USDC' },
        ] as { icon: typeof Send; tone: Tone; label: string }[]).map(({ icon, tone, label }) => (
          <div key={label} className="flex flex-col items-center gap-2 p-4 rounded-2xl" style={glassCard}>
            <GradientIcon icon={icon} tone={tone} />
            <span className="text-xs font-semibold text-center" style={{ color: 'var(--ink-2)' }}>{label}</span>
          </div>
        ))}
      </div>
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

function TxRow({ tx, myAddress }: { tx: TxRecord; myAddress: string }) {
  const v = describeTx(tx, myAddress)
  const explorerUrl = txUrl(tx)

  return (
    <div className="flex items-center gap-3 p-3 rounded-2xl transition-colors hover:bg-[var(--surface-muted)]">
      <GradientIcon icon={v.icon} tone={v.tone} size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{v.title}</span>
          <TxStatusBadge status={tx.status} />
        </div>
        <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
          {v.detail} · {formatTimestamp(tx.timestamp)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {v.amountText && (
          <span className="tabnum font-bold text-sm" style={{ color: v.sign === '-' ? 'var(--danger)' : 'var(--success)' }}>
            {v.sign}{v.amountText}
          </span>
        )}
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer" aria-label="View on explorer"
          className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-strong)]"
          style={{ color: 'var(--muted)' }}>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
