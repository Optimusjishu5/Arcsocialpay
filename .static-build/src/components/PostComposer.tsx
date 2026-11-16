import { useState, useRef } from 'react'
import { X, Image, Link2, Video, Globe, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, actions } from '../store'

export default function PostComposer() {
  const composerOpen = useStore(s => s.composerOpen)
  const replyToId = useStore(s => s.composerReplyToId)
  const quoteId = useStore(s => s.composerQuoteId)
  const currentUserId = useStore(s => s.currentUserId)
  const currentUser = useStore(s => s.currentUserId ? s.users[s.currentUserId] : undefined)
  const replyPost = useStore(s => replyToId ? s.posts[replyToId] : undefined)
  const replyAuthor = useStore(s => replyPost ? s.users[replyPost.authorId] : undefined)
  const quotePost = useStore(s => quoteId ? s.posts[quoteId] : undefined)
  const quoteAuthor = useStore(s => quotePost ? s.users[quotePost.authorId] : undefined)

  const [content, setContent] = useState('')
  const [isPosting, setIsPosting] = useState(false)
  const textRef = useRef<HTMLTextAreaElement>(null)
  const MAX_LEN = 500

  if (!composerOpen) return null

  const remaining = MAX_LEN - content.length
  const canPost = content.trim().length > 0 && remaining >= 0 && !isPosting

  const handlePost = async () => {
    if (!canPost || !currentUserId) return
    setIsPosting(true)
    await new Promise(r => setTimeout(r, 300))
    actions.createPost({
      content: content.trim(),
      type: replyToId ? 'reply' : quoteId ? 'quote' : 'post',
      replyToId,
      quotedPostId: quoteId,
    })
    setContent('')
    setIsPosting(false)
    actions.closeComposer()
  }

  return (
    <AnimatePresence>
      {composerOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={() => actions.closeComposer()}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="fixed z-50 bottom-0 left-0 right-0 md:inset-0 md:flex md:items-center md:justify-center md:p-8"
            style={{ pointerEvents: 'none' }}
          >
            <div
              className="w-full max-w-lg rounded-t-2xl md:rounded-2xl p-5 shadow-2xl flex flex-col"
              style={{
                background: 'var(--surface-strong)',
                border: '1px solid var(--border)',
                pointerEvents: 'all',
                maxHeight: '85dvh',
              }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div
                    className="h-0.5 w-10 rounded-full mx-auto md:hidden"
                    style={{ background: 'var(--border-strong)' }}
                  />
                </div>
                <div className="flex items-center gap-3 ml-auto">
                  {/* Audience selector */}
                  <button
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all"
                    style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
                  >
                    <Globe size={12} />
                    Everyone
                    <ChevronDown size={12} />
                  </button>
                  <button
                    onClick={() => actions.closeComposer()}
                    className="w-8 h-8 flex items-center justify-center rounded-full transition-all hover:opacity-70"
                    style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Reply context */}
              {replyPost && replyAuthor && (
                <div
                  className="mb-3 p-3 rounded-xl text-sm border"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <img src={replyAuthor.avatarUrl ?? ''} alt="" className="w-5 h-5 rounded-full" />
                    <span className="font-semibold" style={{ color: 'var(--ink)' }}>{replyAuthor.displayName}</span>
                  </div>
                  <p className="line-clamp-2" style={{ color: 'var(--muted)' }}>{replyPost.content}</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                    Replying to @{replyAuthor.username}
                  </p>
                </div>
              )}

              {/* Composer body */}
              <div className="flex gap-3 flex-1">
                {currentUser && (
                  <img
                    src={currentUser.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`}
                    alt=""
                    className="w-10 h-10 rounded-full shrink-0"
                  />
                )}
                <div className="flex-1 flex flex-col">
                  <textarea
                    ref={textRef}
                    autoFocus
                    placeholder={replyToId ? 'Write your reply…' : quoteId ? 'Add your thoughts…' : "What's happening?"}
                    value={content}
                    onChange={e => setContent(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handlePost()
                    }}
                    className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed flex-1"
                    style={{ color: 'var(--ink)', minHeight: 100, maxHeight: 200 }}
                    maxLength={MAX_LEN + 10}
                  />

                  {/* Quote preview */}
                  {quotePost && quoteAuthor && (
                    <div
                      className="mt-2 p-3 rounded-xl border text-sm"
                      style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <img src={quoteAuthor.avatarUrl ?? ''} alt="" className="w-5 h-5 rounded-full" />
                        <span className="font-semibold" style={{ color: 'var(--ink)' }}>{quoteAuthor.displayName}</span>
                        <span style={{ color: 'var(--subtle)' }}>@{quoteAuthor.username}</span>
                      </div>
                      <p className="line-clamp-2" style={{ color: 'var(--muted)' }}>{quotePost.content}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-1">
                  <MediaBtn icon={<Image size={18} />} label="Image" />
                  <MediaBtn icon={<Video size={18} />} label="Video" />
                  <MediaBtn icon={<Link2 size={18} />} label="Link" />
                </div>
                <div className="flex items-center gap-3">
                  {/* Character counter */}
                  <div className="relative w-8 h-8">
                    <svg className="w-full h-full -rotate-90" viewBox="0 0 32 32">
                      <circle cx="16" cy="16" r="12" fill="none" strokeWidth="3" style={{ stroke: 'var(--border)' }} />
                      <circle
                        cx="16" cy="16" r="12" fill="none" strokeWidth="3"
                        strokeDasharray={`${2 * Math.PI * 12}`}
                        strokeDashoffset={`${2 * Math.PI * 12 * (1 - Math.min(content.length / MAX_LEN, 1))}`}
                        strokeLinecap="round"
                        style={{ stroke: remaining < 20 ? 'var(--danger)' : remaining < 50 ? 'var(--warning)' : 'var(--accent)', transition: 'stroke-dashoffset 0.1s' }}
                      />
                    </svg>
                    {remaining <= 50 && (
                      <span
                        className="absolute inset-0 flex items-center justify-center text-[9px] font-bold tabular"
                        style={{ color: remaining < 0 ? 'var(--danger)' : 'var(--muted)' }}
                      >
                        {remaining}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={handlePost}
                    disabled={!canPost}
                    className="px-5 py-2 rounded-full text-sm font-bold transition-all disabled:opacity-40"
                    style={{ background: 'var(--accent)', color: 'var(--bg)' }}
                  >
                    {isPosting ? 'Posting…' : replyToId ? 'Reply' : quoteId ? 'Quote' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

function MediaBtn({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      aria-label={label}
      className="w-9 h-9 flex items-center justify-center rounded-full transition-all hover:opacity-70"
      style={{ color: 'var(--accent)' }}
    >
      {icon}
    </button>
  )
}
