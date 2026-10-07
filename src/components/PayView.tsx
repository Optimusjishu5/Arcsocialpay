import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowDownLeft, Copy, Check, ExternalLink, QrCode, AlertCircle, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { isAddress } from 'viem'
import { useWaitForTransactionReceipt } from 'wagmi'
import { toast } from 'sonner'
import { useArcAccount, useUsdcBalance, useSendUsdc, ARC_CHAIN_ID, USDC_ADDRESS } from '../hooks/useArcWallet'
import { useSocialPay } from '../hooks/useSocialPay'
import { appStore, useAppStore } from '../store/appStore'
import { Button } from './ui/Button'
import { TxStatusBadge, TxSpinner } from './ui/TxStatusBadge'
import { Avatar } from './ui/Avatar'
import { formatAddress, formatTimestamp, parseOnchainError, ZERO_ADDRESS, AMOUNT_REGEX, isSameAddress, maxSendableRaw, formatUsdcDisplay } from '../utils/format'
import { copyText } from '../utils/copy'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { NavView } from '../types/index'

// Keep 0.1 USDC back so the user can still pay gas (USDC is the gas token on Arc).
const GAS_RESERVE_RAW = 100_000n // 0.1 USDC in 6-decimal units

function isBlockedRecipient(recipient: string, myAddress: string): string | null {
  const lower = recipient.toLowerCase()
  if (lower === ZERO_ADDRESS.toLowerCase()) return 'Cannot send to the zero address (0x000...000)'
  if (lower === USDC_ADDRESS.toLowerCase()) return 'Cannot send to the USDC contract address'
  if (lower === myAddress.toLowerCase()) return 'Cannot send to your own address'
  return null
}

function formatMaxWithReserve(balance: bigint): string {
  // Exact bigint path (no Number/parseFloat): maxSendableRaw floors at 0.
  // formatUsdcDisplay is grouped DISPLAY-ONLY, so strip commas for <input>.
  const maxRaw = maxSendableRaw(balance, GAS_RESERVE_RAW)
  if (maxRaw <= 0n) return '0'
  const display = formatUsdcDisplay(maxRaw).replace(/,/g, '')
  // Trim trailing zeros for clean input (e.g. "1.50" -> "1.5", "1.00" -> "1").
  const trimmed = display.includes('.') ? display.replace(/\.?0+$/, '') : display
  return trimmed === '' ? '0' : trimmed
}

interface Props {
  initialMode?: 'send' | 'receive'
  initialRecipient?: string
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

export function PayView({ initialMode = 'send', initialRecipient, onNavigate: _onNavigate }: Props) {
  const [mode, setMode] = useState<'send' | 'receive'>(initialMode)
  const { address, isConnected, isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { display: balanceDisplay, raw: balanceRaw, refetch } = useUsdcBalance(address)
  const { txHistory } = useAppStore()

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100dvh-120px)] gap-4 px-6">
        <p className="text-base font-medium text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to send or receive USDC
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  const myTxs = txHistory.filter((t) =>
    isSameAddress(t.fromAddress, address) || isSameAddress(t.toAddress, address)
  )

