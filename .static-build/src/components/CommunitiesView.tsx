import { useState } from 'react'
import {
  Users, Plus, Hash, ChevronRight, Lock,
  Globe, Crown, Shield, Search, CheckCircle2,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, actions, formatCount } from '../store'
import type { Community } from '../types'
import TopBar from './TopBar'
import PostCard from './PostCard'

export default function CommunitiesView() {
  const selectedId = useStore(s => s.selectedCommunityId)
  const communities = useStore(s => s.communities)
  const currentUserId = useStore(s => s.currentUserId)
  const [tab, setTab] = useState<'joined' | 'discover'>('joined')
  const [createOpen, setCreateOpen] = useState(false)

  const allComms = Object.values(communities)
  const joinedComms = allComms.filter(c => currentUserId && c.memberIds.includes(currentUserId))
  const discoverComms = allComms.filter(c => !currentUserId || !c.memberIds.includes(currentUserId))
  const displayComms = tab === 'joined' ? joinedComms : discoverComms

  if (selectedId) {
    return <CommunityDetailView communityId={selectedId} />
  }

  return (
    <div className="min-h-dvh">
      <TopBar
        title="Communities"
        right={
          <button
            onClick={() => setCreateOpen(true)}
            disabled={!currentUserId}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all disabled:opacity-40"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            <Plus size={18} />
          </button>
        }
      />

      {/* Tabs */}
      <div
        className="flex border-b"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
      >
        {(['joined', 'discover'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-3 text-sm font-medium capitalize relative transition-all"
            style={{ color: tab === t ? 'var(--accent)' : 'var(--subtle)' }}
          >
            {t}
            {tab === t && (
              <motion.div
                layoutId="comm-tab-line"
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Community cards */}
      <div className="p-4 space-y-3">
        {displayComms.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <Users size={36} className="mb-3" style={{ color: 'var(--subtle)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
              {tab === 'joined' ? 'No communities yet' : 'No more communities'}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
              {tab === 'joined' ? 'Join or create a community to get started.' : 'Check back later for new communities.'}
            </p>
          </div>
        ) : (
          displayComms.map(comm => (
            <CommunityCard
              key={comm.id}
              comm={comm}
              onClick={() => actions.navigate('community', { communityId: comm.id })}
            />
          ))
        )}
      </div>

      {createOpen && <CreateCommunityModal onClose={() => setCreateOpen(false)} />}
    </div>
  )
}

function CommunityCard({ comm, onClick }: { comm: Community; onClick: () => void }) {
  const currentUserId = useStore(s => s.currentUserId)
  const isMember = currentUserId ? comm.memberIds.includes(currentUserId) : false
  const isAdmin = currentUserId ? comm.adminIds.includes(currentUserId) : false

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl p-4 border transition-all hover:opacity-90"
      style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
    >
      <div className="flex items-start gap-3">
        <img
          src={comm.avatarUrl ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${comm.id}`}
          alt=""
          className="w-12 h-12 rounded-xl shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
              {comm.name}
            </span>
            {!comm.isPublic && <Lock size={12} style={{ color: 'var(--subtle)' }} />}
            {isAdmin && <Crown size={12} style={{ color: '#f59e0b' }} />}
          </div>
          <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--muted)' }}>
            {comm.description}
          </p>
          <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--subtle)' }}>
            <span className="flex items-center gap-1">
              <Users size={12} />
              {formatCount(comm.memberIds.length)} members
            </span>
            <span className="flex items-center gap-1">
              <Hash size={12} />
              {comm.channelIds.length} channels
            </span>
            {isMember ? (
              <span className="flex items-center gap-1 font-medium" style={{ color: 'var(--success)' }}>
                <CheckCircle2 size={12} />
                Member
              </span>
            ) : (
              <button
                onClick={e => { e.stopPropagation(); if (currentUserId) actions.joinCommunity(comm.id) }}
                disabled={!currentUserId}
                className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                Join
              </button>
            )}
          </div>
        </div>
        <ChevronRight size={18} style={{ color: 'var(--subtle)', flexShrink: 0 }} />
      </div>
    </button>
  )
}

function CommunityDetailView({ communityId }: { communityId: string }) {
  const comm = useStore(s => s.communities[communityId])
  const channels = useStore(s => s.channels)
  const posts = useStore(s => s.posts)
  const currentUserId = useStore(s => s.currentUserId)
  const [selectedChannelId, setSelectedChannelId] = useState<string | null>(null)

  if (!comm) return null

  const isMember = currentUserId ? comm.memberIds.includes(currentUserId) : false
  const isAdmin = currentUserId ? comm.adminIds.includes(currentUserId) : false
  const communityChannels = comm.channelIds.map(id => channels[id]).filter(Boolean)
  const activeChannel = selectedChannelId ?? comm.channelIds[0]

  const channelPosts = Object.values(posts)
    .filter(p => p.communityId === communityId && (!activeChannel || p.channelId === activeChannel))
    .sort((a, b) => b.createdAt - a.createdAt)

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar
        showBack
        onBack={() => actions.navigate('communities')}
        title={comm.name}
      />

      {/* Banner + info */}
      <div
        className="h-24 relative"
        style={{
          background: comm.bannerUrl
            ? `url(${comm.bannerUrl}) center/cover`
            : 'linear-gradient(135deg, var(--accent) 0%, var(--focus) 100%)',
        }}
      />

      <div className="px-4 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-end justify-between -mt-7 mb-3">
          <img
            src={comm.avatarUrl ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${communityId}`}
            alt=""
            className="w-14 h-14 rounded-xl border-3 shadow"
            style={{ borderColor: 'var(--bg)', border: '3px solid var(--bg)' }}
          />
          <div className="flex gap-2 pt-10">
            {isMember ? (
              <>
                {isAdmin && (
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border"
                    style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
                  >
                    <Shield size={12} /> Manage
                  </button>
                )}
                <button
                  onClick={() => actions.leaveCommunity(communityId)}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                  style={{ borderColor: 'var(--border-strong)', color: 'var(--ink)' }}
                >
                  Leave
                </button>
              </>
            ) : (
              <button
                onClick={() => { if (currentUserId) actions.joinCommunity(communityId) }}
                disabled={!currentUserId}
                className="px-4 py-1.5 rounded-full text-sm font-semibold disabled:opacity-40"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                Join
              </button>
            )}
          </div>
        </div>
        <h3 className="display font-bold text-base" style={{ color: 'var(--ink)' }}>{comm.name}</h3>
        <p className="text-xs mb-2" style={{ color: 'var(--subtle)' }}>c/{comm.handle}</p>
        {comm.description && (
          <p className="text-sm text-pretty mb-2" style={{ color: 'var(--ink-2)' }}>{comm.description}</p>
        )}
        <div className="flex gap-4 text-xs" style={{ color: 'var(--subtle)' }}>
          <span><strong style={{ color: 'var(--ink)' }}>{formatCount(comm.memberIds.length)}</strong> Members</span>
          <span><strong style={{ color: 'var(--ink)' }}>{comm.channelIds.length}</strong> Channels</span>
          {comm.isPublic ? (
            <span className="flex items-center gap-1"><Globe size={11} /> Public</span>
          ) : (
            <span className="flex items-center gap-1"><Lock size={11} /> Private</span>
          )}
        </div>
      </div>

      {/* Channel selector */}
      <div
        className="flex gap-2 px-4 py-3 overflow-x-auto border-b"
        style={{ borderColor: 'var(--border)' }}
      >
        {communityChannels.map(ch => (
          <button
            key={ch.id}
            onClick={() => setSelectedChannelId(ch.id)}
            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all"
            style={{
              background: activeChannel === ch.id ? 'var(--accent)' : 'var(--surface-muted)',
              color: activeChannel === ch.id ? 'var(--bg)' : 'var(--ink-2)',
            }}
          >
            <Hash size={11} />
            {ch.name}
          </button>
        ))}
      </div>

      {/* Posts in community */}
      {isMember && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => actions.openComposer()}
            className="w-full text-left px-4 py-2.5 rounded-full text-sm border transition-all"
            style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--subtle)' }}
          >
            Share something with the community…
          </button>
        </div>
      )}

      {channelPosts.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center px-6">
          <Hash size={28} className="mb-3" style={{ color: 'var(--subtle)' }} />
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No posts in this channel yet.</p>
        </div>
      ) : (
        <div>
          {channelPosts.map(p => <PostCard key={p.id} postId={p.id} />)}
        </div>
      )}
    </div>
  )
}

function CreateCommunityModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [creating, setCreating] = useState(false)

  const handleCreate = async () => {
    if (!name.trim()) return
    setCreating(true)
    await new Promise(r => setTimeout(r, 400))
    const id = actions.createCommunity(name.trim(), description.trim(), isPublic)
    setCreating(false)
    onClose()
    if (id) actions.navigate('community', { communityId: id })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="display font-bold text-lg mb-5" style={{ color: 'var(--ink)' }}>Create Community</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Community Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Arc Builders"
              maxLength={50}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What's this community about?"
              maxLength={200}
              rows={3}
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none resize-none"
              style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)', color: 'var(--ink)' }}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>Visibility</label>
            <div className="flex gap-2">
              {[
                { val: true, label: 'Public', Icon: Globe },
                { val: false, label: 'Private', Icon: Lock },
              ].map(({ val, label, Icon }) => (
                <button
                  key={label}
                  onClick={() => setIsPublic(val)}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium border transition-all"
                  style={{
                    borderColor: isPublic === val ? 'var(--accent)' : 'var(--border)',
                    background: isPublic === val ? 'var(--accent-soft)' : 'transparent',
                    color: isPublic === val ? 'var(--accent)' : 'var(--muted)',
                  }}
                >
                  <Icon size={14} /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
            style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
            style={{ background: 'var(--accent)', color: 'var(--bg)' }}
          >
            {creating ? 'Creating…' : 'Create'}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
