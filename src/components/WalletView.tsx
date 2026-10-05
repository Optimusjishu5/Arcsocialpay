// DEPRECATED (P0 dual-store): legacy view using src/store.ts + src/types.ts.
// Not routed by src/App.tsx (Pay flow lives in PayView + src/store/appStore.ts).
// Kept so `tsc --noEmit` still passes; do not add new features here.
import { useState } from 'react'
import {
  ArrowUpRight, ArrowDownLeft, Copy, ExternalLink,
  RefreshCw, Wallet, CheckCircle2, Clock,
  ChevronRight, Send,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { ConnectKitButton } from 'connectkit'
import { toast } from 'sonner'
import {
  getUsdc, requireChain, buildTxExplorerUrl, buildAddressExplorerUrl,
} from '../onchain-facts'
import { parseAmount, Amount, usdcDecimalsFor } from '../onchain-money'
import { shortAddress } from '../store'
import TopBar from './TopBar'
import { ARC_CHAIN_ID } from '../hooks/useArcWallet'
import { ZERO_ADDRESS, AMOUNT_REGEX, maxSendableRaw, formatUsdcDisplay } from '../utils/format'
import { copyText } from '../utils/copy'

const CHAIN_ID = ARC_CHAIN_ID

export default function WalletView() {
  const { address, isConnected, chainId } = useAccount()
  const [activeTab, setActiveTab] = useState<'assets' | 'activity'>('assets')
  const [sendOpen, setSendOpen] = useState(false)
  const [receiveOpen, setReceiveOpen] = useState(false)

  const usdcFact = getUsdc(CHAIN_ID)
  const chain = requireChain(CHAIN_ID)

  const { data: usdcBalance, isLoading: balanceLoading, refetch } = useReadContract({
    address: usdcFact?.address as `0x${string}`,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!usdcFact, refetchInterval: 10_000 },
  })

  const formattedBalance = usdcBalance
    ? Amount.fromRaw(usdcBalance, usdcDecimalsFor(CHAIN_ID)).toFixed(2)
    : '0.00'

  const explorerUrl = address ? buildAddressExplorerUrl(CHAIN_ID, address) : undefined

  const copyAddress = () => {
    if (!address) return
    void copyText(address, 'Address copied')
  }

  if (!isConnected || !address) {
    return (
      <div className="min-h-dvh flex flex-col">
        <TopBar title="Wallet" />
        <div className="flex flex-col items-center justify-center flex-1 gap-6 px-6 py-16">
          <div
            className="w-20 h-20 rounded-3xl flex items-center justify-center"
            style={{ background: 'var(--surface-muted)' }}
          >
            <Wallet size={36} style={{ color: 'var(--subtle)' }} />
          </div>
          <div className="text-center">
            <h3 className="display font-bold text-xl mb-2" style={{ color: 'var(--ink)' }}>
              Connect your wallet
            </h3>
            <p className="text-sm max-w-xs text-pretty" style={{ color: 'var(--muted)' }}>
              Connect your Arc wallet to view your USDC balance, send and receive payments, and see transaction history.
            </p>
          </div>
          <ConnectKitButton.Custom>
            {({ show }) => (
              <button
                onClick={show}
                className="px-8 py-3 rounded-full font-semibold text-sm transition-all"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                Connect Wallet
              </button>
            )}
          </ConnectKitButton.Custom>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh">
      <TopBar title="Wallet" />

      {/* Balance card */}
      <div className="px-4 py-6">
        <div
          className="rounded-2xl p-6 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%)',
          }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10" style={{ background: '#fff' }} />
          <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full opacity-10" style={{ background: '#fff' }} />

          <div className="relative">
            <p className="text-sm font-medium mb-1 opacity-80" style={{ color: '#fff' }}>USDC Balance</p>
            <div className="flex items-baseline gap-2 mb-1">
              {balanceLoading ? (
                <div className="h-10 w-36 rounded-lg opacity-20 animate-pulse" style={{ background: '#fff' }} />
              ) : (
                <span className="display font-bold text-4xl tabular" style={{ color: '#fff', letterSpacing: '-0.03em' }}>
                  ${formattedBalance}
                </span>
              )}
            </div>
            <p className="text-sm opacity-70 mb-4" style={{ color: '#fff' }}>Arc Testnet · USDC</p>

            {/* Address */}
            <button
              onClick={copyAddress}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all hover:opacity-80"
              style={{ background: 'rgba(255,255,255,0.18)', color: '#fff' }}
            >
              <span className="mono">{shortAddress(address)}</span>
              <Copy size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 px-4 mb-6">
        <ActionPill
          icon={<ArrowUpRight size={18} />}
          label="Send"
          onClick={() => setSendOpen(true)}
        />
        <ActionPill
          icon={<ArrowDownLeft size={18} />}
          label="Receive"
          onClick={() => setReceiveOpen(true)}
        />
        <ActionPill
          icon={<RefreshCw size={18} />}
          label="Refresh"
          onClick={() => { refetch().catch(() => {}) }}
        />
        {explorerUrl && (
          <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
            <button
              className="w-full flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-medium transition-all"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
            >
              <ExternalLink size={18} />
              Explorer
            </button>
          </a>
        )}
      </div>

      {/* Tabs */}
      <div
        className="flex border-b"
        style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
      >
        {(['assets', 'activity'] as const).map(t => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className="flex-1 py-3 text-sm font-medium capitalize relative transition-all"
            style={{ color: activeTab === t ? 'var(--accent)' : 'var(--subtle)' }}
          >
            {t === 'assets' ? 'Assets' : 'Activity'}
            {activeTab === t && (
              <motion.div
                layoutId="wallet-tab-line"
                className="absolute bottom-0 left-1/4 right-1/4 h-0.5 rounded-full"
                style={{ background: 'var(--accent)' }}
              />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'assets' && (
        <div className="px-4 py-4 space-y-2">
          {/* USDC asset row */}
          <div
            className="flex items-center gap-3 p-4 rounded-xl border"
            style={{ background: 'var(--surface-strong)', borderColor: 'var(--border)' }}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm"
              style={{ background: '#2775ca22', color: '#2775ca' }}
            >
              $
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>USD Coin</p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>USDC · Arc Testnet</p>
            </div>
            <div className="text-right">
              <p className="font-semibold text-sm tabular" style={{ color: 'var(--ink)' }}>
                {balanceLoading ? '…' : `$${formattedBalance}`}
              </p>
              <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                {balanceLoading ? '' : `${formattedBalance} USDC`}
              </p>
            </div>
          </div>
          <p className="text-xs text-center py-3" style={{ color: 'var(--subtle)' }}>
            On Arc Testnet, USDC is the native gas token.
          </p>
        </div>
      )}

      {activeTab === 'activity' && (
        <ActivityList address={address} chainId={CHAIN_ID} />
      )}

      {/* Send modal */}
      <AnimatePresence>
        {sendOpen && (
          <SendModal
            address={address}
            balance={formattedBalance}
            onClose={() => setSendOpen(false)}
            onSuccess={() => { refetch().catch(() => {}) }}
          />
        )}
      </AnimatePresence>

      {/* Receive modal */}
      <AnimatePresence>
        {receiveOpen && (
          <ReceiveModal address={address} onClose={() => setReceiveOpen(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}

function ActionPill({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl text-xs font-medium transition-all hover:opacity-80"
      style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}
    >
      {icon}
      {label}
    </button>
  )
}

function ActivityList({ address, chainId }: { address: string; chainId: number }) {
  // We don't have a real tx indexer, so we show a link to the explorer
  const explorerUrl = buildAddressExplorerUrl(chainId, address)
  return (
    <div className="px-4 py-6 flex flex-col items-center text-center gap-4">
      <div
        className="w-14 h-14 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--surface-muted)' }}
      >
        <Clock size={24} style={{ color: 'var(--subtle)' }} />
      </div>
      <div>
        <p className="font-medium text-sm mb-1" style={{ color: 'var(--ink)' }}>
          Transaction history
        </p>
        <p className="text-xs max-w-xs text-pretty" style={{ color: 'var(--muted)' }}>
          View all your onchain transactions on Arc Explorer.
        </p>
      </div>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all"
        style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}
      >
        Open Arc Explorer
        <ExternalLink size={14} />
      </a>
    </div>
  )
}

function SendModal({
  address, balance, onClose, onSuccess,
}: {
  address: string
  balance: string
  onClose: () => void
  onSuccess: () => void
}) {
  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [localError, setLocalError] = useState('')
  const { chainId } = useAccount()
  const { switchChain } = useSwitchChain()

  const usdcFact = getUsdc(CHAIN_ID)
  const usdcAddress = (usdcFact?.address ?? '') as string
  const isWrongChain = chainId !== CHAIN_ID
  const trimmedRecipient = recipient.trim()
  const recipientIsAddress = trimmedRecipient !== '' && isAddress(trimmedRecipient)
  const lowerRecipient = trimmedRecipient.toLowerCase()
  const isBlockedRecipient =
    recipientIsAddress &&
    (lowerRecipient === ZERO_ADDRESS.toLowerCase() ||
      lowerRecipient === usdcAddress.toLowerCase() ||
      lowerRecipient === address.toLowerCase())
  const recipientValid = recipientIsAddress && !isBlockedRecipient
  const amountNum = parseFloat(amount.trim())
  const amountFormatValid = AMOUNT_REGEX.test(amount.trim())
  const amountValid = amountFormatValid && !isNaN(amountNum) && amountNum > 0 && amountNum <= parseFloat(balance)

  const {
    writeContract,
    data: hash,
    isPending,
    error: writeError,
    reset,
  } = useWriteContract()

  // H1: only treat receipt.status === 'success' as confirmed.
  const { data: receipt, isLoading: isConfirming, isSuccess: isReceiptSuccess, isError: isReceiptError } =
    useWaitForTransactionReceipt({ hash })
  const isConfirmed = isReceiptSuccess && receipt?.status === 'success'
  const isFailed = isReceiptError || receipt?.status === 'reverted'

  function getBlockedReason(): string | null {
    if (!recipientIsAddress) return null
    if (lowerRecipient === ZERO_ADDRESS.toLowerCase()) return 'Cannot send to the zero address (0x000...000)'
    if (lowerRecipient === usdcAddress.toLowerCase()) return 'Cannot send to the USDC contract address'
    if (lowerRecipient === address.toLowerCase()) return 'Cannot send to your own address'
    return null
  }

  function handleMax() {
    // H2: leave 0.1 USDC for gas — never set the full balance.
    // Exact bigint path (no Number/parseFloat) via maxSendableRaw.
    // formatUsdcDisplay is grouped DISPLAY-ONLY, so strip commas for <input>.
    try {
      const balRaw = parseAmount(CHAIN_ID, (balance || '0').replace(/,/g, '').trim() || '0').raw
      const maxRaw = maxSendableRaw(balRaw, 100_000n)
      if (maxRaw <= 0n) {
        setAmount('0')
      } else {
        const ungrouped = formatUsdcDisplay(maxRaw).replace(/,/g, '')
        const trimmed = ungrouped.includes('.') ? ungrouped.replace(/\.?0+$/, '') : ungrouped
        setAmount(trimmed === '' ? '0' : trimmed)
      }
    } catch {
      setAmount('0')
    }
    setLocalError('')
  }

  const handleSend = () => {
    // M4: block double-submit.
    if (isPending || isConfirming) return
    setLocalError('')
    // M3: explicit switch first — preserve recipient/amount, don't silently drop.
    if (isWrongChain) {
      toast.message('Switching to Arc Testnet — your details are preserved.')
      switchChain({ chainId: CHAIN_ID })
      return
    }
    const blocked = getBlockedReason()
    if (!recipientIsAddress) { setLocalError('Enter a valid recipient address (0x...)'); return }
    if (blocked) { setLocalError(blocked); return }
    if (!amount.trim() || !amountFormatValid) {
      setLocalError(
        !amount.trim() || isNaN(amountNum) || amountNum <= 0
          ? 'Enter a valid amount'
          : 'Too many decimal places (max 6)',
      )
      return
    }
    if (!usdcFact || !recipientValid || !amountValid) {
      if (!amountValid && amountNum > parseFloat(balance)) {
        setLocalError(`Insufficient balance. You have ${balance} USDC.`)
      }
      return
    }
    try {
      const parsed = parseAmount(CHAIN_ID, amount.trim())
      writeContract({
        address: usdcFact.address as `0x${string}`,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [trimmedRecipient as `0x${string}`, parsed.raw],
        chainId: CHAIN_ID,
      })
    } catch (e) {
      // H3: surface parseAmount throws instead of swallowing.
      const msg = e instanceof Error ? e.message : ''
      if (msg.includes('fraction') || msg.includes('TOO_MANY')) {
        setLocalError('Too many decimal places (max 6)')
      } else {
        setLocalError('Invalid amount (max 6 decimals)')
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="display font-bold text-lg mb-1" style={{ color: 'var(--ink)' }}>Send USDC</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--subtle)' }}>Arc Testnet · Balance: ${balance}</p>

        {isConfirmed ? (
          <div className="text-center py-4">
            <CheckCircle2 size={40} className="mx-auto mb-3" style={{ color: 'var(--success)' }} />
            <p className="font-semibold" style={{ color: 'var(--success)' }}>Sent successfully!</p>
            {hash && (
              <a
                href={buildTxExplorerUrl(CHAIN_ID, hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-2 text-xs"
                style={{ color: 'var(--accent)' }}
              >
                View on Arc Explorer <ExternalLink size={12} />
              </a>
            )}
            <button
              onClick={() => { onSuccess(); onClose(); reset() }}
              className="mt-4 w-full py-2 rounded-xl text-sm font-semibold"
              style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
            >
              Done
            </button>
          </div>
        ) : isFailed ? (
          <div className="text-center py-4">
            <p className="font-semibold mb-1" style={{ color: 'var(--danger)' }}>Transaction failed</p>
            <p className="text-xs mb-3" style={{ color: 'var(--muted)' }}>
              The transaction reverted onchain. Your funds were not sent.
            </p>
            {hash && (
              <a
                href={buildTxExplorerUrl(CHAIN_ID, hash)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 mt-1 mb-3 text-xs"
                style={{ color: 'var(--accent)' }}
              >
                View on Arc Explorer <ExternalLink size={12} />
              </a>
            )}
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => { reset(); setLocalError('') }}
                className="flex-1 py-2 rounded-xl text-sm font-semibold"
                style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
              >
                Try Again
              </button>
              <button
                onClick={onClose}
                className="flex-1 py-2 rounded-xl text-sm font-semibold border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            {isWrongChain && (
              <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
                Wrong network. Switch to Arc Testnet first — your recipient and amount are preserved.
              </div>
            )}
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted)' }}>Recipient Address</label>
                <input
                  type="text"
                  value={recipient}
                  onChange={e => { setRecipient(e.target.value); setLocalError('') }}
                  placeholder="0x…"
                  className="w-full px-3 py-2.5 rounded-xl border text-sm mono outline-none"
                  style={{ background: 'var(--surface-muted)', borderColor: recipientValid || !recipient ? 'var(--border)' : 'var(--danger)', color: 'var(--ink)' }}
                />
                {recipient && !recipientValid && (
                  <p className="text-xs mt-1" style={{ color: 'var(--danger)' }}>
                    {getBlockedReason() ?? 'Invalid address'}
                  </p>
                )}
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
                  <span>Amount (USDC)</span>
                  <button onClick={handleMax} className="font-semibold" style={{ color: 'var(--accent)' }}>
                    Max
                  </button>
                </div>
                <div
                  className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
                  style={{ borderColor: 'var(--border)', background: 'var(--surface-muted)' }}
                >
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={e => { setAmount(e.target.value); setLocalError('') }}
                    placeholder="0.00"
                    className="flex-1 bg-transparent text-base font-semibold tabular outline-none"
                    style={{ color: 'var(--ink)' }}
                  />
                  <span className="text-sm font-medium" style={{ color: 'var(--muted)' }}>USDC</span>
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
                  MAX leaves 0.1 USDC reserved for gas.
                </p>
                <div className="flex gap-2 mt-2">
                  {['10', '50', '100'].map(v => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className="flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all"
                      style={{
                        borderColor: amount === v ? 'var(--accent)' : 'var(--border)',
                        color: amount === v ? 'var(--accent)' : 'var(--muted)',
                        background: amount === v ? 'var(--accent-soft)' : 'transparent',
                      }}
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {(writeError || localError) && (
              <p className="text-xs mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(186,43,76,0.1)', color: 'var(--danger)' }}>
                {localError || (writeError!.message.includes('user rejected') ? 'Transaction cancelled.' : 'Transaction failed. Please try again.')}
              </p>
            )}

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold border"
                style={{ borderColor: 'var(--border)', color: 'var(--muted)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={isPending || isConfirming || (!isWrongChain && (!recipientValid || !amountValid))}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: 'var(--accent)', color: 'var(--bg)' }}
              >
                <Send size={15} />
                {isWrongChain ? 'Switch Network' : isPending ? 'Confirm…' : isConfirming ? 'Confirming…' : `Send ${amount || '0'} USDC`}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}

function ReceiveModal({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)

  const copyAddr = () => {
    void copyText(address, 'Address copied').then((ok) => {
      if (ok) {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center"
        style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="display font-bold text-lg mb-1" style={{ color: 'var(--ink)' }}>Receive USDC</h3>
        <p className="text-sm mb-5" style={{ color: 'var(--subtle)' }}>Send USDC to your Arc Testnet address</p>

        {/* QR placeholder */}
        <div
          className="w-44 h-44 mx-auto rounded-2xl flex items-center justify-center mb-4 border"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <div className="text-center">
            <div className="grid grid-cols-8 gap-0.5 mb-2">
              {Array.from({ length: 64 }).map((_, i) => (
                <div
                  key={i}
                  className="w-4 h-4 rounded-sm"
                  style={{
                    background: ((parseInt(address.slice(2, 10), 16) >> i) & 1)
                      ? 'var(--ink)' : 'var(--surface-muted)',
                  }}
                />
              ))}
            </div>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>QR</p>
          </div>
        </div>

        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-xl border mb-4"
          style={{ background: 'var(--surface-muted)', borderColor: 'var(--border)' }}
        >
          <span className="flex-1 mono text-xs truncate text-left" style={{ color: 'var(--ink)' }}>
            {address}
          </span>
          <button
            onClick={copyAddr}
            className="shrink-0 transition-all hover:opacity-70"
            style={{ color: copied ? 'var(--success)' : 'var(--accent)' }}
          >
            {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
          </button>
        </div>

        <p className="text-xs mb-4" style={{ color: 'var(--subtle)' }}>
          Only send USDC on Arc Testnet to this address. Other assets may be lost.
        </p>

        <button
          onClick={onClose}
          className="w-full py-2.5 rounded-xl text-sm font-semibold"
          style={{ background: 'var(--surface-muted)', color: 'var(--ink)' }}
        >
          Close
        </button>
      </motion.div>
    </div>
  )
}