  return (
    <div className="flex flex-col gap-4 px-4 pt-4 pb-8 max-w-lg mx-auto">
      {/* Tab switcher */}
      <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'var(--surface-muted)' }}>
        {(['send', 'receive'] as const).map((m) => (
          <button key={m} onClick={() => setMode(m)}
            className="flex-1 h-9 rounded-lg font-semibold text-sm capitalize transition-all"
            style={{
              background: mode === m ? 'var(--surface-strong)' : 'transparent',
              color: mode === m ? 'var(--ink)' : 'var(--muted)',
              boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>
            {m === 'send' ? 'Send USDC' : 'Receive USDC'}
          </button>
        ))}
      </div>

      {!isArcChain && (
        <div className="flex items-center gap-3 p-3 rounded-xl"
          style={{ background: 'var(--danger-bg)', border: '1px solid var(--danger)' }}>
          <AlertCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} />
          <span className="text-sm flex-1" style={{ color: 'var(--danger)' }}>
            Switch to Arc Mainnet to send USDC
          </span>
          <Button size="sm" variant="danger" onClick={switchToArc} loading={isSwitching}>
            Switch
          </Button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {mode === 'send' ? (
          <motion.div key="send"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ duration: 0.15 }}>
            <SendForm balance={balanceRaw} balanceDisplay={balanceDisplay} onSuccess={() => { refetch().catch(() => toast.error('Failed to refresh balance')) }} myAddress={address!} initialRecipient={initialRecipient} />
          </motion.div>
        ) : (
          <motion.div key="receive"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.15 }}>
            <ReceiveCard address={address!} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Transaction History */}
      {myTxs.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Transaction History</h3>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {myTxs.map((tx) => {
              const isSent = isSameAddress(tx.fromAddress, address)
              return (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{
                      background: isSent ? 'var(--danger-bg)' : 'var(--success-bg)',
                      color: isSent ? 'var(--danger)' : 'var(--success)',
                    }}>
                    {isSent ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        {isSent ? `To ${formatAddress(tx.toAddress)}` : `From ${formatAddress(tx.fromAddress)}`}
                      </span>
                      <TxStatusBadge status={tx.status} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs mono" style={{ color: 'var(--muted)' }}>
                        {tx.txHash.slice(0, 10)}...
                      </span>
                      <span className="text-xs" style={{ color: 'var(--subtle)' }}>
                        {formatTimestamp(tx.timestamp)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabnum font-semibold text-sm"
                      style={{ color: isSent ? 'var(--danger)' : 'var(--success)' }}>
                      {isSent ? '-' : '+'}{tx.amount}
                    </span>
                    <a href={buildTxExplorerUrl(ARC_CHAIN_ID, tx.txHash)} target="_blank" rel="noopener noreferrer"
                      className="p-1 rounded hover:bg-[var(--surface-muted)] transition-colors"
                      style={{ color: 'var(--muted)' }}>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Send Form ──────────────────────────────────────────────────────────────

function SendForm({
  balance, balanceDisplay, onSuccess, myAddress, initialRecipient,
}: {
  balance: bigint
  balanceDisplay: string
  onSuccess: () => void
  myAddress: string
  initialRecipient?: string
}) {
  const [recipient, setRecipient] = useState(() =>
    initialRecipient && isAddress(initialRecipient) ? initialRecipient : '',
  )
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<'form' | 'preview' | 'done'>('form')
  const [localError, setLocalError] = useState('')
  const [receiptFailed, setReceiptFailed] = useState(false)
  const pendingRecordedRef = useRef<Set<string>>(new Set())
  // Snapshot recipient/amount/note at handleSend time so hash effects don't
  // close over stale values if the user edits inputs while pending.
  const sendSnapshotRef = useRef<{ recipient: string; amount: string; note: string; fromAddress: string } | null>(null)
  const { switchToArc, isSwitching } = useArcAccount()

  // Prefill from ?pay= link when it arrives/changes.
  useEffect(() => {
    if (initialRecipient && isAddress(initialRecipient)) {
      setRecipient(initialRecipient)
    }
  }, [initialRecipient])

  const {
    send, hash, isPending, isConfirming, isSuccess, isError, error, explorerUrl, isWrongChain, reset,
  } = useSendUsdc()

  // ArcSocialPay contract path — active once NEXT_PUBLIC_SOCIAL_PAY_ADDRESS
  // is set (post Remix deployment). Direct transfers stay the fallback.
  const sp = useSocialPay()
  const useContract = sp.isConfigured
  const activeHash = useContract ? sp.actionHash : hash

  // Independent receipt read: useSendUsdc.isSuccess only means "receipt fetched",
  // not "receipt succeeded". We gate confirmed on data.status === 'success'.
  // Direct-path only; the contract path reads sp.actionReceipt instead.
  const { data: receipt, isError: isReceiptError } = useWaitForTransactionReceipt({ hash })
  const activeReceipt = useContract ? sp.actionReceipt : receipt
  const activeExplorerUrl = useContract ? sp.explorerUrl : explorerUrl

  // H1: record pending as soon as we have a hash.
  useEffect(() => {
    if (activeHash && !pendingRecordedRef.current.has(activeHash)) {
      pendingRecordedRef.current.add(activeHash)
      const snap = sendSnapshotRef.current ?? { recipient, amount, note, fromAddress: myAddress }
      try {
        appStore.addTxRecord({
          txHash: activeHash,
          chainId: ARC_CHAIN_ID,
          direction: 'sent',
          amount: snap.amount,
          fromAddress: snap.fromAddress,
          toAddress: snap.recipient,
          status: 'pending',
          timestamp: Date.now(),
          note: snap.note,
        })
      } catch {
        // store is best-effort; onchain state is source of truth
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeHash])

  // H1: only mark confirmed when receipt.status === 'success'; mark failed otherwise.
  useEffect(() => {
    if (!activeHash) return
    if (activeReceipt?.status === 'success') {
      appStore.updateTxRecord(activeHash, { status: 'confirmed' })
      onSuccess()
      setReceiptFailed(false)
      setTimeout(() => setStage('done'), 0)
    } else if (activeReceipt?.status === 'reverted' || (!useContract && (isSuccess && receipt && receipt.status !== 'success'))) {
      appStore.updateTxRecord(activeHash, { status: 'failed' })
      setReceiptFailed(true)
    } else if (!useContract && isReceiptError && activeHash) {
      appStore.updateTxRecord(activeHash, { status: 'failed' })
      setReceiptFailed(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeReceipt, activeHash, useContract, receipt, isSuccess, isReceiptError])

  function validateAndPreview() {
    setLocalError('')
    setReceiptFailed(false)
    if (!isAddress(recipient)) {
      setLocalError('Enter a valid Arc address (0x...)')
      return
    }
    const blocked = isBlockedRecipient(recipient, myAddress)
    if (blocked) {
      setLocalError(blocked)
      return
    }
    const trimmed = amount.trim()
    if (!trimmed || !AMOUNT_REGEX.test(trimmed)) {
      // Covers empty, negative, dust with >6 decimals, and non-numeric.
      if (!trimmed || isNaN(parseFloat(trimmed)) || parseFloat(trimmed) <= 0) {
        setLocalError('Enter a valid amount')
      } else {
        setLocalError('Too many decimal places (max 6)')
      }
      return
    }
    const amountNum = parseFloat(trimmed)
    if (amountNum <= 0) {
      setLocalError('Enter a valid amount')
      return
    }
    const balanceUsdc = Number(balance) / 1_000_000
    if (amountNum > balanceUsdc) {
      setLocalError(`Insufficient balance. You have ${balanceDisplay} USDC.`)
      return
    }
    setStage('preview')
  }

  function handleSend() {
    // M4: guard against double-submit.
    if (isPending || isConfirming || sp.isBusy) return
    setLocalError('')
    const trimmed = amount.trim()
    if (!trimmed || !AMOUNT_REGEX.test(trimmed)) {
      setLocalError('Enter a valid amount (max 6 decimals)')
      return
    }
    const blocked = isBlockedRecipient(recipient, myAddress)
    if (blocked) {
      setLocalError(blocked)
      return
    }
    // Contract path: approve (if needed) then ArcSocialPay.pay(recipient, raw, note).
    // Receipt gating + tx records reuse the shared activeHash/activeReceipt effects above.
    if (useContract) {
      sendSnapshotRef.current = { recipient, amount: trimmed, note, fromAddress: myAddress }
      try {
        void sp.requestPay(recipient, trimmed, note)
      } catch (e) {
        setLocalError(parseOnchainError(e))
      }
      return
    }
    if (isWrongChain) {
      setLocalError('Please switch to Arc Mainnet first — your details are preserved.')
      toast.error('Switch to Arc Mainnet first, then confirm again.')
      return
    }
    sendSnapshotRef.current = { recipient, amount: trimmed, note, fromAddress: myAddress }
    try {
      void send(recipient as `0x${string}`, trimmed)
    } catch (e) {
      setLocalError(parseOnchainError(e))
    }
  }

  function handleSwitchChain() {
    // M3: explicit switch that preserves form state (no send, no reset).
    toast.message('Switching to Arc Mainnet — your payment details are kept.')
    switchToArc()
  }

  function handleReset() {
    setRecipient('')
    setAmount('')
    setNote('')
    setLocalError('')
    setReceiptFailed(false)
    pendingRecordedRef.current.clear()
    sendSnapshotRef.current = null
    setStage('form')
    reset()
    sp.reset()
  }

  if (stage === 'done') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl p-6 text-center"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'var(--success-bg)', color: 'var(--success)' }}>
          <Check size={28} />
        </div>
        <h3 className="display font-bold text-xl mb-1" style={{ color: 'var(--ink)' }}>Sent!</h3>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          {amount} USDC sent to {formatAddress(recipient)}
        </p>
        {activeExplorerUrl && (
          <a href={activeExplorerUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium mb-6"
            style={{ color: 'var(--accent)' }}>
            <ExternalLink size={14} />
            View on Arc Explorer
          </a>
        )}
        <Button onClick={handleReset} className="w-full">Send Another</Button>
      </motion.div>
    )
  }

  if (stage === 'preview') {
    const isProcessing = useContract ? sp.isBusy : (isPending || isConfirming)
    const baseErr = isError ? parseOnchainError(error) : ''
    const contractErr = useContract && sp.error ? parseOnchainError(sp.error) : ''
    const receiptErr = receiptFailed || activeReceipt?.status === 'reverted'
      ? 'Transaction failed onchain (reverted). Your payment was not sent.'
      : ''
    const errMsg = localError || receiptErr || contractErr || baseErr
    const busyText = useContract
      ? sp.status === 'approving'
        ? 'Approve in wallet...'
        : sp.status === 'sending'
          ? 'Confirm in wallet...'
          : 'Confirming on chain...'
      : isPending
        ? 'Confirm in wallet...'
        : 'Confirming on chain...'

    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Confirm Payment</h3>
          {!isProcessing && (
            <button onClick={() => setStage('form')} className="p-1 rounded" style={{ color: 'var(--muted)' }}>
              <X size={16} />
            </button>
          )}
        </div>
        <div className="p-4 space-y-3">
          <PreviewRow label="To">
            <div className="flex items-center gap-2">
              <Avatar address={recipient} size={24} />
              <span className="mono text-sm" style={{ color: 'var(--ink)' }}>{formatAddress(recipient)}</span>
            </div>
          </PreviewRow>
          <PreviewRow label="Amount">
            <span className="tabnum font-semibold text-base" style={{ color: 'var(--ink)' }}>
              {amount} USDC
            </span>
          </PreviewRow>
          <PreviewRow label="Network">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Arc Mainnet</span>
          </PreviewRow>
          <PreviewRow label="Gas">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Paid in USDC</span>
          </PreviewRow>
          {useContract && (
            <PreviewRow label="Route">
              <span className="text-sm" style={{ color: 'var(--ink-2)' }}>ArcSocialPay contract</span>
            </PreviewRow>
          )}
          {note && <PreviewRow label="Note"><span className="text-sm" style={{ color: 'var(--ink-2)' }}>{note}</span></PreviewRow>}

          {errMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm">{errMsg}</span>
            </div>
          )}
          {localError === '' && isWrongChain && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm">Wrong network — switch to Arc Mainnet first. Your recipient and amount are preserved.</span>
            </div>
          )}
        </div>
        <div className="p-4 pt-0">
          {isProcessing ? (
            <div className="flex items-center justify-center h-12">
              <TxSpinner text={busyText} />
            </div>
          ) : isWrongChain ? (
            <Button className="w-full" onClick={handleSwitchChain} loading={isSwitching}>
              Switch to Arc Mainnet
            </Button>
          ) : (
            <Button className="w-full" onClick={handleSend} disabled={useContract ? sp.isBusy : (isPending || isConfirming)}>
              Confirm & Send
            </Button>
          )}
        </div>
      </motion.div>
    )
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Send USDC</h3>
      </div>
      <div className="p-4 space-y-4">
        {/* Recipient */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Recipient Address
          </label>
          <input
            type="text"
            value={recipient}
            onChange={(e) => setRecipient(e.target.value.trim())}
            placeholder="0x..."
            className="w-full h-11 rounded-xl px-3 text-sm mono outline-none transition-shadow focus:ring-2 focus:ring-[var(--focus)]"
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
        </div>

        {/* Amount */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>
              Amount
            </label>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>
              Balance: <span className="tabnum font-medium">{balanceDisplay}</span> USDC
            </span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="w-full h-14 rounded-xl pl-4 pr-20 text-xl tabnum font-semibold outline-none transition-shadow focus:ring-2 focus:ring-[var(--focus)]"
              style={{
                background: 'var(--surface-muted)',
                border: '1px solid var(--border)',
                color: 'var(--ink)',
              }}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
              <button
                onClick={() => {
                  const max = formatMaxWithReserve(balance)
                  setAmount(max)
                  setLocalError('')
                }}
                className="text-xs font-semibold px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                MAX
              </button>
              <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>
          </div>
          <p className="text-xs mt-1.5" style={{ color: 'var(--subtle)' }}>
            MAX leaves 0.1 USDC reserved for gas.
          </p>
          {/* Quick amounts */}
          <div className="flex gap-2 mt-2">
            {['1', '5', '10', '25'].map((v) => (
              <button key={v} onClick={() => setAmount(v)}
                className="flex-1 h-8 rounded-lg text-xs font-medium transition-colors"
                style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)', color: 'var(--ink-2)' }}>
                ${v}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What's this for?"
            maxLength={100}
            className="w-full h-11 rounded-xl px-3 text-sm outline-none transition-shadow focus:ring-2 focus:ring-[var(--focus)]"
            style={{
              background: 'var(--surface-muted)',
              border: '1px solid var(--border)',
              color: 'var(--ink)',
            }}
          />
        </div>

        {localError && (
          <div className="flex items-start gap-2 p-3 rounded-xl"
            style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span className="text-sm">{localError}</span>
          </div>
        )}

        <Button className="w-full" size="lg" onClick={validateAndPreview}>
          Review Payment
        </Button>
      </div>
    </div>
  )
}

// ── Receive Card ────────────────────────────────────────────────────────────

export function buildPayRequestUrl(address: string): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}?pay=${address}`
}

function ReceiveCard({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const payLink = buildPayRequestUrl(address)

  function copy() {
    void copyText(address, 'Address copied').then((ok) => {
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }
    })
  }

  function copyLink() {
    void copyText(payLink, 'Payment link copied').then((ok) => {
      if (ok) {
        setLinkCopied(true)
        setTimeout(() => setLinkCopied(false), 1500)
      }
    })
  }

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Receive USDC</h3>
      </div>
      <div className="p-6 flex flex-col items-center gap-4">
        {/* QR placeholder */}
        <div className="w-44 h-44 rounded-2xl flex items-center justify-center"
          style={{ background: 'var(--surface-muted)', border: '2px dashed var(--border-strong)' }}>
          <div className="flex flex-col items-center gap-2" style={{ color: 'var(--muted)' }}>
            <QrCode size={48} />
            <span className="text-xs">QR Code</span>
          </div>
        </div>

        <div className="w-full">
          <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Your Wallet Address
          </label>
          <div className="flex items-center gap-2 p-3 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <span className="mono text-xs flex-1 break-all" style={{ color: 'var(--ink-2)' }}>{address}</span>
            <button onClick={copy} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ background: 'var(--surface-strong)', color: copied ? 'var(--success)' : 'var(--muted)' }}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="w-full">
          <label className="text-xs font-semibold uppercase tracking-wider mb-1.5 block" style={{ color: 'var(--muted)' }}>
            Payment Request Link
          </label>
          <div className="flex items-center gap-2 p-3 rounded-xl"
            style={{ background: 'var(--surface-muted)', border: '1px solid var(--border)' }}>
            <span className="text-xs flex-1 truncate" style={{ color: 'var(--ink-2)' }}>{payLink}</span>
            <button onClick={copyLink} className="p-1.5 rounded-lg transition-colors flex-shrink-0"
              style={{ background: 'var(--surface-strong)', color: linkCopied ? 'var(--success)' : 'var(--muted)' }}>
              {linkCopied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: 'var(--subtle)' }}>
            Share this link to let anyone send you USDC directly on Arc
          </p>
        </div>
      </div>
    </div>
  )
}

function PreviewRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: '1px solid var(--border)' }}>
      <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>{label}</span>
      {children}
    </div>
  )
}
