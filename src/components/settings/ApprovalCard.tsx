'use client'

// Payment approval: how much USDC the SocialPay contract may pull in one approval, the allowance it
// has left right now (read from the chain), and a way to take the allowance back.

import { useEffect, useState } from 'react'
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from 'wagmi'
import { erc20Abi } from 'viem'
import { ARC_CHAIN_ID, USDC_ADDRESS, useArcAccount } from '../../hooks/useArcWallet'
import { useSettings } from '../../hooks/useSettings'
import { SOCIAL_PAY_ADDRESS, isSocialPayConfigured } from '../../contracts/arcSocialPay'
import { EXACT, LIMIT_PRESETS, MAX_LIMIT_USDC, parseLimit } from '../../utils/approval'
import { formatUsdc } from '@/onchain-money'
import { formatUsdcDisplay } from '../../utils/format'
import { Button } from '../ui/Button'

const label = (limit: string) => (limit === EXACT ? 'Exact' : `$${Number(limit).toLocaleString('en-US', { maximumFractionDigits: 6 })}`)

export function ApprovalCard() {
  const { address, isConnected, isArcChain, switchToArc, isSwitching } = useArcAccount()
  const { allowanceLimit, setAllowanceLimit } = useSettings()
  const contract = SOCIAL_PAY_ADDRESS as `0x${string}`
  const enabled = isSocialPayConfigured() && !!address

  const [custom, setCustom] = useState('')
  const [customError, setCustomError] = useState('')
  const isPreset = LIMIT_PRESETS.some((p) => p.value === allowanceLimit)

  const { data, refetch, isLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, contract] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled, staleTime: 10_000 },
  })
  const remaining = (data ?? 0n) as bigint

  const revoke = useWriteContract()
  const { data: receipt } = useWaitForTransactionReceipt({ hash: revoke.data })
  useEffect(() => {
    if (receipt?.status === 'success') void refetch()
  }, [receipt, refetch])

  const revoking = revoke.isPending || (!!revoke.data && !receipt)
  const revokeFailed = receipt?.status === 'reverted' || (revoke.error && !/rejected|denied/i.test(revoke.error.message))
  const cancelled = revoke.error && /rejected|denied/i.test(revoke.error.message)

  function choose(value: string) {
    setCustomError('')
    setCustom('')
    setAllowanceLimit(value)
  }

  function saveCustom() {
    const p = parseLimit(custom)
    if (!p.ok) { setCustomError(p.error); return }
    setCustomError('')
    setAllowanceLimit(p.value)
    setCustom('')
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-pretty" style={{ color: 'var(--muted)' }}>
        Payments through the SocialPay contract need your approval to move USDC. Approve a larger amount once and the next
        payments within it need no approval transaction. The contract holds no funds and can only move what you approved.
      </p>

      <div>
        <p className="text-xs uppercase tracking-wider font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Approve up to</p>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Approval limit">
          {LIMIT_PRESETS.map((p) => {
            const active = allowanceLimit === p.value
            return (
              <button key={p.value} role="radio" aria-checked={active} onClick={() => choose(p.value)}
                className="h-10 px-4 rounded-full text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                style={{ background: active ? 'var(--accent)' : 'var(--surface-strong)', color: active ? '#fff' : 'var(--ink)', border: '1px solid var(--border)' }}>
                {p.label}
              </button>
            )
          })}
        </div>
        {allowanceLimit === EXACT && (
          <p className="text-xs mt-1.5" style={{ color: 'var(--subtle)' }}>Exact asks for an approval before every payment.</p>
        )}
      </div>

      <div>
        <label htmlFor="custom-limit" className="text-xs uppercase tracking-wider font-medium block mb-1.5" style={{ color: 'var(--muted)' }}>
          Custom limit (USDC)
        </label>
        <div className="flex gap-2">
          <input id="custom-limit" inputMode="decimal" value={custom} placeholder={isPreset ? 'e.g. 250' : label(allowanceLimit)}
            onChange={(e) => { setCustom(e.target.value); setCustomError('') }}
            onKeyDown={(e) => { if (e.key === 'Enter') saveCustom() }}
            aria-invalid={!!customError} aria-describedby={customError ? 'custom-limit-error' : undefined}
            className="flex-1 min-w-0 h-11 px-3 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[var(--focus)]"
            style={{ background: 'var(--surface-strong)', border: `1px solid ${customError ? 'var(--danger)' : 'var(--border)'}`, color: 'var(--ink)' }} />
          <Button variant="secondary" onClick={saveCustom} disabled={!custom.trim()}>Save</Button>
        </div>
        {customError
          ? <p id="custom-limit-error" className="text-xs mt-1.5" style={{ color: 'var(--danger)' }} role="alert">{customError}</p>
          : <p className="text-xs mt-1.5" style={{ color: 'var(--subtle)' }}>Up to ${MAX_LIMIT_USDC.toLocaleString('en-US')}. Your limit now: {label(allowanceLimit)}.</p>}
      </div>

      <div className="rounded-xl p-3 space-y-2" style={{ background: 'var(--surface-muted)' }}>
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs uppercase tracking-wider font-medium" style={{ color: 'var(--muted)' }}>Approved right now</span>
          <span className="tabnum text-sm font-semibold" style={{ color: 'var(--ink)' }}>
            {!isConnected ? 'Connect a wallet' : isLoading ? '...' : `${formatUsdcDisplay(formatUsdc(remaining))} USDC`}
          </span>
        </div>
        {isConnected && !isArcChain ? (
          <Button size="sm" variant="secondary" className="w-full" onClick={switchToArc} loading={isSwitching}>Switch to Arc to manage</Button>
        ) : (
          <Button size="sm" variant="secondary" className="w-full" disabled={!enabled || remaining === 0n || revoking}
            loading={revoking}
            onClick={() => { revoke.reset(); revoke.writeContract({ address: USDC_ADDRESS, abi: erc20Abi, functionName: 'approve', args: [contract, 0n], chainId: ARC_CHAIN_ID }) }}>
            Revoke approval
          </Button>
        )}
        {revokeFailed && <p className="text-xs" style={{ color: 'var(--danger)' }} role="alert">The approval could not be revoked. Please try again.</p>}
        {cancelled && <p className="text-xs" style={{ color: 'var(--muted)' }}>Revoke cancelled.</p>}
        {receipt?.status === 'success' && remaining === 0n && <p className="text-xs" style={{ color: 'var(--success)' }}>Approval revoked.</p>}
      </div>
    </div>
  )
}
