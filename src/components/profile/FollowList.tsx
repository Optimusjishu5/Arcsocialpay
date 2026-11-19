import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Modal } from '../ui/Modal'
import { Avatar } from '../ui/Avatar'
import { AuthorName, openProfile } from '../ui/ProfileLink'
import { authedFetch, readSession } from '../../lib/chatSession'
import { formatAddress } from '../../utils/format'

/** The people behind a Followers or Following count. Tapping one opens their profile. */
export function FollowList({ open, onClose, me, target, kind }: {
  open: boolean; onClose: () => void; me: string | undefined; target: string; kind: 'followers' | 'following'
}) {
  const [result, setResult] = useState<{ key: string; people: string[] | null } | null>(null)
  const key = `${target.toLowerCase()}|${kind}`

  useEffect(() => {
    if (!open || !me) return
    let cancelled = false
    void (async () => {
      const session = readSession(me)
      let people: string[] | null = null
      if (session) {
        try {
          const res = await authedFetch(session, `/api/follows?address=${encodeURIComponent(target)}&list=${kind}`)
          if (res.ok) {
            const j = (await res.json()) as { people?: unknown[] }
            people = (j.people ?? []).filter((x): x is string => typeof x === 'string')
          }
        } catch { /* shown as unavailable below */ }
      }
      if (!cancelled) setResult({ key, people })
    })()
    return () => { cancelled = true }
  }, [open, me, target, kind, key])

  const current = result && result.key === key ? result : null
  return (
    <Modal open={open} onClose={onClose} title={kind === 'followers' ? 'Followers' : 'Following'}>
      {!current ? (
        <div className="flex items-center justify-center py-10" style={{ color: 'var(--muted)' }}>
          <Loader2 size={20} className="animate-spin" aria-label="Loading" />
        </div>
      ) : current.people === null ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>The list is not available right now. Sign in and try again.</p>
      ) : current.people.length === 0 ? (
        <p className="py-8 text-center text-sm" style={{ color: 'var(--muted)' }}>{kind === 'followers' ? 'No followers yet' : 'Not following anyone yet'}</p>
      ) : (
        <ul className="max-h-[60dvh] overflow-y-auto -mx-2">
          {current.people.map((a) => (
            <li key={a}>
              <button
                type="button"
                onClick={() => { onClose(); openProfile(a) }}
                className="flex w-full min-h-[56px] items-center gap-3 rounded-2xl px-2 py-2 text-left active:opacity-70"
              >
                <Avatar address={a} size={40} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold" style={{ color: 'var(--ink)' }}><AuthorName address={a} /></span>
                  <span className="block truncate text-xs mono" style={{ color: 'var(--subtle)' }}>{formatAddress(a)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
