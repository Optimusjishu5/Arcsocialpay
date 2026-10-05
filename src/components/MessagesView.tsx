import { useState, useRef, useEffect } from 'react'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Plus, Send, ArrowLeft, Reply, Trash2, DollarSign, X,
  Check, CheckCheck, Clock, AlertCircle, MoreHorizontal
} from 'lucide-react'
import { isAddress } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { useArcAccount, useUsdcBalance, useSendUsdc, ARC_CHAIN_ID, USDC_ADDRESS } from '../hooks/useArcWallet'
import { appStore, useAppStore } from '../store/appStore'
import { Avatar } from './ui/Avatar'
import { Button } from './ui/Button'
import { Modal } from './ui/Modal'
import { TxSpinner } from './ui/TxStatusBadge'
import { formatAddress, formatChatTime, parseOnchainError, ZERO_ADDRESS, AMOUNT_REGEX, isSameAddress } from '../utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { Message, Conversation, PaymentMessage } from '../types/index'

function getBlockedRecipientReason(recipient: string, myAddress: string): string | null {
  const lower = recipient.toLowerCase()
  if (lower === ZERO_ADDRESS.toLowerCase()) return 'Cannot send to the zero address (0x000...000)'
  if (lower === USDC_ADDRESS.toLowerCase()) return 'Cannot send to the USDC contract address'
  if (lower === myAddress.toLowerCase()) return 'Cannot send to yourself'
  return null
}

interface Props {
  initialConvId?: string
}

export function MessagesView({ initialConvId }: Props) {
  const { address, isConnected } = useArcAccount()
  const { conversations, messages } = useAppStore()
  const [activeConvId, setActiveConvId] = useState<string | null>(initialConvId ?? null)
  const [search, setSearch] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to start messaging
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  const myConvs = conversations
    .filter((c) => c.participants.some((p) => isSameAddress(p, address!)))
    .filter((c) => {
      if (!search) return true
      const other = c.participants.find((p) => !isSameAddress(p, address)) ?? ''
      return other.toLowerCase().includes(search.toLowerCase())
    })

  const activeConv = activeConvId ? conversations.find((c) => c.id === activeConvId) ?? null : null

  // Mobile: show either list or chat
  const showList = !activeConvId
  const showChat = !!activeConvId

  return (
    <div className="flex h-[calc(100dvh-60px)] overflow-hidden">
      {/* Conversation List */}
      <div className={`flex flex-col border-r ${showChat ? 'hidden md:flex' : 'flex'} w-full md:w-80 flex-shrink-0`}
        style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="display font-semibold text-base" style={{ color: 'var(--ink)' }}>Messages</h2>
          <button onClick={() => setShowNewChat(true)}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)]"
            style={{ color: 'var(--accent)' }}>
            <Plus size={18} />
          </button>
        </div>
        {/* Search */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-2 h-9 px-3 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <Search size={14} style={{ color: 'var(--subtle)' }} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search conversations"
              className="flex-1 text-sm bg-transparent outline-none"
              style={{ color: 'var(--ink)' }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{ color: 'var(--subtle)' }}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {myConvs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
                <Send size={20} />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No conversations yet</p>
              <Button size="sm" onClick={() => setShowNewChat(true)}>Start a chat</Button>
            </div>
          ) : (
            myConvs.map((conv) => (
              <ConvItem
                key={conv.id}
                conv={conv}
                myAddress={address!}
                isActive={conv.id === activeConvId}
                onClick={() => { setActiveConvId(conv.id); appStore.markConversationRead(conv.id) }}
              />
            ))
          )}
        </div>
      </div>

      {/* Chat Panel */}
      <div className={`flex-1 flex flex-col ${showList ? 'hidden md:flex' : 'flex'}`}>
        {activeConv ? (
          <ChatPanel
            conv={activeConv}
            myAddress={address!}
            messages={messages[activeConv.id] ?? []}
            onBack={() => setActiveConvId(null)}
          />
        ) : (
          <div className="flex-1 hidden md:flex flex-col items-center justify-center gap-3"
            style={{ background: 'var(--bg)' }}>
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
              <Send size={28} />
            </div>
            <p className="font-medium" style={{ color: 'var(--muted)' }}>Select a conversation</p>
          </div>
        )}
      </div>

      {/* New Chat Modal */}
      <NewChatModal
        open={showNewChat}
        onClose={() => setShowNewChat(false)}
        myAddress={address!}
        onCreated={(convId) => { setShowNewChat(false); setActiveConvId(convId) }}
      />
    </div>
  )
}

