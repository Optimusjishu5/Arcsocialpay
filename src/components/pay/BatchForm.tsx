'use client'

import { useRef, useState } from 'react'
import { erc20Abi } from 'viem'
import { useWriteContract, usePublicClient } from 'wagmi'
import { AlertCircle, Check, ExternalLink, FileUp, Plus, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '../ui/Button'
import { ARC_CHAIN_ID, USDC_ADDRESS, useArcAccount, useUsdcBalance } from '../../hooks/useArcWallet'
import { appStore } from '../../store/appStore'
import { buildTxExplorerUrl } from '@/onchain-facts'
import { parseUsdc } from '@/onchain-money'
import { formatAddress, formatUsdcDisplay, generateId, parseOnchainError } from '../../utils/format'
import {
  MAX_BATCH_ROWS, parseBatchCsv, totalRaw, validateRow, type BatchRow, type RawRow,
} from '../../utils/batch'
import { fieldClass, fieldLabel, fieldStyle } from './ShareLinkBox'

// USDC is also the gas token on Arc: keep a small buffer per transaction.
const GAS_BUFFER_PER_TX_RAW = 20_000n // 0.02 USDC

const newRow = (r: Partial<RawRow> = {}): BatchRow => ({
  id: generateId(), address: r.address ?? '', amount: r.amount ?? '', status: 'queued',
})

export function BatchForm({ address }: { address: string }) {
  const [rows, setRows] = useState<BatchRow[]>([newRow(), newRow()])
  const [csv, setCsv] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const stopRef = useRef(false)
  const { isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { raw: balance, refetch } = useUsdcBalance(address as `0x${string}`)
  const { writeContractAsync } = useWriteContract()
  const client = usePublicClient({ chainId: ARC_CHAIN_ID })

  const ctx = { myAddress: address, usdcAddress: USDC_ADDRESS as string }
  const pending = rows.filter((r) => r.status === 'queued' || r.status === 'failed')
  const errors = rows.map((r) => (r.status === 'queued' || r.status === 'failed' ? validateRow(r, ctx) : null))
  const allValid = pending.length > 0 && rows.every((r, i) => r.status === 'confirmed' || errors[i] === null)
  const pendingTotal = totalRaw(pending)
  const needed = pendingTotal + GAS_BUFFER_PER_TX_RAW * BigInt(pending.length)
  const insufficient = pending.length > 0 && needed > balance

  function patch(id: string, p: Partial<BatchRow>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)))
  }

  function importCsv(text: string) {
    const parsed = parseBatchCsv(text)
    if (parsed.length === 0) return setError('No rows found. Use one "address,amount" per line.')
    if (parsed.length > MAX_BATCH_ROWS) return setError(`Too many rows (max ${MAX_BATCH_ROWS}).`)
    setError('')
    setRows(parsed.map((r) => newRow(r)))
    setCsv('')
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

  const done = rows.length > 0 && rows.every((r) => r.status === 'confirmed')

  return (
    <div className="rounded-2xl overflow-hidden" data-tc="">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <h3 className="display font-semibold text-sm" style={{ color: 'var(--ink)' }}>Batch transfer</h3>
      </div>
      <div className="p-4 space-y-4">
        <div className="flex gap-2 p-3 rounded-xl text-xs" style={{ background: 'var(--surface-muted)', color: 'var(--ink-2)' }}>
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <span>
            Each recipient is a separate transaction that you sign one by one. The batch is not atomic: if one fails, the
            ones already confirmed stay sent and the rest wait for you.
          </span>
        </div>

        <div className="space-y-2">
          <label className={fieldLabel} style={{ color: 'var(--muted)' }}>Recipients</label>
          {rows.map((r, i) => {
            const locked = r.status !== 'queued' && r.status !== 'failed'
            const err = errors[i]
            const touched = r.address !== '' || r.amount !== ''
            return (
              <div key={r.id} className="space-y-1">
                <div className="flex gap-2">
                  <input value={r.address} disabled={locked || running} placeholder="0x..."
                    onChange={(e) => patch(r.id, { address: e.target.value.trim() })}
                    className={`${fieldClass} mono flex-1 min-w-0`} style={fieldStyle} aria-label={`Recipient ${i + 1}`} />
                  <input value={r.amount} disabled={locked || running} placeholder="0.00" inputMode="decimal"
                    onChange={(e) => patch(r.id, { amount: e.target.value })}
                    className={`${fieldClass} w-24 tabnum`} style={fieldStyle} aria-label={`Amount ${i + 1}`} />
                  {r.status === 'confirmed' ? (
                    <span className="w-11 h-11 flex items-center justify-center" style={{ color: 'var(--success)' }}><Check size={18} /></span>
                  ) : (
                    <button onClick={() => setRows((p) => p.filter((x) => x.id !== r.id))} disabled={running}
                      aria-label="Remove row" className="w-11 h-11 flex items-center justify-center rounded-xl disabled:opacity-40"
                      style={{ color: 'var(--muted)' }}>
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                {touched && err && !locked && <p className="text-xs" style={{ color: 'var(--danger)' }}>{err}</p>}
                {r.status !== 'queued' && (
                  <p className="text-xs flex items-center gap-2" style={{ color: r.status === 'failed' ? 'var(--danger)' : 'var(--muted)' }}>
                    {r.status === 'signing' && 'Confirm in wallet...'}
                    {r.status === 'confirming' && 'Confirming onchain...'}
                    {r.status === 'confirmed' && `Sent to ${formatAddress(r.address)}`}
                    {r.status === 'failed' && (r.error ?? 'Failed')}
                    {r.hash && (
                      <a href={buildTxExplorerUrl(ARC_CHAIN_ID, r.hash)} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1" style={{ color: 'var(--tone-text)' }}>
                        <ExternalLink size={11} /> View
                      </a>
                    )}
                  </p>
                )}
              </div>
            )
          })}
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={running || rows.length >= MAX_BATCH_ROWS}
              onClick={() => setRows((p) => [...p, newRow()])}><Plus size={14} /> Add row</Button>
            <Button variant="secondary" size="sm" disabled={running} onClick={() => fileRef.current?.click()}>
              <FileUp size={14} /> Upload CSV
            </Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden"
              onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = '' }} />
          </div>
        </div>

        <details>
          <summary className="text-xs cursor-pointer" style={{ color: 'var(--muted)' }}>Paste CSV instead</summary>
          <textarea value={csv} onChange={(e) => setCsv(e.target.value)} rows={4} placeholder={'address,amount\n0x...,5.00'}
            className="w-full rounded-xl p-3 text-xs mono mt-2 outline-none" style={fieldStyle} />
          <Button size="sm" className="mt-2" variant="secondary" onClick={() => importCsv(csv)} disabled={!csv.trim()}>Import rows</Button>
        </details>

        <div className="rounded-xl p-3 flex items-center justify-between" data-tp="">
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>
            Total ({pending.length} to send)
          </span>
          <span className="tabnum font-semibold" style={{ color: 'var(--ink)' }}>{formatUsdcDisplay(pendingTotal)} USDC</span>
        </div>
        {insufficient && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            Balance is {formatUsdcDisplay(balance)} USDC. This batch needs {formatUsdcDisplay(needed)} USDC including gas.
          </p>
        )}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}>
            <AlertCircle size={16} className="flex-shrink-0 mt-0.5" /><span className="text-sm">{error}</span>
          </div>
        )}
        {done ? (
          <Button className="w-full" size="lg" variant="secondary" onClick={() => setRows([newRow(), newRow()])}>Start a new batch</Button>
        ) : !isArcChain ? (
          <Button className="w-full" size="lg" onClick={switchToArc} loading={isSwitching}>Switch to Arc Mainnet</Button>
        ) : running ? (
          <Button className="w-full" size="lg" variant="danger" onClick={() => { stopRef.current = true }}>
            <X size={16} /> Stop after current
          </Button>
        ) : (
          <Button className="w-full" size="lg" onClick={() => void run()} disabled={!allValid || insufficient}>
            {rows.some((r) => r.status === 'failed') ? 'Retry remaining' : `Send to ${pending.length} recipient${pending.length === 1 ? '' : 's'}`}
          </Button>
        )}
      </div>
    </div>
  )
}
