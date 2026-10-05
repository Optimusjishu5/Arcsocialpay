import { useState } from 'react'
import { Edit3, Check, X, ExternalLink, UserPlus, UserMinus, MessageCircle, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount, useUsdcBalance, ARC_CHAIN_ID } from '../hooks/useArcWallet'
import { appStore, useAppStore, filterTxHistoryForAddress, isSameAddress } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { TxStatusBadge } from './ui/TxStatusBadge'
import { formatAddress, formatTimestamp, getAvatarColor } from '../utils/format'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import type { NavView } from '../types/index'

interface Props {
  viewAddress?: string // if undefined: show own profile
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

export function ProfileView({ viewAddress, onNavigate }: Props) {
  const { address, isConnected } = useArcAccount()
  const targetAddress = viewAddress ?? address
  const isOwn =
    !viewAddress || (!!address && isSameAddress(viewAddress, address))

  const { display: balanceDisplay, isLoading: balLoading } = useUsdcBalance(targetAddress as `0x${string}`)
  const { posts, txHistory, followMap } = useAppStore()
  const profile = targetAddress ? appStore.getProfile(targetAddress) : undefined

  const [editing, setEditing] = useState(false)
  const [editUsername, setEditUsername] = useState(profile?.username ?? '')
  const [editBio, setEditBio] = useState(profile?.bio ?? '')

  const myPosts = posts.filter(
    (p) => targetAddress && isSameAddress(p.authorAddress, targetAddress),
  )
  // Activity filter only (DATA/INDEXING): scope txHistory to viewed address,
  // case-insensitive. Do NOT touch editPost/profile logic here.
  const myTxs = filterTxHistoryForAddress(txHistory, targetAddress).slice(0, 10)
  const isFollowing = address && targetAddress ? appStore.isFollowing(address, targetAddress) : false
  const [activeTab, setActiveTab] = useState<'posts' | 'activity'>('posts')

  if (!isConnected && isOwn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to view your profile
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  if (!targetAddress) return null

  function saveEdit() {
    if (!isOwn || !address || !targetAddress) return
    appStore.upsertProfile(address, {
      address: targetAddress,
      username: editUsername.trim() || formatAddress(targetAddress),
      bio: editBio.trim(),
    })
    setEditing(false)
  }

  function handleFollow() {
    if (!address || !targetAddress) return
    appStore.toggleFollow(address, targetAddress)
  }

  const color = getAvatarColor(profile?.avatarSeed ?? targetAddress)

  return (
    <div className="flex flex-col max-w-xl mx-auto pb-8">
      {/* Header Banner */}
      <div className="h-28 rounded-b-2xl mx-4"
        style={{ background: `linear-gradient(135deg, ${color}cc 0%, ${color}44 100%)` }} />

      {/* Profile Card */}
      <div className="px-4 -mt-10">
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-start justify-between mb-3">
            <Avatar address={targetAddress} size={72} showRing />
            <div className="flex items-center gap-2 mt-12">
              {isOwn ? (
                editing ? (
                  <>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(false)}><X size={14} /></Button>
                    <Button size="sm" onClick={saveEdit}><Check size={14} /></Button>
                  </>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => {
                    setEditUsername(profile?.username ?? formatAddress(targetAddress))
                    setEditBio(profile?.bio ?? '')
                    setEditing(true)
                  }}>
                    <Edit3 size={14} />
                    Edit
                  </Button>
                )
              ) : (
                <>
                  <Button size="sm" variant="secondary" onClick={() => {
                    const conv = appStore.getOrCreateConversation(address!, targetAddress)
                    onNavigate('messages', { convId: conv.id })
                  }}>
                    <MessageCircle size={14} />
                    Message
                  </Button>
                  <Button size="sm" onClick={handleFollow}>
                    {isFollowing ? <><UserMinus size={14} /> Unfollow</> : <><UserPlus size={14} /> Follow</>}
                  </Button>
                </>
              )}
            </div>
          </div>

          {editing ? (
            <div className="space-y-2">
              <input
                type="text"
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                placeholder="Username"
                maxLength={30}
                className="w-full h-10 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                placeholder="Bio"
                rows={2}
                maxLength={160}
                className="w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)] resize-none"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
            </div>
          ) : (
            <>
              <h2 className="display font-bold text-xl mb-0.5" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
                {profile?.username ?? formatAddress(targetAddress)}
              </h2>
              {profile?.bio && (
                <p className="text-sm mb-2" style={{ color: 'var(--ink-2)' }}>{profile.bio}</p>
              )}
            </>
          )}

          {/* Wallet address */}
          <a
            href={buildAddressExplorerUrl(ARC_CHAIN_ID, targetAddress)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs mono mt-1 hover:opacity-80 transition-opacity"
            style={{ color: 'var(--muted)' }}>
            {formatAddress(targetAddress)}
            <ExternalLink size={10} />
          </a>

          {/* Stats Row */}
          <div className="grid grid-cols-4 gap-2 mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <Stat label="Posts" value={myPosts.length} />
            <Stat label="Balance" value={balLoading ? '...' : `$${balanceDisplay}`} isBalance />
            <Stat label="Followers" value={profile?.followerCount ?? 0} />
            <Stat
              label="Following"
              value={
                (Object.entries(followMap).find(([k]) => isSameAddress(k, targetAddress!))?.[1] ??
                  []).length
              }
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--surface-muted)' }}>
          {(['posts', 'activity'] as const).map((t) => (
            <button key={t} onClick={() => setActiveTab(t)}
              className="flex-1 h-9 rounded-lg font-semibold text-sm capitalize transition-all"
              style={{
                background: activeTab === t ? 'var(--surface-strong)' : 'transparent',
                color: activeTab === t ? 'var(--ink)' : 'var(--muted)',
              }}>
              {t}
            </button>
          ))}
        </div>

        {/* Posts */}
        {activeTab === 'posts' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {myPosts.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>No posts yet</p>
            ) : (
              myPosts.map((post, i) => (
                <div key={post.id} className={`px-4 py-3 ${i < myPosts.length - 1 ? 'border-b' : ''}`}
                  style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm mb-1" style={{ color: 'var(--ink-2)' }}>{post.content}</p>
                  <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--subtle)' }}>
                    <span>{formatTimestamp(post.createdAt)}</span>
                    <span>{post.likeCount} likes</span>
                    <span>{post.commentCount} comments</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Activity */}
        {activeTab === 'activity' && (
          <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {myTxs.length === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: 'var(--muted)' }}>No transactions yet</p>
            ) : (
              myTxs.map((tx, i) => {
                const isSent = isSameAddress(tx.fromAddress, targetAddress)
                return (
                  <div key={tx.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < myTxs.length - 1 ? 'border-b' : ''}`}
                    style={{ borderColor: 'var(--border)' }}>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{
                        background: isSent ? 'var(--danger-bg)' : 'var(--success-bg)',
                        color: isSent ? 'var(--danger)' : 'var(--success)',
                      }}>
                      {isSent ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                          {isSent ? `Sent to ${formatAddress(tx.toAddress)}` : `From ${formatAddress(tx.fromAddress)}`}
                        </span>
                        <TxStatusBadge status={tx.status} />
                      </div>
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                        {formatTimestamp(tx.timestamp)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="tabnum font-semibold text-sm"
                        style={{ color: isSent ? 'var(--danger)' : 'var(--success)' }}>
                        {isSent ? '-' : '+'}{tx.amount}
                      </span>
                      <a href={buildTxExplorerUrl(ARC_CHAIN_ID, tx.txHash)} target="_blank" rel="noopener noreferrer"
                        style={{ color: 'var(--muted)' }}>
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, isBalance }: { label: string; value: string | number; isBalance?: boolean }) {
  return (
    <div className="text-center">
      <div className={`font-bold text-base tabnum ${isBalance ? 'text-sm' : ''}`} style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
        {value}
      </div>
      <div className="text-xs mt-0.5" style={{ color: 'var(--subtle)' }}>{label}</div>
    </div>
  )
}
