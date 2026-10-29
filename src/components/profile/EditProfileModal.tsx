'use client'

import { useRef, useState } from 'react'
import { Camera, Check, Trash2, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { TONES, toneVars, type Tone } from '../dashboard/ui'
import { appStore } from '../../store/appStore'
import { useProfileSaving } from '../../hooks/useProfileSaving'
import { fileToAvatarDataUrl } from '../../utils/image'
import { PhotoFrame } from './PhotoFrame'
import { getAvatarColor, getInitials, isSameAddress } from '../../utils/format'
import { BIO_MAX, PROFILE_ACCENTS, USERNAME_PATTERN } from '../../lib/chatAuth'

interface Props {
  open: boolean
  onClose: () => void
  address: string
  initial: { username: string; bio: string; avatarUrl: string; accent: Tone }
}

/** Edit profile sheet: picture, username, bio and profile color. Mount it fresh each time it opens. */
export function EditProfileModal({ open, onClose, address, initial }: Props) {
  const { save, serverStored } = useProfileSaving()
  const fileRef = useRef<HTMLInputElement>(null)
  const [username, setUsername] = useState(initial.username)
  const [bio, setBio] = useState(initial.bio)
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl)
  const [accent, setAccent] = useState<Tone>(initial.accent)
  const [saving, setSaving] = useState(false)
  const [processing, setProcessing] = useState(false)

  const [from, to] = TONES[accent]
  const name = username.trim()

  let usernameError = ''
  if (!USERNAME_PATTERN.test(name)) {
    usernameError = '3-20 characters: letters, numbers, dots or underscores.'
  } else if (
    Object.values(appStore.getState().profiles).some(
      (p) => p.username.toLowerCase() === name.toLowerCase() && !isSameAddress(p.address, address),
    )
  ) {
    usernameError = 'That username is already taken.'
  }

  const changed =
    name !== initial.username || bio.trim() !== initial.bio || avatarUrl !== initial.avatarUrl || accent !== initial.accent
  const canSave = changed && !usernameError && !saving && !processing

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setProcessing(true)
    try {
      setAvatarUrl(await fileToAvatarDataUrl(file))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not use that image.')
    } finally {
      setProcessing(false)
    }
  }

  async function onSave() {
    setSaving(true)
    try {
      await save(address, { username: name, bio: bio.trim(), avatarUrl, accent })
      toast.success('Profile updated')
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      toast.error(
        /reject|denied|cancel/i.test(msg) ? 'Signature cancelled. Profile not changed.' : msg || 'Could not save your profile.',
      )
    } finally {
      setSaving(false)
    }
  }

  const seedColor = getAvatarColor(address)

  return (
    <Modal open={open} onClose={onClose} title="Edit profile" maxWidth="max-w-md">
      <div className="tone-scope space-y-5" style={toneVars(accent)}>
        {/* Live preview: round picture, no banner */}
        <div className="flex flex-col items-center text-center pt-1">
          <div className="relative">
            {avatarUrl ? (
              <PhotoFrame url={avatarUrl} size={128} from={from} to={to} zoomable={false} alt="Profile preview" />
            ) : (
              <div className="rounded-full p-1" style={{ background: `linear-gradient(135deg, ${from}, ${to})`, boxShadow: `0 14px 30px -12px ${to}` }}>
                <div
                  className="w-[112px] h-[112px] rounded-full flex items-center justify-center text-3xl font-bold text-white"
                  style={{ background: `linear-gradient(135deg, rgba(255,255,255,0.28), transparent 60%), ${seedColor}`, border: '3px solid var(--surface)' }}
                >
                  {getInitials(name || 'You', address)}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Change profile picture"
              disabled={processing}
              className="absolute bottom-1 right-1 w-9 h-9 rounded-full flex items-center justify-center text-white transition-transform hover:scale-105 active:scale-95"
              style={{ background: `linear-gradient(135deg, ${from}, ${to})`, border: '3px solid var(--surface)', boxShadow: `0 6px 14px -6px ${to}` }}
            >
              <Camera size={14} />
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickFile} />
          </div>
          <p className="display font-bold text-lg mt-3 truncate max-w-full" style={{ color: 'var(--ink)' }}>{name || 'Your name'}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{processing ? 'Preparing photo...' : 'Preview'}</p>
        </div>

        <div className="flex justify-center gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()} disabled={processing}>
            <Camera size={14} /> {avatarUrl ? 'Change photo' : 'Add photo'}
          </Button>
          {avatarUrl && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setAvatarUrl('')}>
              <Trash2 size={14} /> Remove
            </Button>
          )}
        </div>

        {/* Username */}
        <div>
          <label htmlFor="profile-username" className="text-xs font-semibold uppercase tracking-wider mb-1.5 flex justify-between">
            <span>Username</span>
            <span style={{ color: 'var(--subtle)' }}>{name.length}/20</span>
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold" style={{ color: 'var(--tone-text)' }}>@</span>
            <input
              id="profile-username"
              data-ti=""
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ''))}
              maxLength={20}
              autoComplete="off"
              spellCheck={false}
              className="w-full h-11 rounded-xl pl-7 pr-3 text-sm"
              placeholder="yourname"
            />
          </div>
          <p className="text-xs mt-1 min-h-4" style={{ color: usernameError ? 'var(--danger)' : 'var(--success)' }}>
            {usernameError || (name !== initial.username ? 'Looks good' : '')}
          </p>
        </div>

        {/* Bio */}
        <div>
          <label htmlFor="profile-bio" className="text-xs font-semibold uppercase tracking-wider mb-1.5 flex justify-between">
            <span>Bio</span>
            <span style={{ color: bio.length >= BIO_MAX ? 'var(--danger)' : 'var(--subtle)' }}>{bio.length}/{BIO_MAX}</span>
          </label>
          <textarea
            id="profile-bio"
            data-ti=""
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, BIO_MAX))}
            rows={3}
            className="w-full rounded-xl px-3 py-2.5 text-sm resize-none"
            placeholder="Tell people what you are about"
          />
        </div>

        {/* Profile color */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: 'var(--tone-text)' }}>Profile color</span>
          <div className="flex flex-wrap gap-2.5" role="radiogroup" aria-label="Profile color">
            {PROFILE_ACCENTS.map((t) => {
              const [f, g] = TONES[t]
              const selected = t === accent
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={t}
                  onClick={() => setAccent(t)}
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white transition-transform hover:scale-110 active:scale-95"
                  style={{
                    background: `linear-gradient(135deg, ${f}, ${g})`,
                    boxShadow: selected ? `0 0 0 3px var(--surface), 0 0 0 5px ${g}` : `0 6px 12px -6px ${g}`,
                  }}
                >
                  {selected && <Check size={16} strokeWidth={3} />}
                </button>
              )
            })}
          </div>
        </div>

        {serverStored && (
          <p className="flex items-start gap-2 text-xs rounded-xl p-3" data-tp="" style={{ color: 'var(--ink-2)' }}>
            <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--tone-text)' }} />
            Saving asks your wallet for a free signature, which proves the profile is yours. It costs no gas.
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <Button type="button" variant="secondary" className="flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" className="flex-1" onClick={onSave} loading={saving} disabled={!canSave}>
            Save profile
          </Button>
        </div>
      </div>
    </Modal>
  )
}
