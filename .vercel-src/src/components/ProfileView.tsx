import { useState } from 'react'
import {
  Camera, Copy, ExternalLink, UserPlus, UserMinus, MessageCircle, ArrowUpRight, ArrowDownLeft,
  Pencil, FileText, Wallet, Users, Heart, Activity, BadgeCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { motion } from 'framer-motion'
import { useArcAccount, useUsdcBalance, ARC_CHAIN_ID } from '../hooks/useArcWallet'
import { appStore, useAppStore, filterTxHistoryForAddress, isSameAddress } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { PhotoFrame } from './profile/PhotoFrame'
import { describeTx, txUrl } from '../utils/txPresentation'
import { Button } from './ui/Button'
import { TxStatusBadge } from './ui/TxStatusBadge'
import { EditProfileModal } from './profile/EditProfileModal'
import { GradientIcon, TONES, toneVars, type Tone } from './dashboard/ui'
import { formatAddress, formatTimestamp, getAvatarColor } from '../utils/format'
import { copyText } from '../utils/copy'
import { PROFILE_ACCENTS } from '../lib/chatAuth'
import { buildAddressExplorerUrl, buildTxExplorerUrl } from '@/onchain-facts'
import type { NavView } from '../types/index'

interface Props {
  viewAddress?: string // if undefined: show own profile
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

/** The profile's color: the one the owner picked, or a stable color derived from the address. */
function accentFor(addr: string, picked?: string): Tone {
  if (picked && (PROFILE_ACCENTS as readonly string[]).includes(picked)) return picked as Tone
  const color = getAvatarColor(addr)
  let n = 0
  for (let i = 0; i < color.length; i++) n = (n * 31 + color.charCodeAt(i)) >>> 0
  return PROFILE_ACCENTS[n % PROFILE_ACCENTS.length]
}

export function ProfileView({ viewAddress, onNavigate }: Props) {
  const { address, isConnected } = useArcAccount()
  const targetAddress = viewAddress ?? address
  const isOwn = !viewAddress || (!!address && isSameAddress(viewAddress, address))

  const { display: balanceDisplay, isLoading: balLoading } = useUsdcBalance(targetAddress as `0x${string}`)
  const { posts, txHistory, followMap } = useAppStore()
  const profile = targetAddress ? appStore.getProfile(targetAddress) : undefined

  const [editOpen, setEditOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'posts' | 'activity'>('posts')

  const myPosts = posts.filter((p) => targetAddress && isSameAddress(p.authorAddress, targetAddress))
  // Activity filter only (DATA/INDEXING): scope txHistory to viewed address, case-insensitive.
  const myTxs = filterTxHistoryForAddress(txHistory, targetAddress).slice(0, 10)
  const isFollowing = address && targetAddress ? appStore.isFollowing(address, targetAddress) : false

  if (!isConnected && isOwn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <GradientIcon icon={Wallet} tone="violet" size={64} />
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to view your profile
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  if (!targetAddress) return null

  const accent = accentFor(targetAddress, profile?.accent)
  const [from, to] = TONES[accent]
  const displayName = profile?.username || formatAddress(targetAddress)
  const following = (Object.entries(followMap).find(([k]) => isSameAddress(k, targetAddress))?.[1] ?? []).length

  return (
    <div className="tone-scope relative flex flex-col max-w-xl mx-auto pb-8 overflow-hidden" style={toneVars(accent)}>
      {/* Soft ambient glow behind the picture (no banner) */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 -top-24 w-[26rem] h-[26rem] rounded-full blur-3xl opacity-40"
        style={{ background: `radial-gradient(circle at 35% 35%, ${from}, ${to} 70%, transparent 100%)` }}
      />

      <div className="relative px-4">
        {/* Hero: round picture, name, bio, actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center text-center pt-8 pb-5"
        >
          <div className="relative">
            {profile?.avatarUrl ? (
              <PhotoFrame url={profile.avatarUrl} size={176} from={from} to={to} />
            ) : (
              <div
                className="rounded-full p-1"
                style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 18px 40px -14px ${to}` }}
              >
                <div className="rounded-full p-[4px]" style={{ background: 'var(--bg)' }}>
                  <Avatar address={targetAddress} size={132} />
                </div>
              </div>
            )}
            {isOwn && (
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                aria-label="Change profile picture"
                className="absolute bottom-2 right-2 w-10 h-10 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
                style={{ background: `linear-gradient(135deg, ${from}, ${to})`, border: '3px solid var(--bg)', boxShadow: `0 8px 16px -8px ${to}` }}
              >
                <Camera size={16} />
              </button>
            )}
          </div>

          <h2 className="display font-bold text-2xl mt-4 flex items-center justify-center gap-1.5 max-w-full" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>
            <span className="truncate">{displayName}</span>
            {isOwn && <BadgeCheck size={18} className="flex-shrink-0" style={{ color: 'var(--tone-text)' }} aria-label="This is you" />}
          </h2>

          {profile?.bio ? (
            <p className="text-sm mt-1.5 leading-relaxed max-w-sm" style={{ color: 'var(--ink-2)' }}>{profile.bio}</p>
          ) : (
            isOwn && (
              <button type="button" onClick={() => setEditOpen(true)} className="text-sm mt-1.5 font-medium" style={{ color: 'var(--tone-text)' }}>
                + Add a bio
              </button>
            )
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => copyText(targetAddress, 'Address copied')}
              className="inline-flex items-center gap-1.5 text-xs mono rounded-full px-3 h-7"
              data-chip=""
            >
              {formatAddress(targetAddress)}
              <Copy size={11} />
            </button>
            <a
              href={buildAddressExplorerUrl(ARC_CHAIN_ID, targetAddress)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="View on explorer"
              className="inline-flex items-center gap-1 text-xs hover:opacity-80"
              style={{ color: 'var(--muted)' }}
            >
              Explorer <ExternalLink size={10} />
            </a>
          </div>

          <div className="flex items-center justify-center gap-2 mt-4">
            {isOwn ? (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil size={14} />
                Edit profile
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (!address) return
                    const conv = appStore.getOrCreateConversation(address, targetAddress)
                    onNavigate('messages', { convId: conv.id })
                  }}
                >
                  <MessageCircle size={14} />
                  Message
                </Button>
                <Button onClick={() => address && appStore.toggleFollow(address, targetAddress)}>
                  {isFollowing ? <><UserMinus size={14} /> Unfollow</> : <><UserPlus size={14} /> Follow</>}
                </Button>
              </>
            )}
          </div>
        </motion.div>

        {/* Stats */}
        <div data-tc="" className="rounded-3xl p-4 mb-4">
          <div className="grid grid-cols-4 gap-2">
            <Stat icon={FileText} tone="blue" label="Posts" value={myPosts.length} />
            <Stat icon={Wallet} tone="green" label="Balance" value={balLoading ? '...' : `$${balanceDisplay}`} small />
            <Stat icon={Users} tone="violet" label="Followers" value={profile?.followerCount ?? 0} />
            <Stat icon={Heart} tone="rose" label="Following" value={following} />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background: 'var(--surface-muted)' }}>
          {(['posts', 'activity'] as const).map((t) => {
            const active = activeTab === t
            return (
              <button
                key={t}
                onClick={() => setActiveTab(t)}
                className="flex-1 h-10 rounded-xl font-semibold text-sm capitalize transition-all inline-flex items-center justify-center gap-1.5"
                style={
                  active
                    ? { background: `linear-gradient(135deg, ${from}, ${to})`, color: '#fff', boxShadow: `0 8px 18px -10px ${to}` }
                    : { background: 'transparent', color: 'var(--muted)' }
                }
              >
                {t === 'posts' ? <FileText size={14} /> : <Activity size={14} />}
                {t}
              </button>
            )
          })}
        </div>

        {activeTab === 'posts' && (
          <div data-tc="" className="rounded-2xl">
            {myPosts.length === 0 ? (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--muted)' }}>No posts yet</p>
            ) : (
              myPosts.map((post, i) => (
                <div key={post.id} className={`px-4 py-3 ${i < myPosts.length - 1 ? 'border-b' : ''}`} style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm mb-1.5" style={{ color: 'var(--ink-2)' }}>{post.content}</p>
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

        {activeTab === 'activity' && (
          <div data-tc="" className="rounded-2xl">
            {myTxs.length === 0 ? (
              <p className="text-sm py-10 text-center" style={{ color: 'var(--muted)' }}>No transactions yet</p>
            ) : (
              myTxs.map((tx, i) => {
                const v = describeTx(tx, targetAddress)
                return (
                  <div
                    key={tx.id}
                    className={`flex items-center gap-3 px-4 py-3 ${i < myTxs.length - 1 ? 'border-b' : ''}`}
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <GradientIcon icon={v.icon} tone={v.tone} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>{v.title}</span>
                        <TxStatusBadge status={tx.status} />
                      </div>
                      <span className="text-xs truncate block" style={{ color: 'var(--subtle)' }}>{v.detail} · {formatTimestamp(tx.timestamp)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {v.amountText && (
                        <span className="tabnum font-semibold text-sm" style={{ color: v.sign === '-' ? 'var(--danger)' : 'var(--success)' }}>
                          {v.sign}{v.amountText}
                        </span>
                      )}
                      <a href={txUrl(tx)} target="_blank" rel="noopener noreferrer" aria-label="View on explorer" style={{ color: 'var(--muted)' }}>
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

      {isOwn && address && editOpen && (
        <EditProfileModal
          open
          onClose={() => setEditOpen(false)}
          address={address}
          initial={{
            username: profile?.username && !profile.username.includes('...') ? profile.username : '',
            bio: profile?.bio ?? '',
            avatarUrl: profile?.avatarUrl ?? '',
            accent,
          }}
        />
      )}
    </div>
  )
}

function Stat({ icon, tone, label, value, small }: { icon: LucideIcon; tone: Tone; label: string; value: string | number; small?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl py-3 px-1" data-tp="">
      <GradientIcon icon={icon} tone={tone} size={30} />
      <div className={`font-bold tabnum ${small ? 'text-sm' : 'text-base'}`} style={{ color: 'var(--ink)', letterSpacing: '-0.01em' }}>
        {value}
      </div>
      <div className="text-[11px]" style={{ color: 'var(--subtle)' }}>{label}</div>
    </div>
  )
}
