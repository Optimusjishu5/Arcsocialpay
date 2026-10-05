// ── Arc wallet + USDC hooks ─────────────────────────────────────────────────
// Money rules: raw USDC is always bigint (6-dec smallest units). Parsing via
// Amount.parse / parseAmount (exact), display via Amount.toFixed + string
// grouping. Never Number(raw)/10**dec or parseFloat for validation/balances.

import { useState } from 'react'
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi, isAddress } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor, parseAmount } from '@/onchain-money'

export const ARC_CHAIN_ID = arcTestnet.id // 5042002
const USDC_FACT = getUsdc(ARC_CHAIN_ID)!
export const USDC_ADDRESS = USDC_FACT.address as `0x${string}`
export const USDC_DECIMALS = USDC_FACT.decimals

// Local grouping for exact fixed-point strings (no Number, so >2^53 safe).
function groupFixed(fixed: string): string {
  const sep = fixed.indexOf('.')
  const intRaw = sep === -1 ? fixed : fixed.slice(0, sep)
  const fracRaw = sep === -1 ? '' : fixed.slice(sep + 1)
  const sign = intRaw.startsWith('-') ? '-' : ''
  const unsignedInt = sign ? intRaw.slice(1) : intRaw
  const grouped = unsignedInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return fracRaw ? `${sign}${grouped}.${fracRaw}` : `${sign}${grouped}`
}

export function useArcAccount() {
  const { address, chainId, isConnected, isConnecting, isDisconnected } = useAccount()
  const isArcChain = chainId === ARC_CHAIN_ID
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()

  function switchToArc() {
    // switchChain reports async failure via switchError — exposed below so
    // callers never swallow a rejected switch silently.
    switchChain({ chainId: ARC_CHAIN_ID })
  }

  return { address, chainId, isConnected, isConnecting, isDisconnected, isArcChain, isSwitching, switchError, switchToArc }
}

export function useUsdcBalance(address?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000, staleTime: 5_000 },
  })

  const raw: bigint = (data ?? 0n) as bigint
  const decimals = usdcDecimalsFor(ARC_CHAIN_ID)
  const amount = Amount.fromRaw(raw, decimals)
  // Exact 2-dec display via Amount.toFixed (string slicing, no float).
  const formatted = amount.toFixed(2)
  // Grouped UI string without parseFloat(formatted) precision loss.
  const display = groupFixed(formatted)

  return { raw, amount, formatted, display, isLoading, refetch }
}

export interface SendResult {
  ok: boolean
  error?: string
  switched?: boolean
}

export function useSendUsdc() {
  const { address, chainId } = useAccount()
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()
  const { writeContract, data: hash, isPending, error: writeError, reset: resetWrite } = useWriteContract()
  const { data: receipt, isLoading: isConfirming, isSuccess, isError: isReceiptError } = useWaitForTransactionReceipt({ hash })
  const [sendError, setSendError] = useState<string | null>(null)

  const isWrongChain = chainId !== ARC_CHAIN_ID
  // Exposed for callers: 'success' | 'reverted' | undefined (still pending).
  const receiptStatus = receipt?.status
  const isReverted = receiptStatus === 'reverted'

  function send(recipient: `0x${string}` | string, amountStr: string): SendResult {
    // Guard against double-submit while wallet confirm or receipt is pending.
    if (isPending || isConfirming) {
      return { ok: false, error: 'Transaction already in progress' }
    }
    if (isWrongChain) {
      // Don't silently drop the send intent: trigger the switch and tell the
      // caller via `switched` + isSwitching/switchError (no swallowed rejection).
      try {
        switchChain({ chainId: ARC_CHAIN_ID })
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to switch network'
        return { ok: false, error: msg, switched: true }
      }
      return { ok: false, error: 'Switching to Arc Testnet...', switched: true }
    }
    const to = (recipient ?? '').trim() as `0x${string}`
    if (!isAddress(to)) {
      const msg = 'Enter a valid Ethereum address (0x...)'
      setSendError(msg)
      return { ok: false, error: msg }
    }
    let raw: bigint
    try {
      // Exact parse: rejects 1e6 notation, 7+ decimals, negatives via throw.
      raw = parseAmount(ARC_CHAIN_ID, amountStr.trim()).raw
    } catch (e) {
      const code = (e as { code?: string })?.code
      const msg = code === 'TOO_MANY_FRACTION_DIGITS' ? 'Too many decimal places (max 6)' : 'Enter a valid amount'
      // Mapped to error state — never throws uncaught to React.
      setSendError(msg)
      return { ok: false, error: msg }
    }
    if (raw <= 0n) {
      const msg = 'Enter a valid amount'
      setSendError(msg)
      return { ok: false, error: msg }
    }
    setSendError(null)
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [to, raw],
      chainId: ARC_CHAIN_ID, // pinned: never use the active chainId here
    })
    return { ok: true }
  }

  function reset() {
    setSendError(null)
    resetWrite()
  }

  const explorerUrl = hash ? buildTxExplorerUrl(ARC_CHAIN_ID, hash) : undefined
  const error: Error | null = (sendError ? new Error(sendError) : null) ?? writeError ?? switchError ?? null

  return {
    send,
    hash,
    receipt,
    receiptStatus,
    isReverted,
    isPending,
    isConfirming,
    isBusy: isPending || isConfirming,
    isSuccess,
    isError: isReceiptError || isReverted || !!error,
    error,
    sendError,
    explorerUrl,
    isWrongChain,
    isSwitching,
    switchError,
    connectedAddress: address,
    reset,
  }
}

// DISPLAY-ONLY: grouped USDC string for UI. Never use for validation or
// balance checks (use Amount/raw bigint). Exact via Amount paths only.
export function formatUsdc(amount: Amount | bigint | string, decimals = USDC_DECIMALS): string {
  try {
    let amt: Amount
    if (typeof amount === 'bigint') {
      amt = Amount.fromRaw(amount, decimals)
    } else if (typeof amount === 'string') {
      const trimmed = amount.trim()
      if (trimmed === '') return '0.00'
      amt = Amount.parse(trimmed, decimals)
    } else {
      amt = amount.decimals === decimals ? amount : amount.toDecimals(decimals, 'trunc')
    }
    const exact = amt.toString()
    const sep = exact.indexOf('.')
    const intRaw = sep === -1 ? exact : exact.slice(0, sep)
    const fracRaw = sep === -1 ? '' : exact.slice(sep + 1)
    const sign = intRaw.startsWith('-') ? '-' : ''
    const unsignedInt = sign ? intRaw.slice(1) : intRaw
    const groupedInt = unsignedInt.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    const frac = fracRaw.padEnd(2, '0')
    return `${sign}${groupedInt}.${frac}`
  } catch {
    return '0.00'
  }
}
