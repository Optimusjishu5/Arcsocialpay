import { useState } from 'react'
import { Sparkles, Clock, Bookmark } from 'lucide-react'
import { motion } from 'framer-motion'
import { useStore, actions } from '../store'
import PostCard from './PostCard'
import TopBar from './TopBar'

type FeedTab = 'for-you' | 'following' | 'bookmarks'

export default function FeedView() {
  const [tab, setTab] = useState<FeedTab>('for-you')
  const currentUserId = useStore(s => s.currentUserId)
  const posts = useStore(s => s.posts)
  const currentUser = useStore(s => s.currentUserId ? s.users[s.currentUserId] : undefined)

  const allPosts = Object.values(posts)
    .filter(p => p.type === 'post' || p.type === 'quote' || p.type === 'repost')
    .sort((a, b) => b.createdAt - a.createdAt)

  const displayPosts = tab === 'following'
    ? allPosts.filter(p =>
        currentUser?.following.includes(p.authorId) || p.authorId === currentUserId
      )
    : tab === 'bookmarks'
    ? allPosts.filter(p => currentUserId && p.bookmarks.includes(currentUserId))
    : allPosts

  return (
    <div className="min-h-dvh flex flex-col">
      <TopBar title="ArcSocial" />

      {/* Tabs */}
      <div
        className="flex border-b sticky top-14 z-20"
        style={{ background: 'var(--surface-strong)', backdropFilter: 'blur(16px)', borderColor: 'var(--border)' }}
      >
        {([
          { id: 'for-you', label: 'For You', Icon: Sparkles },
          { id: 'following', label: 'Following', Icon: Clock },
          { id: 'bookmarks', label: 'Saved', Icon: Bookmark },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium relative transition-all"
            style={{ color: tab === id ? 'var(--accent)' : 'var(--subtle)' }}
          >
            <Icon size={15} />
            {label}
            {tab === id && (
              <motion.div
                layoutId="feed-tab-line"
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Quick compose bar */}
      {currentUserId && (
        <div
          className="flex items-center gap-3 px-4 py-3 border-b"
          style={{ borderColor: 'var(--border)' }}
        >
          {currentUser && (
            <img
              src={currentUser.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser.id}`}
              alt=""
              className="w-10 h-10 rounded-full"
            />
          )}
          <button
            onClick={() => actions.openComposer()}
            className="flex-1 text-left px-4 py-2.5 rounded-full text-sm border transition-all"
            style={{
              background: 'var(--surface-muted)',
              borderColor: 'var(--border)',
              color: 'var(--subtle)',
            }}
          >
            What's happening?
          </button>
        </div>
      )}

      {/* Posts */}
      {displayPosts.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div>
          {displayPosts.map(post => (
            <PostCard key={post.id} postId={post.id} />
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyState({ tab }: { tab: FeedTab }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--surface-muted)' }}
      >
        {tab === 'bookmarks'
          ? <Bookmark size={28} style={{ color: 'var(--subtle)' }} />
          : <Sparkles size={28} style={{ color: 'var(--subtle)' }} />}
      </div>
      <h3 className="display font-bold text-lg mb-2" style={{ color: 'var(--ink)' }}>
        {tab === 'bookmarks' ? 'No saved posts yet' : tab === 'following' ? 'Nothing yet' : 'Feed is quiet'}
      </h3>
      <p className="text-sm max-w-xs text-pretty" style={{ color: 'var(--muted)' }}>
        {tab === 'bookmarks'
          ? 'Bookmark posts to save them here for later.'
          : tab === 'following'
          ? 'Follow some accounts to see their posts here.'
          : 'Be the first to post something today.'}
      </p>
      {tab !== 'bookmarks' && (
        <button
          onClick={() => actions.openComposer()}
          className="mt-5 px-5 py-2 rounded-full text-sm font-semibold transition-all"
          style={{ background: 'var(--accent)', color: 'var(--bg)' }}
        >
          Write a post
        </button>
      )}
    </div>
  )
}
