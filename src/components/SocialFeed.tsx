import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Heart, MessageCircle, Repeat2, Share2, MoreHorizontal, Pencil, Trash2, X, Send, ChevronDown } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { appStore, useAppStore } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { EmptyState } from './ui/EmptyState'
import { Modal } from './ui/Modal'
import { formatAddress, formatTimestamp } from '../utils/format'
import type { Post, Comment } from '../types'

export function SocialFeed() {
  const { address, isConnected } = useArcAccount()
  const { posts, comments } = useAppStore()
  const [showComposer, setShowComposer] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'following'>('all')

  const myFollowing = address ? (appStore.getState().followMap[address] ?? []) : []

  const feedPosts = posts.filter((p) => {
    if (filter === 'following' && address) {
      return p.authorAddress === address || myFollowing.includes(p.authorAddress)
    }
    return true
  })

  return (
    <div className="flex flex-col gap-0 max-w-xl mx-auto pb-8">
      {/* Feed Header */}
      <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3"
        style={{ background: 'var(--bg)', borderBottom: '1px solid var(--border)', backdropFilter: 'blur(12px)' }}>
        <h2 className="display font-bold text-lg" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Feed</h2>
        <div className="flex items-center gap-2">
          {/* Filter tabs */}
          <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
            {(['all', 'following'] as const).map((f) => (
              <button key={f} onClick={() => setFilter(f)}
                className="px-3 h-7 rounded-lg text-xs font-semibold capitalize transition-all"
                style={{
                  background: filter === f ? 'var(--surface-strong)' : 'transparent',
                  color: filter === f ? 'var(--ink)' : 'var(--muted)',
                }}>
                {f}
              </button>
            ))}
          </div>
          {isConnected && (
            <Button size="sm" onClick={() => setShowComposer(true)}>Post</Button>
          )}
        </div>
      </div>

      {/* Composer */}
      {isConnected && (
        <div className="px-4 py-3 flex items-start gap-3"
          style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <Avatar address={address!} size={40} />
          <button
            onClick={() => setShowComposer(true)}
            className="flex-1 h-10 rounded-xl px-4 text-sm text-left transition-colors"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--subtle)' }}>
            What's on your mind?
          </button>
        </div>
      )}

      {!isConnected && (
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Connect your wallet to join the conversation</p>
          <ConnectKitButton />
        </div>
      )}

      {/* Posts */}
      {feedPosts.length === 0 ? (
        <EmptyState
          icon={<MessageCircle size={28} />}
          title="No posts yet"
          description="Be the first to post something in the feed"
        />
      ) : (
        feedPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            myAddress={address}
            comments={comments.filter((c) => c.postId === post.id)}
            isCommentsOpen={openCommentsId === post.id}
            onToggleComments={() => setOpenCommentsId((prev) => prev === post.id ? null : post.id)}
            onEdit={() => setEditingPost(post)}
          />
        ))
      )}

      {/* Compose Modal */}
      {address && (
        <ComposeModal
          open={showComposer}
          onClose={() => setShowComposer(false)}
          myAddress={address}
        />
      )}

      {/* Edit Modal */}
      {editingPost && address && (
        <ComposeModal
          open
          onClose={() => setEditingPost(null)}
          myAddress={address}
          editPost={editingPost}
        />
      )}
    </div>
  )
}

// ── Post Card ──────────────────────────────────────────────────────────────

