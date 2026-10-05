import { useState } from 'react'
import {
  Heart, MessageCircle, Repeat2, Share2, Bookmark,
  MoreHorizontal, ExternalLink, Quote, Coins,
  CheckCircle2, Clock, XCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, actions, formatTime, formatCount } from '../store'
import type { Post } from '../types'
import { buildTxExplorerUrl } from '../onchain-facts'

interface PostCardProps {
  postId: string
  compact?: boolean
  hideReplies?: boolean
}

function Avatar({ userId, size = 40 }: { userId: string; size?: number }) {
  const user = useStore(s => s.users[userId])
  if (!user) return <div className="rounded-full bg-gray-300" style={{ width: size, height: size }} />
  return (
    <button
      onClick={() => actions.navigate('profile', { userId })}
      className="shrink-0 rounded-full overflow-hidden border-2 transition-all hover:opacity-80"
      style={{ width: size, height: size, borderColor: 'var(--border)' }}
    >
      <img src={user.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`} alt={user.displayName} className="w-full h-full object-cover" />
    </button>
  )
}

function TipStatus({ status, hash, chainId }: { status: string; hash: string; chainId: number }) {
  const explorerUrl = buildTxExplorerUrl(chainId, hash)
  const icon = status === 'confirmed'
    ? <CheckCircle2 size={12} style={{ color: 'var(--success)' }} />
    : status === 'failed'
    ? <XCircle size={12} style={{ color: 'var(--danger)' }} />
    : <Clock size={12} style={{ color: 'var(--warning)' }} />

  return (
    <a
      href={explorerUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border"
      style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
    >
      {icon}
      <span className="mono tabular">{status}</span>
      <ExternalLink size={10} />
    </a>
  )
}

function QuotedPost({ postId }: { postId: string }) {
  const post = useStore(s => s.posts[postId])
  const author = useStore(s => post ? s.users[post.authorId] : undefined)
  if (!post || !author) return null
  return (
    <div
      className="mt-2 p-3 rounded-xl border"
      style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
    >
      <div className="flex items-center gap-2 mb-1">
        <img src={author.avatarUrl ?? ''} alt="" className="w-5 h-5 rounded-full" />
        <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>{author.displayName}</span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>@{author.username}</span>
        <span className="text-xs" style={{ color: 'var(--subtle)' }}>· {formatTime(post.createdAt)}</span>
      </div>
      <p className="text-sm line-clamp-3" style={{ color: 'var(--ink-2)' }}>{post.content}</p>
    </div>
  )
}

export default function PostCard({ postId, compact, hideReplies }: PostCardProps) {
  const post = useStore(s => s.posts[postId])
  const author = useStore(s => post ? s.users[post.authorId] : undefined)
  const currentUserId = useStore(s => s.currentUserId)
  const [showMenu, setShowMenu] = useState(false)
  const [tipOpen, setTipOpen] = useState(false)
  const [shareToast, setShareToast] = useState(false)

  if (!post || !author) return null

  // Handle repost display
  if (post.type === 'repost' && post.originalPostId) {
    const reposter = author
    return (
      <div>
        <div className="flex items-center gap-2 px-4 pt-2" style={{ color: 'var(--subtle)' }}>
          <Repeat2 size={14} />
          <span className="text-xs font-medium">{reposter.displayName} reposted</span>
        </div>
        <PostCard postId={post.originalPostId} compact={compact} />
      </div>
    )
  }

  const isLiked = currentUserId ? post.likes.includes(currentUserId) : false
  const isBookmarked = currentUserId ? post.bookmarks.includes(currentUserId) : false
  const isReposted = currentUserId ? post.reposts.includes(currentUserId) : false

  const handleLike = () => { if (currentUserId) actions.toggleLike(postId) }
  const handleRepost = () => { if (currentUserId) actions.repost(postId) }
  const handleBookmark = () => { if (currentUserId) actions.toggleBookmark(postId) }
  const handleReply = () => {
    if (currentUserId) {
      actions.openComposer({ replyToId: postId })
    }
  }
  const handleQuote = () => {
    if (currentUserId) {
      actions.openComposer({ quoteId: postId })
    }
  }
  const handleShare = () => {
    navigator.clipboard.writeText(`https://arcsocial.app/post/${postId}`).catch(() => {})
    setShareToast(true)
    setTimeout(() => setShareToast(false), 2000)
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="border-b px-4 py-4 relative cursor-pointer transition-colors"
      style={{ borderColor: 'var(--border)' }}
      onClick={() => actions.navigate('feed', { postId })}
    >
      {/* Reply context */}
      {post.type === 'reply' && post.replyToId && (
        <div className="text-xs mb-2 flex items-center gap-1" style={{ color: 'var(--subtle)' }}>
          <MessageCircle size={12} />
          Replying to a post
        </div>
      )}

      <div className="flex gap-3">
        <div className="flex flex-col items-center">
          <Avatar userId={post.authorId} size={40} />
          {!compact && post.replies.length > 0 && (
            <div className="w-0.5 flex-1 mt-2 rounded-full" style={{ background: 'var(--border)' }} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              <button
                onClick={e => { e.stopPropagation(); actions.navigate('profile', { userId: post.authorId }) }}
                className="font-semibold text-sm hover:underline truncate"
                style={{ color: 'var(--ink)' }}
              >
                {author.displayName}
              </button>
              {author.isVerified && (
                <CheckCircle2 size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              )}
              <span className="text-sm" style={{ color: 'var(--subtle)' }}>@{author.username}</span>
              <span className="text-sm" style={{ color: 'var(--subtle)' }}>·</span>
              <span className="text-sm" style={{ color: 'var(--subtle)' }}>{formatTime(post.createdAt)}</span>
              {post.onchain && (
                <span className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                  onchain
                </span>
              )}
            </div>
            <div className="relative shrink-0" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setShowMenu(v => !v)}
                className="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:bg-opacity-20"
                style={{ color: 'var(--subtle)' }}
              >
                <MoreHorizontal size={18} />
              </button>
              <AnimatePresence>
                {showMenu && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="absolute right-0 top-9 z-50 w-44 rounded-xl shadow-xl border overflow-hidden"
                    style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
                  >
                    {[
                      { label: 'Bookmark', action: handleBookmark },
                      { label: 'Quote post', action: handleQuote },
                      { label: 'Copy link', action: handleShare },
                      ...(post.authorId === currentUserId ? [{ label: 'Delete', action: () => {} }] : []),
                    ].map(({ label, action }) => (
                      <button
                        key={label}
                        onClick={() => { action(); setShowMenu(false) }}
                        className="w-full text-left px-4 py-2.5 text-sm transition-all hover:opacity-80"
                        style={{
                          color: label === 'Delete' ? 'var(--danger)' : 'var(--ink)',
                          background: 'transparent',
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Content */}
          <p
            className="text-sm leading-relaxed text-pretty mb-2"
            style={{ color: 'var(--ink-2)' }}
          >
            {post.content}
          </p>

          {/* Quoted post */}
          {post.type === 'quote' && post.quotedPostId && (
            <div onClick={e => e.stopPropagation()}>
              <QuotedPost postId={post.quotedPostId} />
            </div>
          )}

          {/* Onchain tx status */}
          {post.onchain && (
            <div className="mb-2" onClick={e => e.stopPropagation()}>
              <TipStatus
                status={post.onchain.status}
                hash={post.onchain.txHash}
                chainId={post.onchain.chainId}
              />
            </div>
          )}

          {/* Actions */}
          <div
            className="flex items-center justify-between mt-2 -ml-2"
            onClick={e => e.stopPropagation()}
          >
            {/* Reply */}
            <ActionBtn
              icon={<MessageCircle size={17} />}
              count={post.replies.length}
              active={false}
              color="var(--subtle)"
              activeColor="#1d9bf0"
              onClick={handleReply}
              label="Reply"
            />
            {/* Repost */}
            <ActionBtn
              icon={<Repeat2 size={17} />}
              count={post.reposts.length}
              active={isReposted}
              color="var(--subtle)"
              activeColor="var(--success)"
              onClick={handleRepost}
              label="Repost"
            />
            {/* Like */}
            <ActionBtn
              icon={<Heart size={17} fill={isLiked ? 'currentColor' : 'none'} />}
              count={post.likes.length}
              active={isLiked}
              color="var(--subtle)"
              activeColor="var(--danger)"
              onClick={handleLike}
              label="Like"
            />
            {/* Tip */}
            <ActionBtn
              icon={<Coins size={17} />}
              count={0}
              active={false}
              color="var(--subtle)"
              activeColor="#f59e0b"
              onClick={() => { if (currentUserId) setTipOpen(true) }}
              label="Tip"
              hideCount
            />
            {/* Bookmark */}
            <ActionBtn
              icon={<Bookmark size={17} fill={isBookmarked ? 'currentColor' : 'none'} />}
              count={post.bookmarks.length}
              active={isBookmarked}
              color="var(--subtle)"
              activeColor="var(--accent)"
              onClick={handleBookmark}
              label="Bookmark"
            />
            {/* Share */}
            <ActionBtn
              icon={<Share2 size={17} />}
              count={0}
              active={false}
              color="var(--subtle)"
              activeColor="var(--muted)"
              onClick={handleShare}
              label="Share"
              hideCount
            />
          </div>

          {/* Share toast */}
          <AnimatePresence>
            {shareToast && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-xs mt-1 font-medium"
                style={{ color: 'var(--success)' }}
              >
                Link copied to clipboard
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Tip Modal */}
      <AnimatePresence>
        {tipOpen && (
          <TipModal postId={postId} authorId={post.authorId} onClose={() => setTipOpen(false)} />
        )}
      </AnimatePresence>
    </motion.article>
  )
}

function ActionBtn({
  icon, count, active, color, activeColor, onClick, label, hideCount,
}: {
  icon: React.ReactNode
  count: number
  active: boolean
  color: string
  activeColor: string
  onClick: () => void
  label: string
  hideCount?: boolean
}) {
  return (
    <button
      aria-label={label}
      onClick={onClick}
      className="flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-80 tabular"
      style={{ color: active ? activeColor : color }}
    >
      <span>{icon}</span>
      {!hideCount && count > 0 && (
        <span>{formatCount(count)}</span>
      )}
    </button>
  )
}

import { useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi } from 'viem'
import { getUsdc } from '../onchain-facts'
import { parseAmount, formatAmount, Amount, usdcDecimalsFor } from '../onchain-money'
import { useAccount } from 'wagmi'

const ARC_TESTNET_CHAIN_ID = 5042002

function TipModal({ postId, authorId, onClose }: { postId: string; authorId: string; onClose: () => void }) {
  const [amount, setAmount] = useState('1')
  const { address, chainId } = useAccount()
  const author = useStore(s => s.users[authorId])
  const usdcFact = getUsdc(ARC_TESTNET_CHAIN_ID)

  const { data: balanceRaw } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
    query: { enabled: !!address && !!usdcFact },
  })

  const balance = balanceRaw
    ? Amount.fromRaw(balanceRaw, usdcDecimalsFor(ARC_TESTNET_CHAIN_ID)).toFixed(2)
    : '0.00'

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
  } = useWriteContract()

  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })

  const recipientAddress = author?.address

  const handleTip = () => {
    if (!recipientAddress || !usdcFact || !address) return
    try {
      const parsed = parseAmount(ARC_TESTNET_CHAIN_ID, amount)
      writeContract({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientAddress as `0x${string}`, parsed.raw],
        chainId: ARC_TESTNET_CHAIN_ID,
      })
    } catch (_e) {
      // invalid amount
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      onClick={() => onClose()}
      style={{ background: 'rgba(0,0,0,0.5)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="display font-bold text-base mb-1" style={{ color: 'var(--ink)' }}>
          Tip with USDC
        </h3>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Send USDC directly to @{author?.username ?? 'this creator'} onchain.
        </p>

        {!address ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--subtle)' }}>
            Connect your wallet to tip.
          </p>
        ) : !recipientAddress ? (
          <p className="text-sm text-center py-4" style={{ color: 'var(--subtle)' }}>
            This user has not connected a wallet.
          </p>
        ) : isSuccess ? (
          <div className="text-center py-4">
            <CheckCircle2 size={36} className="mx-auto mb-2" style={{ color: 'var(--success)' }} />
            <p className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Tip sent successfully!</p>
            {hash && (
              <a
                href={buildTxExplorerUrl(ARC_TESTNET_CHAIN_ID, hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs"
                style={{ color: 'var(--accent)' }}
              >
                View on explorer <ExternalLink size={12} />
              </a>
            )}
            <button
              onClick={onClose}
              className="mt-4 w-full py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4">
              <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--subtle)' }}>
                <span>Amount (USDC)</span>
                <span className="tabular">Balance: {balance} USDC</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="flex-1 bg-transparent text-base font-semibold tabular outline-none"
                  style={{ color: 'var(--ink)' }}
                />
                <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
              </div>
              <div className="flex gap-2 mt-2">
                {['1', '5', '10'].map(v => (
                  <button
                    key={v}
                    onClick={() => setAmount(v)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                    style={{
                      borderColor: amount === v ? 'var(--accent)' : 'var(--border)',
                      color: amount === v ? 'var(--accent)' : 'var(--muted)',
                      background: amount === v ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    ${v}
                  </button>
                ))}
              </div>
            </div>

            {writeError && (
              <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
                {writeError.message.includes('user rejected') ? 'Transaction cancelled.' : 'Transaction failed. Please try again.'}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border transition-all"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleTip}
                disabled={isPending || isConfirming || !amount || parseFloat(amount) <= 0}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                {isPending ? 'Confirm in wallet…' : isConfirming ? 'Confirming…' : `Tip $${amount}`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