// ── Conversation Item ──────────────────────────────────────────────────────

function ConvItem({ conv, myAddress, isActive, onClick }: {
  conv: Conversation
  myAddress: string
  isActive: boolean
  onClick: () => void
}) {
  const other = conv.participants.find((p) => !isSameAddress(p, myAddress)) ?? conv.participants[0]
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 w-full px-4 py-3 transition-colors text-left"
      style={{ background: isActive ? 'var(--surface-muted)' : 'transparent' }}
    >
      <Avatar address={other} size={44} showRing={isActive} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-0.5">
          <span className="font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
            {formatAddress(other)}
          </span>
          {conv.lastMessage && (
            <span className="text-xs flex-shrink-0" style={{ color: 'var(--subtle)' }}>
              {formatChatTime(conv.lastMessage.createdAt)}
            </span>
          )}
        </div>
        {conv.lastMessage && (
          <p className="text-xs truncate" style={{ color: 'var(--muted)' }}>
            {isSameAddress(conv.lastMessage.senderAddress, myAddress) ? 'You: ' : ''}
            {conv.lastMessage.paymentTx
              ? `Sent ${conv.lastMessage.paymentTx.amount} USDC`
              : conv.lastMessage.content}
          </p>
        )}
      </div>
      {conv.unreadCount > 0 && (
        <span className="w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
        </span>
      )}
    </button>
  )
}

// ── Chat Panel ─────────────────────────────────────────────────────────────

function ChatPanel({ conv, myAddress, messages, onBack }: {
  conv: Conversation
  myAddress: string
  messages: Message[]
  onBack: () => void
}) {
  const other = conv.participants.find((p) => !isSameAddress(p, myAddress)) ?? conv.participants[0]
  const [input, setInput] = useState('')
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [showPayModal, setShowPayModal] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Only auto-scroll when the user is already near the bottom, so reading
    // history isn't yanked away. Use instant scrolling + rAF to avoid smooth-
    // scroll jank on large histories.
    const el = scrollRef.current
    if (!el) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
      return
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    if (distanceFromBottom > 160) return
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
    })
  }, [messages.length])

  function sendMessage() {
    const text = input.trim()
    if (!text) return
    appStore.sendMessage(conv.id, myAddress, text, replyTo?.id)
    setInput('')
    setReplyTo(null)
  }

  function deleteMsg(id: string) {
    appStore.deleteMessageForMe(conv.id, id)
  }

  const visibleMessages = messages.filter((m) => !m.deletedForMe)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <button onClick={onBack} className="md:hidden p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-muted)]"
          style={{ color: 'var(--muted)' }}>
          <ArrowLeft size={18} />
        </button>
        <Avatar address={other} size={36} />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
            {formatAddress(other)}
          </div>
          <div className="mono text-xs truncate" style={{ color: 'var(--subtle)' }}>{other}</div>
        </div>
        <button
          onClick={() => setShowPayModal(true)}
          className="flex items-center gap-1.5 h-8 px-3 rounded-xl text-xs font-semibold transition-all"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          <DollarSign size={13} />
          Pay
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
        {visibleMessages.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Start the conversation</p>
          </div>
        )}
        {visibleMessages.map((msg) => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            isMine={isSameAddress(msg.senderAddress, myAddress)}
            allMessages={messages}
            onReply={() => setReplyTo(msg)}
            onDelete={() => deleteMsg(msg.id)}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-3 px-4 py-2 border-t"
          style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}>
          <Reply size={14} style={{ color: 'var(--accent)' }} />
          <p className="text-xs flex-1 truncate" style={{ color: 'var(--muted)' }}>
            Replying to: {replyTo.content.slice(0, 60)}
          </p>
          <button onClick={() => setReplyTo(null)} style={{ color: 'var(--muted)' }}><X size={14} /></button>
        </div>
      )}

      {/* Input */}
      <div className="flex items-end gap-2 px-4 py-3 flex-shrink-0"
        style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="flex-1 rounded-2xl px-4 py-2 min-h-[44px] max-h-28 overflow-hidden"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
            }}
            placeholder="Message..."
            rows={1}
            className="w-full text-sm bg-transparent outline-none resize-none"
            style={{ color: 'var(--ink)' }}
          />
        </div>
        <button
          onClick={sendMessage}
          disabled={!input.trim()}
          className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all disabled:opacity-40 active:scale-95"
          style={{ background: 'var(--accent)', color: '#fff' }}>
          <Send size={18} />
        </button>
      </div>

      {/* In-chat pay modal */}
      <InChatPayModal
        open={showPayModal}
        onClose={() => setShowPayModal(false)}
        convId={conv.id}
        myAddress={myAddress}
        recipient={other}
      />
    </div>
  )
}

