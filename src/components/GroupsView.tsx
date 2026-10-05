import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Hash, Lock, Globe, Users, Send, ArrowLeft, Settings, Crown } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount } from '../hooks/useArcWallet'
import { appStore, useAppStore } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { EmptyState } from './ui/EmptyState'
import { formatAddress, formatTimestamp, getAvatarColor } from '../utils/format'
import type { Group } from '../types'

export function GroupsView() {
  const { address, isConnected } = useArcAccount()
  const { groups, messages } = useAppStore()
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to join groups and channels
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  const myGroups = groups.filter((g) => g.memberAddresses.includes(address!))
  const discoverGroups = groups.filter((g) => !g.memberAddresses.includes(address!))
  const activeGroup = activeGroupId ? groups.find((g) => g.id === activeGroupId) ?? null : null

  return (
    <div className="flex h-[calc(100dvh-60px)] overflow-hidden">
      {/* Sidebar */}
      <div className={`flex flex-col border-r w-full md:w-72 flex-shrink-0 ${activeGroupId ? 'hidden md:flex' : 'flex'}`}
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="display font-semibold text-base" style={{ color: 'var(--ink)' }}>Groups</h2>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus size={14} />
            New
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {myGroups.length > 0 && (
            <>
              <div className="px-4 py-2">
                <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--subtle)' }}>My Groups</span>
              </div>
              {myGroups.map((g) => (
                <GroupItem key={g.id} group={g} isActive={activeGroupId === g.id}
                  onClick={() => setActiveGroupId(g.id)} />
              ))}
            </>
          )}

          {discoverGroups.length > 0 && (
            <>
              <div className="px-4 py-2 mt-2">
                <span className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--subtle)' }}>Discover</span>
              </div>
              {discoverGroups.map((g) => (
                <GroupItem key={g.id} group={g} isActive={false}
                  onClick={() => setActiveGroupId(g.id)} />
              ))}
            </>
          )}

          {groups.length === 0 && (
            <EmptyState
              icon={<Users size={24} />}
              title="No groups yet"
              description="Create or join a group to get started"
            />
          )}
        </div>
      </div>

      {/* Group content panel */}
      <div className={`flex-1 flex flex-col ${!activeGroupId ? 'hidden md:flex' : 'flex'}`}>
        {activeGroup ? (
          <GroupPanel
            group={activeGroup}
            myAddress={address!}
            messages={(activeGroup
              ? (() => {
                  const conv = appStore.getState().conversations.find(
                    (c) => c.isGroup && c.groupId === activeGroup.id
                  )
                  return conv ? (appStore.getState().messages[conv.id] ?? []) : []
                })()
              : [])}
            convId={(() => {
              const conv = appStore.getState().conversations.find(
                (c) => c.isGroup && c.groupId === activeGroup.id
              )
              return conv?.id ?? ''
            })()}
            onBack={() => setActiveGroupId(null)}
          />
        ) : (
          <div className="hidden md:flex flex-1 flex-col items-center justify-center gap-3" style={{ background: 'var(--bg)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              <Hash size={28} />
            </div>
            <p className="font-medium" style={{ color: 'var(--muted)' }}>Select a group</p>
          </div>
        )}
      </div>

      <CreateGroupModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        myAddress={address!}
        onCreated={(id) => { setShowCreate(false); setActiveGroupId(id) }}
      />
    </div>
  )
}

// ── Group Item ─────────────────────────────────────────────────────────────

