import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowUpRight, ArrowDownLeft, Copy, Check, ExternalLink, QrCode, AlertCircle, X } from 'lucide-react'
import { ConnectKitButton } from 'connectkit'
import { isAddress } from 'viem'
import { useArcAccount, useUsdcBalance, useSendUsdc, ARC_CHAIN_ID } from '../hooks/useArcWallet'
import { appStore, useAppStore } from '../store/appStore'
import { Button } from './ui/Button'
import { TxStatusBadge, TxSpinner } from './ui/TxStatusBadge'
import { Avatar } from './ui/Avatar'
import { formatAddress, formatTimestamp, parseOnchainError } from '../utils/format'
import { buildTxExplorerUrl } from '@/onchain-facts'
import type { NavView } from '../types'

interface Props {
  initialMode?: 'send' | 'receive'
  onNavigate: (view: NavView, extra?: Record<string, string>) => void
}

export function PayView({ initialMode = 'send', onNavigate: _onNavigate }: Props) {
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
    t.fromAddress === address || t.toAddress === address
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
            Switch to Arc Testnet to send USDC
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
            <SendForm balance={balanceRaw} balanceDisplay={balanceDisplay} onSuccess={() => { void refetch() }} myAddress={address!} />
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
              const isSent = tx.fromAddress === address
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
  balance, balanceDisplay, onSuccess, myAddress,
}: {
  balance: bigint
  balanceDisplay: string
  onSuccess: () => void
  myAddress: string
}) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [stage, setStage] = useState<'form' | 'preview' | 'done'>('form')
  const [localError, setLocalError] = useState('')

  const {
    send, hash, isPending, isConfirming, isSuccess, isError, error, explorerUrl, isWrongChain, reset,
  } = useSendUsdc()

  useEffect(() => {
    if (isSuccess && hash) {
      appStore.addTxRecord({
        txHash: hash,
        chainId: ARC_CHAIN_ID,
        direction: 'sent',
        amount,
        fromAddress: myAddress,
        toAddress: recipient,
        status: 'confirmed',
        timestamp: Date.now(),
        note,
      })
      onSuccess()
      setTimeout(() => setStage('done'), 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSuccess, hash])

  function validateAndPreview() {
    setLocalError('')
    if (!isAddress(recipient)) {
      setLocalError('Enter a valid Ethereum address (0x...)')
      return
    }
    if (recipient.toLowerCase() === myAddress.toLowerCase()) {
      setLocalError('Cannot send to your own address')
      return
    }
    const amountNum = parseFloat(amount)
    if (!amount || isNaN(amountNum) || amountNum <= 0) {
      setLocalError('Enter a valid amount')
      return
    }
    const balanceUsdc = Number(balance) / 1_000_000
    if (amountNum > balanceUsdc) {
      setLocalError(`Insufficient balance. You have ${balanceDisplay} USDC.`)
      return
    }
    if (!/^\d+(\.\d{1,6})?$/.test(amount)) {
      setLocalError('Too many decimal places (max 6)')
      return
    }
    setStage('preview')
  }

  function handleSend() {
    setLocalError('')
    void send(recipient as `0x${string}`, amount)
  }

  function handleReset() {
    setRecipient('')
    setAmount('')
    setNote('')
    setLocalError('')
    setStage('form')
    reset()
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
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer"
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
    const isProcessing = isPending || isConfirming
    const errMsg = isError ? parseOnchainError(error) : ''

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
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Arc Testnet</span>
          </PreviewRow>
          <PreviewRow label="Gas">
            <span className="text-sm" style={{ color: 'var(--ink-2)' }}>Paid in USDC</span>
          </PreviewRow>
          {note && <PreviewRow label="Note"><span className="text-sm" style={{ color: 'var(--ink-2)' }}>{note}</span></PreviewRow>}

          {errMsg && (
            <div className="flex items-start gap-2 p-3 rounded-xl"
              style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <span className="text-sm">{errMsg}</span>
            </div>
          )}
        </div>
        <div className="p-4 pt-0">
          {isProcessing ? (
            <div className="flex items-center justify-center h-12">
              <TxSpinner text={isPending ? 'Confirm in wallet...' : 'Confirming on chain...'} />
            </div>
          ) : isWrongChain ? (
            <Button className="w-full" onClick={() => { void send(recipient as `0x${string}`, amount) }}>
              Switch & Send
            </Button>
          ) : (
            <Button className="w-full" onClick={handleSend}>
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
                  const max = (Number(balance) / 1_000_000).toFixed(6).replace(/\.?0+$/, '')
                  setAmount(max)
                }}
                className="text-xs font-semibold px-2 py-1 rounded-lg transition-colors hover:opacity-80"
                style={{ background: 'var(--accent)', color: '#fff' }}>
                MAX
              </button>
              <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
            </div>
          </div>
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

function ReceiveCard({ address }: { address: string }) {
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const payLink = `${window.location.origin}?pay=${address}`

  function copy() {
    void navigator.clipboard.writeText(address)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  function copyLink() {
    void navigator.clipboard.writeText(payLink)
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
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