// ── Message Bubble ─────────────────────────────────────────────────────────

function MsgStatus({ status, isMine }: { status: Message['status']; isMine: boolean }) {
  if (status === 'sending') return <Clock size={10} style={{ color: 'rgba(255,255,255,0.5)' }} />
  if (status === 'failed') return <AlertCircle size={10} style={{ color: 'var(--danger)' }} />
  return <CheckCheck size={10} style={{ color: isMine ? 'rgba(255,255,255,0.7)' : 'var(--muted)' }} />
}

function MessageBubble({ msg, isMine, allMessages, onReply, onDelete }: {
  msg: Message
  isMine: boolean
  allMessages: Message[]
  onReply: () => void
  onDelete: () => void
}) {
  const replyMsg = msg.replyToId ? allMessages.find((m) => m.id === msg.replyToId) : null

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} group`}>
      <div className={`max-w-[75%] ${isMine ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
        {replyMsg && (
          <div className="px-3 py-1.5 rounded-xl text-xs border-l-2 mb-0.5"
            style={{
              background: 'var(--surface-muted)',
              borderColor: 'var(--accent)',
              color: 'var(--muted)',
              maxWidth: '100%',
            }}>
            <div className="truncate">{replyMsg.content.slice(0, 60)}</div>
          </div>
        )}

        <div className="relative">
          {/* Payment card */}
          {msg.paymentTx ? (
            <PaymentBubble paymentTx={msg.paymentTx} isMine={isMine} />
          ) : (
            <div
              className="px-3 py-2 rounded-2xl relative"
              style={{
                background: isMine ? 'var(--accent)' : 'var(--surface-strong)',
                border: isMine ? 'none' : '1px solid var(--border)',
              }}
            >
              <p className="text-sm leading-relaxed"
                style={{ color: isMine ? '#fff' : 'var(--ink)' }}>
                {msg.content}
              </p>
              <div className={`flex items-center gap-1 mt-0.5 ${isMine ? 'justify-end' : 'justify-start'}`}>
                <span className="text-xs" style={{ color: isMine ? 'rgba(255,255,255,0.55)' : 'var(--subtle)' }}>
                  {formatChatTime(msg.createdAt)}
                </span>
                {isMine && <MsgStatus status={msg.status} isMine={isMine} />}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className={`absolute top-1/2 -translate-y-1/2 ${isMine ? 'right-full mr-1' : 'left-full ml-1'} opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5`}>
            <button onClick={onReply}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--surface-muted)]"
              style={{ color: 'var(--muted)' }}>
              <Reply size={13} />
            </button>
            <button onClick={onDelete}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[var(--danger-bg)]"
              style={{ color: 'var(--muted)' }}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function PaymentBubble({ paymentTx, isMine }: { paymentTx: PaymentMessage; isMine: boolean }) {
  const statusColor = paymentTx.status === 'confirmed' ? 'var(--success)' : paymentTx.status === 'failed' ? 'var(--danger)' : '#a16207'
  const explorerUrl = buildTxExplorerUrl(paymentTx.chainId || ARC_CHAIN_ID, paymentTx.txHash)

  return (
    <div className="rounded-2xl overflow-hidden min-w-[200px]"
      style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{ background: isMine ? 'var(--danger-bg)' : 'var(--success-bg)' }}>
          <DollarSign size={16} style={{ color: isMine ? 'var(--danger)' : 'var(--success)' }} />
        </div>
        <div>
          <div className="text-xs font-semibold" style={{ color: 'var(--ink)' }}>
            {isMine ? 'You sent' : 'Received'}
          </div>
          <div className="tabnum font-bold text-sm" style={{ color: 'var(--ink)' }}>
            {paymentTx.amount} USDC
          </div>
        </div>
      </div>
      <div className="px-3 pb-3 flex items-center justify-between">
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ color: statusColor, background: `${statusColor}18` }}>
          {paymentTx.status}
        </span>
        <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
          className="text-xs font-medium" style={{ color: 'var(--accent)' }}>
          View tx
        </a>
      </div>
    </div>
  )
}

