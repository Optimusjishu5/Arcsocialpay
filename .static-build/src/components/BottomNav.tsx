import { Home, Compass, MessageCircle, Bell, User, type LucideProps } from 'lucide-react'
import { useStore, actions } from '../store'
import type { ActiveView } from '../types'
import type { ForwardRefExoticComponent, RefAttributes } from 'react'

type LucideIcon = ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>

const NAV_ITEMS: { view: ActiveView; Icon: LucideIcon }[] = [
  { view: 'feed', Icon: Home },
  { view: 'explore', Icon: Compass },
  { view: 'messages', Icon: MessageCircle },
  { view: 'notifications', Icon: Bell },
  { view: 'profile', Icon: User },
]

export default function BottomNav() {
  const activeView = useStore(s => s.activeView)
  const unreadNotifs = useStore(s => s.notifications.filter(n => !n.read).length)
  const unreadMessages = useStore(s => Object.values(s.conversations).reduce((acc, c) => acc + c.unreadCount, 0))

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t glass-strong"
      style={{ borderColor: 'var(--border)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center justify-around px-2 py-1.5">
        {NAV_ITEMS.map(({ view, Icon }) => {
          const active = activeView === view
          const badge = view === 'notifications' ? unreadNotifs : view === 'messages' ? unreadMessages : 0
          return (
            <button
              key={view}
              onClick={() => actions.navigate(view)}
              className="flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all relative"
              style={{ color: active ? 'var(--accent)' : 'var(--subtle)' }}
            >
              <span className="relative">
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                {badge > 0 && (
                  <span
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center"
                    style={{ background: 'var(--danger)', color: '#fff' }}
                  >
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </span>
              {active && (
                <span
                  className="absolute bottom-1.5 w-1 h-1 rounded-full"
                  style={{ background: 'var(--accent)' }}
                />
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
