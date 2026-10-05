import { useState } from 'react'
import { Search, X, TrendingUp, Users, Hash } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore, actions, formatCount } from '../store'
import PostCard from './PostCard'
import TopBar from './TopBar'

type SearchTab = 'posts' | 'users' | 'communities'

const TRENDING_TAGS = ['#ArcBlockchain', '#USDC', '#DeFi', '#Web3Social', '#OnchainLife', '#ArcBuilders']

export default function ExploreView() {
  const [query, setQuery] = useState('')
  const [tab, setTab] = useState<SearchTab>('posts')
  const posts = useStore(s => s.posts)
  const users = useStore(s => s.users)
  const communities = useStore(s => s.communities)
  const currentUserId = useStore(s => s.currentUserId)

  const q = query.trim().toLowerCase()

  const filteredPosts = q
    ? Object.values(posts)
        .filter(p => p.content.toLowerCase().includes(q))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 30)
    : Object.values(posts)
        .sort((a, b) => b.views + b.likes.length - (a.views + a.likes.length))
        .slice(0, 20)

  const filteredUsers = q
    ? Object.values(users)
        .filter(u =>
          u.username.toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.bio?.toLowerCase().includes(q) ?? false)
        )
        .slice(0, 20)
    : Object.values(users).slice(0, 20)

  const filteredComms = q
    ? Object.values(communities)
        .filter(c =>
          c.name.toLowerCase().includes(q) ||
          c.handle.toLowerCase().includes(q) ||
          (c.description?.toLowerCase().includes(q) ?? false)
        )
    : Object.values(communities)

  return (
    <div className="min-h-dvh">
      <TopBar title="Explore" hideSearch />

      {/* Search bar */}
      <div className="sticky top-14 z-20 px-4 py-3" style={{ background: 'var(--surface-strong)', backdropFilter: 'blur(16px)' }}>
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
        >
          <Search size={17} style={{ color: 'var(--subtle)', flexShrink: 0 }} />
          <input
            type="text"
            autoFocus
            placeholder="Search posts, people, communities…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--ink)' }}
          />
          {query && (
            <button onClick={() => setQuery('')} style={{ color: 'var(--subtle)' }}>
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Trending tags (when no query) */}
      {!q && (
        <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'var(--subtle)' }}>
            <TrendingUp size={13} /> Trending on Arc
          </p>
          <div className="flex flex-wrap gap-2">
            {TRENDING_TAGS.map(tag => (
              <button
                key={tag}
                onClick={() => setQuery(tag.slice(1))}
                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex border-b"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
      >
        {([
          { id: 'posts', label: 'Posts', Icon: TrendingUp },
          { id: 'users', label: 'People', Icon: Users },
          { id: 'communities', label: 'Communities', Icon: Hash },
        ] as const).map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-3 text-sm font-medium relative transition-all"
            style={{ color: tab === id ? 'var(--accent)' : 'var(--subtle)' }}
          >
            <Icon size={14} />
            {label}
            {tab === id && (
              <motion.div
                layoutId="explore-tab-line"
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Results */}
      <AnimatePresence mode="wait">
        {tab === 'posts' && (
          <motion.div key="posts" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {filteredPosts.length === 0 ? (
              <EmptySearch query={q} type="posts" />
            ) : (
              filteredPosts.map(p => <PostCard key={p.id} postId={p.id} />)
            )}
          </motion.div>
        )}

        {tab === 'users' && (
          <motion.div key="users" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-2">
            {filteredUsers.length === 0 ? (
              <EmptySearch query={q} type="people" />
            ) : (
              filteredUsers.map(user => (
                <button
                  key={user.id}
                  onClick={() => actions.navigate('profile', { userId: user.id })}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:opacity-80"
                  style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
                >
                  <img
                    src={user.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`}
                    alt=""
                    className="w-11 h-11 rounded-full shrink-0"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{user.displayName}</p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>@{user.username}</p>
                    {user.bio && (
                      <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{user.bio}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold tabular" style={{ color: 'var(--ink)' }}>
                      {formatCount(user.followers.length)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>followers</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}

        {tab === 'communities' && (
          <motion.div key="communities" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-4 space-y-2">
            {filteredComms.length === 0 ? (
              <EmptySearch query={q} type="communities" />
            ) : (
              filteredComms.map(comm => (
                <button
                  key={comm.id}
                  onClick={() => actions.navigate('community', { communityId: comm.id })}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border transition-all hover:opacity-80"
                  style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
                >
                  <img
                    src={comm.avatarUrl ?? `https://api.dicebear.com/7.x/shapes/svg?seed=${comm.id}`}
                    alt=""
                    className="w-11 h-11 rounded-xl shrink-0"
                  />
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{comm.name}</p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>c/{comm.handle}</p>
                    {comm.description && (
                      <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--muted)' }}>{comm.description}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-semibold tabular" style={{ color: 'var(--ink)' }}>
                      {formatCount(comm.memberIds.length)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--subtle)' }}>members</p>
                  </div>
                </button>
              ))
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EmptySearch({ query, type }: { query: string; type: string }) {
  return (
    <div className="flex flex-col items-center py-16 px-6 text-center">
      <Search size={28} className="mb-3" style={{ color: 'var(--subtle)' }} />
      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
        {query ? `No ${type} found for "${query}"` : `No ${type} yet`}
      </p>
    </div>
  )
}
