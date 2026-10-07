'use client'

// ── ArcSocialPay contract hook (Arc Mainnet) ────────────────────────────────
// One-shot machine: requestPay / requestTip → auto-approve (if needed) →
// contract call → receipt. Mirrors useSendUsdc conventions (hash + receipt
// gating, explorer URL, Error-shaped error for parseOnchainError).
//
// When NEXT_PUBLIC_SOCIAL_PAY_ADDRESS is unset, `isConfigured` is false and
// request* immediately reports an error — callers keep their existing direct
// USDC-transfer path as fallback and never touch this machine.

import { useEffect, useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { ARC_CHAIN_ID, USDC_ADDRESS } from './useArcWallet'
import { SOCIAL_PAY_ABI, SOCIAL_PAY_ADDRESS, isSocialPayConfigured } from '@/contracts/arcSocialPay'
import { parseAmount } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'

export type SocialPayStatus =
  | 'idle'
  | 'checking'
  | 'approving'
  | 'sending'
  | 'confirming'
  | 'done'
  | 'error'

interface Intent {
  kind: 'pay' | 'tip'
  to: `0x${string}`
  raw: bigint
  text: string
}

const BUSY: SocialPayStatus[] = ['checking', 'approving', 'sending', 'confirming']

export function useSocialPay() {
  const configured = isSocialPayConfigured()
  const contract = SOCIAL_PAY_ADDRESS as `0x${string}`
  const { address: connectedAddress, chainId } = useAccount()
  const isWrongChain = chainId !== undefined && chainId !== ARC_CHAIN_ID

  const [intent, setIntent] = useState<Intent | null>(null)
  const [status, setStatus] = useState<SocialPayStatus>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Allowance of the connected wallet to the contract (exact bigint).
  const { data: allowanceData, isLoading: allowanceLoading } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'allowance',
    args: connectedAddress ? [connectedAddress, contract] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: configured && !!connectedAddress },
  })
  const allowance: bigint = (allowanceData ?? 0n) as bigint

  const approveTx = useWriteContract()
  const actionTx = useWriteContract()
  const { data: approveReceipt } = useWaitForTransactionReceipt({ hash: approveTx.data })
  const {
    data: actionReceipt,
    isLoading: actionConfirming,
    isError: actionReceiptError,
  } = useWaitForTransactionReceipt({ hash: actionTx.data })

  function fail(msg: string) {
    setErrorMsg(msg)
    setStatus('error')
  }

  function start(kind: 'pay' | 'tip', to: string, amountStr: string, text: string): boolean {
    if (!configured) {
      fail('Contract not configured yet — use direct transfer.')
      return false
    }
    if (BUSY.includes(status)) return false
    if (isWrongChain) {
      fail('Please switch to Arc Mainnet first — your details are preserved.')
      return false
    }
    const cleanTo = (to ?? '').trim()
    if (!isAddress(cleanTo)) {
      fail('Enter a valid Arc address (0x...)')
      return false
    }
    let raw: bigint
    try {
      raw = parseAmount(ARC_CHAIN_ID, (amountStr ?? '').trim()).raw
    } catch (e) {
      const code = (e as { code?: string })?.code
      fail(code === 'TOO_MANY_FRACTION_DIGITS' ? 'Too many decimal places (max 6)' : 'Enter a valid amount')
      return false
    }
    if (raw <= 0n) {
      fail('Enter a valid amount')
      return false
    }
    approveTx.reset()
    actionTx.reset()
    setErrorMsg(null)
    setIntent({ kind, to: cleanTo as `0x${string}`, raw, text })
    setStatus('checking')
    return true
  }

  function requestPay(to: string, amountStr: string, memo: string): boolean {
    return start('pay', to, amountStr, memo ?? '')
  }

  function requestTip(to: string, amountStr: string, postId: string): boolean {
    return start('tip', to, amountStr, postId ?? '')
  }

  function reset() {
    setIntent(null)
    setErrorMsg(null)
    setStatus('idle')
    approveTx.reset()
    actionTx.reset()
  }

  // Step 1: allowance known → send action directly, else approve first.
  useEffect(() => {
    if (!intent || status !== 'checking') return
    if (allowanceLoading) return
    if (allowance >= intent.raw) {
      setStatus('sending')
      actionTx.writeContract({
        address: contract,
        abi: SOCIAL_PAY_ABI,
        functionName: intent.kind === 'pay' ? 'pay' : 'tip',
        args: [intent.to, intent.raw, intent.text],
        chainId: ARC_CHAIN_ID,
      })
    } else {
      setStatus('approving')
      approveTx.writeContract({
        address: USDC_ADDRESS,
        abi: erc20Abi,
        functionName: 'approve',
        args: [contract, intent.raw],
        chainId: ARC_CHAIN_ID,
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intent, status, allowanceLoading, allowance])

  // Step 2a: approve confirmed on-chain → send the action.
  useEffect(() => {
    if (!intent || status !== 'approving') return
    if (approveReceipt?.status === 'success') {
      setStatus('sending')
      actionTx.writeContract({
        address: contract,
        abi: SOCIAL_PAY_ABI,
        functionName: intent.kind === 'pay' ? 'pay' : 'tip',
        args: [intent.to, intent.raw, intent.text],
        chainId: ARC_CHAIN_ID,
      })
    } else if (approveReceipt?.status === 'reverted') {
      fail('Approval failed onchain (reverted).')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveReceipt, intent, status])

  // Step 2b: approve write error (e.g. rejected in wallet).
  useEffect(() => {
    if (!intent || status !== 'approving') return
    if (approveTx.error) {
      const msg = approveTx.error.message?.toLowerCase() ?? ''
      fail(
        approveTx.error.message?.includes('user rejected') || msg.includes('user rejected') || msg.includes('denied')
          ? 'Transaction cancelled.'
          : 'Approval failed. Please try again.',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approveTx.error, intent, status])

  // Step 3: action receipt gates done vs failed (never treat fetch as success).
  useEffect(() => {
    if (!intent) return
    if (status !== 'sending' && status !== 'confirming') return
    if (actionTx.data && status === 'sending') setStatus('confirming')
    if (actionReceipt?.status === 'success') {
      setStatus('done')
    } else if (actionReceipt?.status === 'reverted' || actionReceiptError) {
      fail('Transaction failed onchain (reverted). Your payment was not sent.')
    } else if (actionTx.error && status !== 'idle') {
      const msg = actionTx.error.message?.toLowerCase() ?? ''
      fail(
        msg.includes('user rejected') || msg.includes('denied')
          ? 'Transaction cancelled.'
          : 'Transaction failed. Please try again.',
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionReceipt, actionReceiptError, actionTx.data, actionTx.error, intent, status])

  const actionHash = actionTx.data
  const explorerUrl = actionHash ? buildTxExplorerUrl(ARC_CHAIN_ID, actionHash) : undefined
  const error: Error | null = errorMsg ? new Error(errorMsg) : null

  return {
    isConfigured: configured,
    contractAddress: configured ? contract : undefined,
    status,
    isBusy: BUSY.includes(status),
    isApproving: status === 'approving',
    isSending: status === 'sending',
    isConfirming: status === 'confirming' || actionConfirming,
    isDone: status === 'done',
    isError: status === 'error',
    error,
    allowance,
    allowanceLoading,
    actionHash,
    actionReceipt,
    actionReceiptStatus: actionReceipt?.status,
    explorerUrl,
    isWrongChain,
    requestPay,
    requestTip,
    reset,
  }
}