function PostCard({ post, myAddress, comments, isCommentsOpen, onToggleComments, onEdit }: {
  post: Post
  myAddress: string | undefined
  comments: Comment[]
  isCommentsOpen: boolean
  onToggleComments: () => void
  onEdit: () => void
}) {
  const { posts } = useAppStore()
  const isLiked = myAddress ? post.likes.includes(myAddress) : false
  const isReposted = myAddress ? post.reposts.includes(myAddress) : false
  const isOwn = myAddress === post.authorAddress
  const [showMenu, setShowMenu] = useState(false)

  const originalPost = post.repostOf ? posts.find((p) => p.id === post.repostOf) : null

  function handleLike() {
    if (!myAddress) return
    appStore.toggleLike(post.id, myAddress)
  }

  function handleRepost() {
    if (!myAddress) return
    appStore.toggleRepost(post.id, myAddress)
  }

  function handleDelete() {
    appStore.deletePost(post.id)
    setShowMenu(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-4 py-4"
      style={{ borderBottom: '1px solid var(--border)' }}
    >
      {/* Repost attribution */}
      {post.repostOf && (
        <div className="flex items-center gap-1.5 mb-2 text-xs font-medium" style={{ color: 'var(--muted)' }}>
          <Repeat2 size={12} />
          <span>{formatAddress(post.authorAddress)} reposted</span>
        </div>
      )}

      <div className="flex items-start gap-3">
        <Avatar address={post.repostOf ? (originalPost?.authorAddress ?? post.authorAddress) : post.authorAddress} size={42} />
        <div className="flex-1 min-w-0">
          {/* Author + time */}
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
              {formatAddress(post.repostOf ? (originalPost?.authorAddress ?? post.authorAddress) : post.authorAddress)}
            </span>
            {post.editedAt && (
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>edited</span>
            )}
            <span className="text-xs ml-auto flex-shrink-0" style={{ color: 'var(--subtle)' }}>
              {formatTimestamp(post.createdAt)}
            </span>
            {isOwn && (
              <div className="relative">
                <button
                  onClick={() => setShowMenu(!showMenu)}
                  className="p-1 rounded-lg transition-colors hover:bg-[var(--surface-muted)]"
                  style={{ color: 'var(--muted)' }}>
                  <MoreHorizontal size={16} />
                </button>
                {showMenu && (
                  <div className="absolute right-0 top-8 w-36 rounded-xl shadow-lg z-20 overflow-hidden"
                    style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                    <button onClick={() => { onEdit(); setShowMenu(false) }}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-[var(--surface-muted)] transition-colors"
                      style={{ color: 'var(--ink)' }}>
                      <Pencil size={14} /> Edit
                    </button>
                    <button onClick={handleDelete}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-[var(--danger-bg)] transition-colors"
                      style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Content */}
          <p className="text-sm leading-relaxed mb-3" style={{ color: 'var(--ink-2)' }}>
            {post.content}
          </p>

          {/* Actions */}
          <div className="flex items-center gap-5">
            <ActionBtn
              icon={<MessageCircle size={16} />}
              count={post.commentCount}
              label="Comment"
              active={false}
              onClick={onToggleComments}
            />
            <ActionBtn
              icon={<Heart size={16} />}
              count={post.likeCount}
              label="Like"
              active={isLiked}
              activeColor="var(--danger)"
              onClick={handleLike}
            />
            <ActionBtn
              icon={<Repeat2 size={16} />}
              count={post.repostCount}
              label="Repost"
              active={isReposted}
              activeColor="var(--success)"
              onClick={handleRepost}
            />
            <ActionBtn
              icon={<Share2 size={16} />}
              count={0}
              label="Share"
              active={false}
              onClick={() => {
                void navigator.clipboard.writeText(window.location.href)
              }}
              hideCount
            />
          </div>

          {/* Comments Section */}
          <AnimatePresence>
            {isCommentsOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-3 overflow-hidden">
                <CommentsSection postId={post.id} comments={comments} myAddress={myAddress} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

function ActionBtn({ icon, count, label, active, activeColor = 'var(--accent)', onClick, hideCount = false }: {
  icon: React.ReactNode
  count: number
  label: string
  active: boolean
  activeColor?: string
  onClick: () => void
  hideCount?: boolean
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 transition-all hover:opacity-80 active:scale-95"
      style={{ color: active ? activeColor : 'var(--muted)' }}
      aria-label={label}
    >
      {icon}
      {!hideCount && <span className="text-xs tabnum">{count > 0 ? count : ''}</span>}
    </button>
  )
}

// ── Comments Section ───────────────────────────────────────────────────────

function CommentsSection({ postId, comments, myAddress }: {
  postId: string
  comments: Comment[]
  myAddress: string | undefined
}) {
  const [text, setText] = useState('')

  function submit() {
    if (!text.trim() || !myAddress) return
    appStore.addComment(postId, myAddress, text.trim())
    setText('')
  }

  return (
    <div className="space-y-2">
      {comments.map((c) => (
        <div key={c.id} className="flex items-start gap-2">
          <Avatar address={c.authorAddress} size={28} />
          <div className="flex-1 rounded-xl px-3 py-2"
            style={{ background: 'var(--surface-muted)' }}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
                {formatAddress(c.authorAddress)}
              </span>
              <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                {formatTimestamp(c.createdAt)}
              </span>
            </div>
            <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{c.content}</p>
          </div>
        </div>
      ))}
      {myAddress && (
        <div className="flex items-center gap-2 mt-2">
          <Avatar address={myAddress} size={28} />
          <div className="flex-1 flex items-center gap-2 h-9 rounded-xl px-3"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit() }}
              placeholder="Write a comment..."
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
            <button onClick={submit} disabled={!text.trim()} style={{ color: 'var(--accent)' }}>
              <Send size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Compose Modal ──────────────────────────────────────────────────────────

function ComposeModal({ open, onClose, myAddress, editPost }: {
  open: boolean
  onClose: () => void
  myAddress: string
  editPost?: Post
}) {
  const [content, setContent] = useState(editPost?.content ?? '')
  const MAX = 280

  function submit() {
    if (!content.trim()) return
    if (editPost) {
      appStore.editPost(editPost.id, content.trim())
    } else {
      appStore.ensureProfile(myAddress)
      appStore.addPost(myAddress, content.trim())
    }
    setContent('')
    onClose()
  }

  const remaining = MAX - content.length
  const overLimit = remaining < 0

  return (
    <Modal open={open} onClose={onClose} title={editPost ? 'Edit Post' : 'New Post'}>
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          <Avatar address={myAddress} size={40} />
          <textarea
            autoFocus
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening?"
            rows={4}
            className="flex-1 text-sm p-3 rounded-xl outline-none resize-none focus:ring-2 focus:ring-[var(--focus)]"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs tabnum" style={{ color: overLimit ? 'var(--danger)' : 'var(--subtle)' }}>
            {remaining} characters remaining
          </span>
          <Button onClick={submit} disabled={!content.trim() || overLimit} size="sm">
            {editPost ? 'Save' : 'Post'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