// ── In-Chat Pay Modal ──────────────────────────────────────────────────────

function InChatPayModal({ open, onClose, convId, myAddress, recipient }: {
  open: boolean
  onClose: () => void
  convId: string
  myAddress: string
  recipient: string
}) {
  const { display: balanceDisplay, raw: balanceRaw, refetch } = useUsdcBalance(myAddress as `0x${string}`)
  const { send, hash, isPending, isConfirming, isSuccess, isError, error, reset } = useSendUsdc()
  const [amount, setAmount] = useState('')
  const [localError, setLocalError] = useState('')
  const [receiptFailed, setReceiptFailed] = useState(false)
  const pendingHashRef = useRef<string | null>(null)
  // Snapshot recipient/amount at handleSend time so the effects below don't
  // close over stale values if the user edits inputs while pending.
  const paySnapshotRef = useRef<{ amount: string; recipient: string; convId: string; myAddress: string } | null>(null)

  // Independent receipt read — isSuccess alone only means "receipt fetched".
  const { data: receipt, isError: isReceiptError } = useWaitForTransactionReceipt({ hash })

  // H1: record pending as soon as we have a hash (don't wait for confirmation).
  useEffect(() => {
    if (hash && pendingHashRef.current !== hash) {
      pendingHashRef.current = hash
      const snap = paySnapshotRef.current ?? { amount, recipient, convId, myAddress }
      const payTx: PaymentMessage = {
        txHash: hash,
        amount: snap.amount,
        sender: snap.myAddress,
        recipient: snap.recipient,
        status: 'pending',
        chainId: ARC_CHAIN_ID,
      }
      appStore.sendMessage(snap.convId, snap.myAddress, `Sent ${snap.amount} USDC`, undefined, payTx)
      refetch().catch(() => toast.error('Failed to refresh balance'))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hash])

  // H1: flip pending -> confirmed only on receipt.status === 'success', else failed.
  useEffect(() => {
    if (!hash) return
    const snapConvId = paySnapshotRef.current?.convId ?? convId
    if (receipt?.status === 'success') {
      appStore.updatePaymentMessageStatus(snapConvId, hash, 'confirmed')
      refetch().catch(() => toast.error('Failed to refresh balance'))
      setReceiptFailed(false)
      // defer non-setState calls to avoid cascade render warning
      setTimeout(() => { onClose(); reset(); setAmount(''); setLocalError(''); pendingHashRef.current = null; paySnapshotRef.current = null }, 0)
    } else if (receipt?.status === 'reverted' || isReceiptError) {
      appStore.updatePaymentMessageStatus(snapConvId, hash, 'failed')
      setReceiptFailed(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt, isReceiptError, hash, isSuccess])

  function handleSend() {
    // M4: block double-submit.
    if (isPending || isConfirming) return
    setLocalError('')
    setReceiptFailed(false)
    // M8: recipient + self checks (also guards zero / USDC contract).
    if (!isAddress(recipient)) { setLocalError('Invalid recipient address'); return }
    const blocked = getBlockedRecipientReason(recipient, myAddress)
    if (blocked) { setLocalError(blocked); return }
    // H3: strict format first (empty, negative, >6 decimals, non-numeric).
    const trimmed = amount.trim()
    if (!trimmed || !AMOUNT_REGEX.test(trimmed)) {
      if (!trimmed || isNaN(parseFloat(trimmed)) || parseFloat(trimmed) <= 0) {
        setLocalError('Enter a valid amount')
      } else {
        setLocalError('Too many decimal places (max 6)')
      }
      return
    }
    const n = parseFloat(trimmed)
    if (n <= 0) { setLocalError('Enter a valid amount'); return }
    const bal = Number(balanceRaw) / 1_000_000
    if (n > bal) { setLocalError('Insufficient balance'); return }
    paySnapshotRef.current = { amount: trimmed, recipient, convId, myAddress }
    try {
      void send(recipient as `0x${string}`, trimmed)
    } catch (e) {
      setLocalError(parseOnchainError(e))
    }
  }

  const baseErr = isError ? parseOnchainError(error) : ''
  const errMsg = localError || (receiptFailed ? 'Transaction failed onchain (reverted).' : baseErr)

  return (
    <Modal open={open} onClose={() => { if (!isPending && !isConfirming) { onClose(); reset(); setAmount(''); setLocalError('') } }} title="Send USDC in Chat">
      <div className="space-y-4">
        <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
          <Avatar address={recipient} size={36} />
          <div>
            <div className="text-xs font-medium" style={{ color: 'var(--muted)' }}>To</div>
            <div className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{formatAddress(recipient)}</div>
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>Amount</label>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>Bal: {balanceDisplay} USDC</span>
          </div>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            disabled={isPending || isConfirming}
            className="w-full h-12 rounded-xl px-4 text-xl tabnum font-bold outline-none focus:ring-2 focus:ring-[var(--focus)]"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
          />
        </div>
        {errMsg && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">{errMsg}</span>
          </div>
        )}
        {(isPending || isConfirming) ? (
          <div className="flex justify-center py-2">
            <TxSpinner text={isPending ? 'Confirm in wallet...' : 'Confirming...'} />
          </div>
        ) : (
          <Button className="w-full" size="lg" onClick={handleSend} disabled={!amount.trim() || isPending || isConfirming}>
            Send {amount || '0'} USDC
          </Button>
        )}
      </div>
    </Modal>
  )
}

// ── New Chat Modal ─────────────────────────────────────────────────────────

function NewChatModal({ open, onClose, myAddress, onCreated }: {
  open: boolean
  onClose: () => void
  myAddress: string
  onCreated: (convId: string) => void
}) {
  const [addr, setAddr] = useState('')
  const [err, setErr] = useState('')

  function start() {
    setErr('')
    if (!isAddress(addr)) { setErr('Enter a valid wallet address'); return }
    if (addr.toLowerCase() === myAddress.toLowerCase()) { setErr('Cannot chat with yourself'); return }
    if (addr.toLowerCase() === ZERO_ADDRESS.toLowerCase()) { setErr('Cannot chat with the zero address'); return }
    if (addr.toLowerCase() === USDC_ADDRESS.toLowerCase()) { setErr('Cannot chat with the USDC contract address'); return }
    appStore.ensureProfile(addr)
    const conv = appStore.getOrCreateConversation(myAddress, addr)
    onCreated(conv.id)
    setAddr('')
  }

  return (
    <Modal open={open} onClose={() => { onClose(); setAddr(''); setErr('') }} title="New Message">
      <div className="space-y-3">
        <input
          type="text"
          value={addr}
          onChange={(e) => setAddr(e.target.value.trim())}
          placeholder="Wallet address (0x...)"
          className="w-full h-11 rounded-xl px-3 text-sm mono outline-none focus:ring-2 focus:ring-[var(--focus)]"
          style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink)' }}
        />
        {err && <p className="text-sm" style={{ color: 'var(--danger)' }}>{err}</p>}
        <Button className="w-full" onClick={start}>Start Chat</Button>
      </div>
    </Modal>
  )
}
