'use client'

import { useRef, useState } from 'react'
import { erc20Abi } from 'viem'
import { useWriteContract, usePublicClient } from 'wagmi'
import { AlertCircle, ClipboardList, FileUp, Info, Layers, Plus, Users, Wallet, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/Button'
import { GradientIcon } from '../dashboard/ui'
import { BatchRowItem } from './BatchRowItem'
import { BatchReview } from './BatchReview'
import { cleanAmountInput } from '../swap/SwapPanel'
import { ARC_CHAIN_ID, USDC_ADDRESS, useArcAccount, useUsdcBalance } from '../../hooks/useArcWallet'
import { appStore } from '../../store/appStore'
import { parseUsdc } from '@/onchain-money'
import { formatUsdcDisplay, generateId, parseOnchainError } from '../../utils/format'
import {
  MAX_BATCH_ROWS, parseBatchCsv, totalRaw, validateRow, type BatchRow, type RawRow,
} from '../../utils/batch'

// USDC is also the gas token on Arc: keep a small buffer per transaction.
const GAS_BUFFER_PER_TX_RAW = 20_000n // 0.02 USDC

const newRow = (r: Partial<RawRow> = {}): BatchRow => ({
  id: generateId(), address: r.address ?? '', amount: r.amount ?? '', status: 'queued',
})

/** 0 to 1, exact bigint math. */
function ratio(part: bigint, whole: bigint): number {
  if (part <= 0n) return 0
  if (whole <= 0n) return 1
  const r = Number((part * 1000n) / whole) / 1000
  return Math.min(1, r)
}

export function BatchForm({ address }: { address: string }) {
  const [rows, setRows] = useState<BatchRow[]>([newRow(), newRow()])
  const [csv, setCsv] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [showSame, setShowSame] = useState(false)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [focusId, setFocusId] = useState<string | null>(null)
  const [sameAmount, setSameAmount] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const stopRef = useRef(false)
  const { isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { raw: balance, display: balanceDisplay, refetch } = useUsdcBalance(address as `0x${string}`)
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })

  const ctx = { myAddress: address, usdcAddress: USDC_ADDRESS as string }
  const pending = rows.filter((r) => r.status === 'queued' || r.status === 'failed')
  const errors = rows.map((r) => (r.status === 'queued' || r.status === 'failed' ? validateRow(r, ctx) : null))
  const allValid = pending.length > 0 && rows.every((r, i) => r.status === 'confirmed' || errors[i] === null)
  const pendingTotal = totalRaw(pending)
  const needed = pendingTotal + GAS_BUFFER_PER_TX_RAW * BigInt(pending.length)
  const insufficient = pending.length > 0 && needed > balance
  const sentCount = rows.filter((r) => r.status === 'confirmed').length
  const done = rows.length > 0 && sentCount === rows.length

  function patch(id: string, p: Partial<BatchRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)))
  }

  function addRow() {
    if (rows.length >= MAX_BATCH_ROWS) return
    const r = newRow()
    setFocusId(r.id)
    setRows((p) => [...p, r])
  }

  function applyToAll() {
    if (!sameAmount) return
    setRows((prev) => prev.map((r) => (r.status === 'queued' || r.status === 'failed' ? { ...r, amount: sameAmount } : r)))
  }

  function importCsv(text: string) {
    const parsed = parseBatchCsv(text)
    if (parsed.length === 0) return setError('No rows found. Use one "address,amount" per line.')
    if (parsed.length > MAX_BATCH_ROWS) return setError(`Too many rows (max ${MAX_BATCH_ROWS}).`)
    setError('')
    setRows(parsed.map((r) => newRow(r)))
    setCsv('')
    setShowPaste(false)
  }

  function onFile(file: File | undefined) {
    if (!file) return
    if (file.size > 100_000) return setError('File too large (max 100 KB).')
    void file.text().then(importCsv)
  }

  async function run() {
    if (running || !client) return
    setError('')
    if (!isArcChain) return setError('Switch to Arc Mainnet first.')
    stopRef.current = false
    setRunning(true)
    for (const row of rows) {
      if (stopRef.current) break
      if (row.status !== 'queued' && row.status !== 'failed') continue
      patch(row.id, { status: 'signing', error: undefined })
      let hash: `0x${string}` | undefined
      try {
        hash = await writeContractAsync({
          address: USDC_ADDRESS, abi: erc20Abi, functionName: 'transfer',
          args: [row.address.trim() as `0x${string}`, parseUsdc(row.amount.trim())],
          chainId: ARC_CHAIN_ID,
        })
        patch(row.id, { status: 'confirming', hash })
        appStore.addTxRecord({
          txHash: hash, chainId: ARC_CHAIN_ID, direction: 'sent', amount: row.amount.trim(),
          fromAddress: address, toAddress: row.address.trim(), status: 'pending',
          timestamp: Date.now(), note: 'Batch transfer',
        })
        const receipt = await client.waitForTransactionReceipt({ hash })
        if (receipt.status !== 'success') throw new Error('reverted')
        appStore.updateTxRecord(hash, { status: 'confirmed' })
        patch(row.id, { status: 'confirmed' })
      } catch (e) {
        const msg = parseOnchainError(e)
        if (hash) appStore.updateTxRecord(hash, { status: 'failed' })
        patch(row.id, { status: 'failed', error: msg })
        // Stop at the first failure so nothing is sent out of order unexpectedly.
        stopRef.current = true
      }
    }
    setRunning(false)
    refetch().catch(() => toast.error('Failed to refresh balance'))
  }

  const usage = ratio(needed, balance)
  const progress = running || sentCount > 0 ? sentCount / Math.max(rows.length, 1) : usage
  const count = done ? sentCount : pending.length

  return (
    <div className="rounded-3xl overflow-hidden" data-tc="">
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <GradientIcon icon={Layers} tone="indigo" size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="display font-bold text-lg leading-tight" style={{ color: 'var(--ink)', letterSpacing: '-0.02em' }}>Batch transfer</h3>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>{done ? 'Batch complete' : step === 'review' ? 'Step 2 of 2: review and confirm' : 'Step 1 of 2: add recipients'}</p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 h-7 rounded-full tabnum flex-shrink-0"
          style={{ background: 'var(--surface-strong)', color: 'var(--ink-2)' }}>
          <Users size={12} /> {rows.length}/{MAX_BATCH_ROWS}
        </span>
      </div>

      {step === 'review' ? (
        <BatchReview rows={rows} balance={balance} />
      ) : (
        <>
      {/* Tools */}
      <div className="px-4 pb-3 flex gap-2 overflow-x-auto">
        <button type="button" data-chip="" disabled={running} onClick={() => fileRef.current?.click()}
          className="h-10 px-3.5 rounded-full text-sm inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
          <FileUp size={14} /> Upload CSV
        </button>
        <button type="button" data-chip="" disabled={running} aria-pressed={showPaste} onClick={() => setShowPaste((v) => !v)}
          className="h-10 px-3.5 rounded-full text-sm inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          style={showPaste ? { outline: '2px solid var(--tone-to)' } : undefined}>
          <ClipboardList size={14} /> Paste list
        </button>
        <button type="button" data-chip="" disabled={running || pending.length < 2} aria-pressed={showSame} onClick={() => setShowSame((v) => !v)}
          className="h-10 px-3.5 rounded-full text-sm inline-flex items-center gap-2 whitespace-nowrap disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          style={showSame ? { outline: '2px solid var(--tone-to)' } : undefined}>
          <Layers size={14} /> Same amount
        </button>
        <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
      </div>

      {showPaste && (
        <div className="mx-4 mb-3 rounded-2xl p-3 space-y-2" data-tp="">
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} autoFocus
            placeholder={'One per line: address,amount\n0x...,5.00'} aria-label="Paste recipients as CSV"
            className="w-full rounded-xl p-3 text-xs mono outline-none" data-ti="" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => importCsv(csv)} disabled={!csv.trim()}>Import rows</Button>
            <Button size="sm" variant="ghost" onClick={() => { setCsv(''); setShowPaste(false) }}>Cancel</Button>
          </div>
        </div>
      )}

      {showSame && pending.length > 1 && (
        <div className="mx-4 mb-3 rounded-2xl p-3 space-y-2.5" data-tp="">
          <div className="flex items-center gap-2">
            <div className="flex-1 min-w-0 flex items-center gap-2 h-11 rounded-xl px-3" style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}>
              <input value={sameAmount} inputMode="decimal" placeholder="0.00" aria-label="Amount for every recipient" autoFocus
                onChange={(e) => { const n = cleanAmountInput(e.target.value, 6); if (n !== null) setSameAmount(n) }}
                onKeyDown={(e) => { if (e.key === 'Enter') applyToAll() }}
                className="display flex-1 min-w-0 bg-transparent outline-none text-lg font-bold tabnum" style={{ color: 'var(--ink)' }} />
              <span className="text-[11px] font-bold tracking-wide" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
            <Button variant="secondary" onClick={applyToAll} disabled={!sameAmount} className="h-11">Apply to all</Button>
          </div>
          <div className="flex items-center gap-1.5">
            {['1', '5', '10', '25', '100'].map((q) => (
              <button key={q} type="button" data-chip="" onClick={() => setSameAmount(q)}
                className="h-8 px-3 rounded-full text-xs tabnum active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
                {q}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Recipients */}
      <div className="mx-4 rounded-2xl overflow-hidden" data-tp="">
        <div className="hidden sm:grid grid-cols-[auto_minmax(0,1fr)_9.5rem_auto] gap-x-2.5 px-3 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--subtle)' }}>
          <span className="w-8" /><span>Recipient</span><span className="text-right pr-3">Amount</span><span className="w-10" />
        </div>
        <ul className="divide-y divide-[var(--border)] max-h-[min(52vh,460px)] overflow-y-auto" aria-label="Recipients">
          {rows.map((r, i) => (
            <BatchRowItem
              key={r.id}
              index={i}
              row={r}
              error={errors[i]}
              disabled={running}
              autoFocus={r.id === focusId}
              onChange={(p) => patch(r.id, p)}
              onRemove={() => setRows((p) => (p.length > 1 ? p.filter((x) => x.id !== r.id) : [newRow()]))}
              onEnter={() => { if (i === rows.length - 1) addRow() }}
            />
          ))}
        </ul>
        <button type="button" disabled={running || rows.length >= MAX_BATCH_ROWS} onClick={addRow}
          className="w-full h-12 text-sm font-semibold flex items-center justify-center gap-2 transition-colors hover:bg-[var(--surface-strong)] disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--tone-text)' }}>
          <Plus size={16} /> Add recipient
        </button>
      </div>

        </>
      )}

      {/* Summary and send: always visible under the list */}
      <div className="p-4 space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)' }}>{done ? 'All sent' : 'Total to send'}</div>
            <div className="flex items-baseline gap-1.5">
              <span className="display text-3xl font-bold tabnum break-all" style={{ color: 'var(--ink)', letterSpacing: '-0.03em' }}>
                {formatUsdcDisplay(done ? totalRaw(rows) : pendingTotal)}
              </span>
              <span className="text-sm font-semibold" style={{ color: 'var(--subtle)' }}>USDC</span>
            </div>
          </div>
          <div className="text-right text-xs tabnum flex-shrink-0" style={{ color: 'var(--muted)' }}>
            <div className="font-semibold" style={{ color: 'var(--ink-2)' }}>{count} {count === 1 ? 'recipient' : 'recipients'}</div>
            {!done && <div>+ {formatUsdcDisplay(GAS_BUFFER_PER_TX_RAW * BigInt(pending.length))} fees</div>}
          </div>
        </div>

        <div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-muted)' }} role="progressbar"
            aria-label={running ? 'Batch progress' : 'Share of balance used'} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}>
            <div className="h-full w-full rounded-full origin-left transition-transform duration-500"
              style={{
                transform: `scaleX(${Math.max(0.02, progress)})`,
                background: insufficient ? 'var(--danger)' : 'linear-gradient(90deg, var(--tone-from), var(--tone-to))',
              }} />
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--muted)' }}>
            <span className="inline-flex items-center gap-1.5"><Wallet size={12} /> Balance <span className="tabnum font-semibold" style={{ color: 'var(--ink-2)' }}>{balanceDisplay} USDC</span></span>
            {(running || sentCount > 0) && <span className="tabnum">{sentCount} of {rows.length} sent</span>}
          </div>
        </div>

        {insufficient && (
          <div className="flex items-start gap-2 p-3 rounded-xl text-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
            <span>You have {formatUsdcDisplay(balance)} USDC. This batch needs {formatUsdcDisplay(needed)} USDC including fees.</span>
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }} role="alert">
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
          </div>
        )}

        {done ? (
          <Button className="w-full" size="lg" variant="secondary" onClick={() => { setRows([newRow(), newRow()]); setStep('edit') }}>Start a new batch</Button>
        ) : !isArcChain ? (
          <Button className="w-full" size="lg" onClick={switchToArc} loading={isSwitching}>Switch to Arc Mainnet</Button>
        ) : running ? (
          <Button className="w-full" size="lg" variant="danger" onClick={() => { stopRef.current = true }}>
            <X size={16} /> Stop after current
          </Button>
        ) : step === 'edit' ? (
          <Button className="w-full" size="lg" onClick={() => setStep('review')} disabled={!allValid || insufficient}>
            Review {pending.length} payment{pending.length === 1 ? '' : 's'}
          </Button>
        ) : (
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button size="lg" variant="secondary" onClick={() => setStep('edit')}>Edit</Button>
            <Button size="lg" onClick={() => void run()} disabled={!allValid || insufficient}>
              {rows.some((r) => r.status === 'failed') ? 'Retry remaining' : 'Confirm and send'}
            </Button>
          </div>
        )}

        <p className="text-xs flex gap-2 text-pretty" style={{ color: 'var(--subtle)' }}>
          <Info size={13} className="flex-shrink-0 mt-0.5" />
          <span>Each recipient is a separate transaction you sign one by one. If one fails, the ones already sent stay sent and the rest wait for you.</span>
        </p>
      </div>
    </div>
  )
}