function GroupItem({ group, isActive, onClick }: { group: Group; isActive: boolean; onClick: () => void }) {
  const color = getAvatarColor(group.avatarSeed)
  return (
    <button onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3 transition-colors text-left"
      style={{ background: isActive ? 'var(--surface-muted)' : 'transparent' }}>
      <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 font-bold text-sm"
        style={{ background: color, color: '#fff' }}>
        {group.name.slice(0, 2).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>{group.name}</span>
          {group.isPrivate ? <Lock size={11} style={{ color: 'var(--subtle)' }} /> : <Globe size={11} style={{ color: 'var(--subtle)' }} />}
        </div>
        <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
          <Users size={11} />
          {group.memberAddresses.length} members
        </div>
      </div>
    </button>
  )
}

// ── Group Panel ────────────────────────────────────────────────────────────

function GroupPanel({ group, myAddress, messages, convId, onBack }: {
  group: Group
  myAddress: string
  messages: import('../types').Message[]
  convId: string
  onBack: () => void
}) {
  const [input, setInput] = useState('')
  const [showInfo, setShowInfo] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const isMember = group.memberAddresses.includes(myAddress)
  const isAdmin = group.adminAddresses.includes(myAddress)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  function sendMessage() {
    const text = input.trim()
    if (!text || !isMember || !convId) return
    appStore.sendMessage(convId, myAddress, text)
    setInput('')
  }

  function join() {
    appStore.joinGroup(group.id, myAddress)
    // Create conversation if needed
    const existingConv = appStore.getState().conversations.find((c) => c.isGroup && c.groupId === group.id)
    if (!existingConv) {
      appStore.createGroup(group.ownerAddress, group.name, group.description, group.type, group.isPrivate)
    }
  }

  function leave() {
    appStore.leaveGroup(group.id, myAddress)
    onBack()
  }

  const color = getAvatarColor(group.avatarSeed)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button onClick={onBack} className="md:hidden p-1.5 rounded-lg" style={{ color: 'var(--muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs flex-shrink-0"
          style={{ background: color, color: '#fff' }}>
          {group.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{group.name}</span>
            {group.isPrivate ? <Lock size={12} style={{ color: 'var(--subtle)' }} /> : <Globe size={12} style={{ color: 'var(--subtle)' }} />}
          </div>
          <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--muted)' }}>
            <Users size={11} />
            {group.memberAddresses.length} members
          </div>
        </div>
        <button onClick={() => setShowInfo(!showInfo)}
          className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          <Settings size={16} />
        </button>
      </div>

      {/* Info Panel */}
      {showInfo && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          className="overflow-hidden border-b"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
          <div className="px-4 py-3 space-y-2">
            {group.description && (
              <p className="text-sm" style={{ color: 'var(--ink-2)' }}>{group.description}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {group.memberAddresses.slice(0, 6).map((addr) => (
                <div key={addr} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                  style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
                  <Avatar address={addr} size={16} />
                  <span style={{ color: 'var(--ink-2)' }}>{formatAddress(addr)}</span>
                  {group.adminAddresses.includes(addr) && <Crown size={10} style={{ color: '#a16207' }} />}
                </div>
              ))}
              {group.memberAddresses.length > 6 && (
                <div className="flex items-center px-2 py-1 text-xs" style={{ color: 'var(--muted)' }}>
                  +{group.memberAddresses.length - 6} more
                </div>
              )}
            </div>
            {isMember && !group.ownerAddress.includes(myAddress) && (
              <Button size="sm" variant="ghost" onClick={leave} className="text-[var(--danger)]">
                Leave {group.type === 'channel' ? 'Channel' : 'Group'}
              </Button>
            )}
          </div>
        </motion.div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {messages.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              {isMember ? 'No messages yet. Say something!' : 'Join this group to see messages.'}
            </p>
          </div>
        )}
        {messages.filter((m) => !m.deletedForMe).map((msg) => {
          const isMine = msg.senderAddress === myAddress
          return (
            <div key={msg.id} className={`flex gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
              <Avatar address={msg.senderAddress} size={32} />
              <div className={`max-w-[70%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                {!isMine && (
                  <span className="text-xs font-medium px-1" style={{ color: 'var(--muted)' }}>
                    {formatAddress(msg.senderAddress)}
                  </span>
                )}
                <div className="px-3 py-2 rounded-2xl"
                  style={{
                    background: isMine ? 'var(--accent)' : 'var(--surface-strong)',
                    border: isMine ? 'none' : '1px solid var(--border)',
                    color: isMine ? '#fff' : 'var(--ink)',
                  }}>
                  <p className="text-sm">{msg.content}</p>
                  <p className="text-xs mt-0.5 opacity-60">{formatTimestamp(msg.createdAt)}</p>
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input / Join prompt */}
      {isMember ? (
        <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
          style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          {group.type === 'channel' && !isAdmin ? (
            <p className="text-sm text-center flex-1" style={{ color: 'var(--muted)' }}>
              Only admins can post in channels
            </p>
          ) : (
            <>
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') sendMessage() }}
                placeholder={`Message ${group.name}...`}
                className="flex-1 h-11 rounded-xl px-4 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
              />
              <button onClick={sendMessage} disabled={!input.trim()}
                className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-40"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                <Send size={18} />
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          <Button className="w-full" onClick={join}>
            Join {group.type === 'channel' ? 'Channel' : 'Group'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Create Group Modal ─────────────────────────────────────────────────────

function CreateGroupModal({ open, onClose, myAddress, onCreated }: {
  open: boolean
  onClose: () => void
  myAddress: string
  onCreated: (id: string) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<Group['type']>('group')
  const [isPrivate, setIsPrivate] = useState(false)
  const [err, setErr] = useState('')

  function create() {
    setErr('')
    if (!name.trim()) { setErr('Name is required'); return }
    const group = appStore.createGroup(myAddress, name.trim(), description.trim(), type, isPrivate)
    setName('')
    setDescription('')
    onCreated(group.id)
  }

  return (
    <Modal open={open} onClose={() => { onClose(); setName(''); setDescription(''); setErr('') }} title="Create Group or Channel">
      <div className="space-y-4">
        {/* Type selector */}
        <div className="flex gap-2">
          {(['group', 'channel'] as const).map((t) => (
            <button key={t} onClick={() => setType(t)}
              className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl text-sm font-semibold capitalize transition-all"
              style={{
                background: type === t ? 'var(--accent)' : 'var(--surface-muted)',
                color: type === t ? '#fff' : 'var(--ink-2)',
                border: `1px solid ${type === t ? 'var(--accent)' : 'var(--border)'}`,
              }}>
              {t === 'group' ? <Users size={15} /> : <Hash size={15} />}
              {t}
            </button>
          ))}
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={type === 'channel' ? 'Channel name' : 'Group name'}
            className="w-full h-11 rounded-xl px-3 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
        </div>

        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this group about?"
            rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--focus)] resize-none"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }} />
        </div>

        {/* Privacy toggle */}
        <label className="flex items-center gap-3 cursor-pointer">
          <div
            onClick={() => setIsPrivate(!isPrivate)}
            className="relative w-11 h-6 rounded-full transition-colors cursor-pointer"
            style={{ background: isPrivate ? 'var(--accent)' : 'var(--border-strong)' }}>
            <div className="absolute top-1 w-4 h-4 bg-white rounded-full transition-transform"
              style={{ left: isPrivate ? '22px' : '4px' }} />
          </div>
          <div>
            <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Private</span>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {isPrivate ? 'Only invited members can join' : 'Anyone can find and join'}
            </p>
          </div>
        </label>

        {err && <p className="text-sm" style={{ color: 'var(--danger)' }}>{err}</p>}
        <Button className="w-full" onClick={create} disabled={!name.trim()}>
          Create {type === 'channel' ? 'Channel' : 'Group'}
        </Button>
      </div>
    </Modal>
  )
}
