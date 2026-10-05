import { useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowUpRight, ArrowDownLeft, History, MessageCircle, TrendingUp, Copy, Check, ExternalLink, RefreshCw } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { TokenUSDC } from '@web3icons/react'
import { useArcAccount, useUsdcBalance, ARC_CHAIN_ID } from '../hooks/useArcWallet'
import { useAppStore, filterTxHistoryForAddress, filterConversationsForAddress, isSameAddress } from '../store/appStore'
import { useTxReconciliationOnLoad, useUsdcTransferWatcher, useBackfillMissingTxRecords } from '../hooks/useTxHistory'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { TxStatusBadge } from './ui/TxStatusBadge'
import { NetworkBadge } from './ui/NetworkBadge'
import { formatAddress, formatTimestamp } from '../utils/format'
import { copyText } from '../utils/copy'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { NavView } from '../types/index'

interface Props {
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

export function Dashboard({ onNavigate }: Props) {
  const { address, isConnected, isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { display, isLoading: balanceLoading, refetch } = useUsdcBalance(address)
  const { txHistory, conversations, posts } = useAppStore()
  const [copied, setCopied] = useState(false)

  // DATA/INDEXING: reconcile pending txHistory on app load (best-effort,
  // non-blocking) + refresh balance immediately on USDC Transfer.
  // Balance polling single source stays `useUsdcBalance` (10s fallback).
  useTxReconciliationOnLoad()
  useBackfillMissingTxRecords()
  useUsdcTransferWatcher(address, () => {
    void refetch()
  })

  // Scope to current address, case-insensitive (EVM addresses).
  const myTxs = filterTxHistoryForAddress(txHistory, address).slice(0, 5)

  const recentConvs = filterConversationsForAddress(conversations, address).slice(0, 3)
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

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-60px)] px-6 gap-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 300 }}
          className="text-center"
        >
          <div className="w-20 h-20 mx-auto rounded-3xl flex items-center justify-center mb-6"
            style={{ background: 'var(--accent)' }}>
            <TokenUSDC variant="branded" size={48} />
          </div>
          <h1 className="display font-bold text-3xl mb-2" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
            Arc SocialPay
          </h1>
          <p className="text-base mb-8 max-w-xs mx-auto" style={{ color: 'var(--muted)' }}>
            Social messaging with native USDC payments on Arc blockchain
          </p>
          <ConnectKitButton label="Connect Wallet" />
        </motion.div>

        <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
          {[
            { icon: <MessageCircle size={20} />, label: 'Chat + Pay' },
            { icon: <TrendingUp size={20} />, label: 'Social Feed' },
            { icon: <TokenUSDC variant="branded" size={20} />, label: 'USDC Native' },
          ].map(({ icon, label }) => (
            <div key={label}
              className="flex flex-col items-center gap-2 p-4 rounded-2xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div style={{ color: 'var(--accent)' }}>{icon}</div>
              <span className="text-xs font-medium text-center" style={{ color: 'var(--ink-2)' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 px-4 pt-4 pb-8 max-w-2xl mx-auto">
      {/* Balance Card */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 24, stiffness: 300 }}
        className="rounded-2xl p-5"
        style={{
          background: 'linear-gradient(135deg, var(--accent) 0%, #1061a6 100%)',
          boxShadow: '0 8px 32px rgba(18,45,69,0.18)',
        }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <p className="text-xs font-medium opacity-70 mb-1 uppercase tracking-wider" style={{ color: '#fff' }}>
              USDC Balance
            </p>
            <div className="flex items-baseline gap-2">
              {balanceLoading ? (
                <div className="h-9 w-32 rounded-lg animate-pulse" style={{ background: 'rgba(255,255,255,0.15)' }} />
              ) : (
                <span className="display font-bold tabnum"
                  style={{ color: '#fff', fontSize: '2.25rem', lineHeight: 1, letterSpacing: '-0.03em' }}>
                  {display}
                </span>
              )}
              <span className="text-base font-semibold" style={{ color: 'rgba(255,255,255,0.75)' }}>USDC</span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <NetworkBadge />
            <button
              onClick={() => { void refetch() }}
              className="p-1.5 rounded-lg transition-colors"
              style={{ color: 'rgba(255,255,255,0.7)', background: 'rgba(255,255,255,0.1)' }}
              title="Refresh balance"
            >
              <RefreshCw size={14} />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-5">
          <button
            onClick={copyAddress}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.85)' }}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {formatAddress(address!)}
          </button>
        </div>

        {!isArcChain && (
          <div className="mb-4 p-3 rounded-xl flex items-center gap-3"
            style={{ background: 'rgba(186,43,76,0.25)', border: '1px solid rgba(186,43,76,0.4)' }}>
            <span className="text-xs font-medium" style={{ color: '#ffc4ce' }}>
              You are not on Arc Testnet. Switch network to send USDC.
            </span>
            <Button size="sm" onClick={switchToArc} loading={isSwitching}
              className="ml-auto flex-shrink-0 !bg-white !text-[var(--danger)] text-xs">
              Switch
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onNavigate('pay', { mode: 'send' })}
            className="flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
          >
            <ArrowUpRight size={18} />
            Send
          </button>
          <button
            onClick={() => onNavigate('pay', { mode: 'receive' })}
            className="flex items-center justify-center gap-2 h-11 rounded-xl font-semibold text-sm transition-all active:scale-[0.97]"
            style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
          >
            <ArrowDownLeft size={18} />
            Receive
          </button>
        </div>
      </motion.div>

      {/* Recent Transactions */}
      <Section
        title="Recent Activity"
        action={myTxs.length > 0 ? (
          <button onClick={() => onNavigate('notifications')} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
            View all
          </button>
        ) : undefined}
      >
        {myTxs.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>No transactions yet</p>
        ) : (
          myTxs.map((tx) => (
            <TxRow key={tx.id} tx={tx} myAddress={address!} />
          ))
        )}
      </Section>

      {/* Recent Conversations */}
      <Section
        title="Messages"
        action={
          <button onClick={() => onNavigate('messages')} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
            View all
          </button>
        }
      >
        {recentConvs.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>No conversations yet</p>
        ) : (
          recentConvs.map((conv) => {
            const other = conv.participants.find((p) => !isSameAddress(p, address)) ?? conv.participants[0]
            return (
              <button
                key={conv.id}
                onClick={() => onNavigate('messages', { convId: conv.id })}
                className="flex items-center gap-3 w-full p-3 rounded-xl transition-colors text-left"
                style={{ background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <Avatar address={other} size={40} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate" style={{ color: 'var(--ink)' }}>
                    {formatAddress(other)}
                  </div>
                  {conv.lastMessage && (
                    <div className="text-xs truncate" style={{ color: 'var(--muted)' }}>
                      {conv.lastMessage.content}
                    </div>
                  )}
                </div>
                {conv.unreadCount > 0 && (
                  <span className="min-w-[20px] h-5 rounded-full text-xs font-semibold flex items-center justify-center px-1"
                    style={{ background: 'var(--accent)', color: '#fff' }}>
                    {conv.unreadCount}
                  </span>
                )}
              </button>
            )
          })
        )}
      </Section>

      {/* Social Posts */}
      <Section
        title="Social Feed"
        action={
          <button onClick={() => onNavigate('explore')} className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
            Explore
          </button>
        }
      >
        {recentPosts.length === 0 ? (
          <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>No posts yet</p>
        ) : (
          recentPosts.map((post) => (
            <button
              key={post.id}
              onClick={() => onNavigate('explore')}
              className="flex items-start gap-3 w-full p-3 rounded-xl text-left transition-colors"
              style={{ background: 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-muted)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
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
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>{title}</h2>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </div>
  )
}

function TxRow({ tx, myAddress }: { tx: import('../types/index').TxRecord; myAddress: string }) {
  const isSent = isSameAddress(tx.fromAddress, myAddress)
  const other = isSent ? tx.toAddress : tx.fromAddress
  // Chain/explorer single source: ARC_CHAIN_ID + builder (no hardcoded URLs).
  const explorerUrl = buildTxExplorerUrl(ARC_CHAIN_ID, tx.txHash)

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl">
      <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
        style={{
          background: isSent ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: isSent ? 'var(--danger)' : 'var(--success)',
        }}>
        {isSent ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
            {isSent ? 'Sent' : 'Received'}
          </span>
          <TxStatusBadge status={tx.status} />
        </div>
        <div className="text-xs" style={{ color: 'var(--muted)' }}>
          {isSent ? 'To' : 'From'} {formatAddress(other)} · {formatTimestamp(tx.timestamp)}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="tabnum font-semibold text-sm"
          style={{ color: isSent ? 'var(--danger)' : 'var(--success)' }}>
          {isSent ? '-' : '+'}{tx.amount} USDC
        </span>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
          className="p-1 rounded transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          <ExternalLink size={12} />
        </a>
      </div>
    </div>
  )
}
