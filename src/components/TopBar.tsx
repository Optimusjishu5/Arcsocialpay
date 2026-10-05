// DEPRECATED (P0 dual-store): legacy TopBar using src/store.ts + src/types.ts.
// Not routed by src/App.tsx (which uses Navigation.MobileTopBar). The
// `actions.navigate('explore')` below refers to legacy ActiveView 'explore',
// which maps 1:1 to modern NavView 'explore' (SocialFeed) in App.tsx — no
// separate mapping needed. Kept so `tsc --noEmit` still passes.
import { ArrowLeft, PenSquare, Search, Moon, Sun } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useAccount } from 'wagmi'
import { useStore, actions } from '../store'

interface TopBarProps {
  title?: string
  showBack?: boolean
  onBack?: () => void
  hideSearch?: boolean
  right?: React.ReactNode
}

export default function TopBar({ title, showBack, onBack, hideSearch, right }: TopBarProps) {
  const theme = useStore(s => s.theme)
  const currentUserId = useStore(s => s.currentUserId)
  const currentUser = useStore(s => s.currentUserId ? s.users[s.currentUserId] : undefined)
  const { address, isConnected } = useAccount()

  return (
    <header
      className="sticky top-0 z-30 flex items-center gap-3 px-4 h-14 glass-strong border-b"
      style={{ borderColor: 'var(--border)' }}
    >
      {/* Left */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {showBack ? (
          <button
            onClick={onBack ?? (() => window.history.back())}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:opacity-70"
            style={{ background: 'var(--surface-muted)' }}
          >
            <ArrowLeft size={18} style={{ color: 'var(--ink)' }} />
          </button>
        ) : (
          <div className="md:hidden flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
              style={{ background: 'var(--accent)', color: theme === 'dark' ? 'var(--bg)' : '#fff' }}
            >
              A
            </div>
          </div>
        )}
        {title && (
          <h1
            className="display font-bold text-base truncate"
            style={{ color: 'var(--ink)' }}
          >
            {title}
          </h1>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        {right}

        {!hideSearch && (
          <button
            onClick={() => actions.navigate('explore')}
            className="w-9 h-9 flex items-center justify-center rounded-xl transition-all hover:opacity-70"
            style={{ background: 'var(--surface-muted)' }}
          >
            <Search size={17} style={{ color: 'var(--ink-2)' }} />
          </button>
        )}

        {/* Mobile: compose */}
        {currentUserId && (
          <button
            onClick={() => actions.openComposer()}
            className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl transition-all"
            style={{ background: 'var(--accent)', color: theme === 'dark' ? 'var(--bg)' : '#fff' }}
          >
            <PenSquare size={17} />
          </button>
        )}

        {/* Theme toggle (mobile) */}
        <button
          onClick={() => actions.setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="md:hidden w-9 h-9 flex items-center justify-center rounded-xl transition-all"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Connect wallet (topbar for mobile) */}
        {!isConnected && (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                Connect
              </button>
            )}
          </ConnectKitButton.Custom>
        )}

        {isConnected && address && !currentUser && null}
        {isConnected && address && currentUser && (
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button onClick={show} className="block md:hidden">
                <img
                  src={currentUser.avatarUrl ?? `https://api.dicebear.com/7.x/avataaars/svg?seed=${address}`}
                  alt=""
                  className="w-8 h-8 rounded-full border-2"
                  style={{ borderColor: 'var(--border-strong)' }}
                />
              </button>
            )}
          </ConnectKitButton.Custom>
        )}
      </div>
    </header>
  )
}
