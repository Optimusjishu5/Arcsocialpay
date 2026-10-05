// ── Arc wallet + USDC hooks ─────────────────────────────────────────────────

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt, useSwitchChain } from 'wagmi'
import { erc20Abi } from 'viem'
import { arcTestnet } from 'viem/chains'
import { getUsdc, buildTxExplorerUrl } from '@/onchain-facts'
import { Amount, usdcDecimalsFor, parseAmount } from '@/onchain-money'

export const ARC_CHAIN_ID = arcTestnet.id // 5042002
const USDC_FACT = getUsdc(ARC_CHAIN_ID)!
export const USDC_ADDRESS = USDC_FACT.address as `0x${string}`
export const USDC_DECIMALS = USDC_FACT.decimals

export function useArcAccount() {
  const { address, chainId, isConnected, isConnecting, isDisconnected } = useAccount()
  const isArcChain = chainId === ARC_CHAIN_ID
  const { switchChain, isPending: isSwitching } = useSwitchChain()

  function switchToArc() {
    switchChain({ chainId: ARC_CHAIN_ID })
  }

  return { address, chainId, isConnected, isConnecting, isDisconnected, isArcChain, isSwitching, switchToArc }
}

export function useUsdcBalance(address?: `0x${string}`) {
  const { data, isLoading, refetch } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 10_000 },
  })

  const raw = (data) ?? 0n
  const decimals = usdcDecimalsFor(ARC_CHAIN_ID)
  const amount = Amount.fromRaw(raw, decimals)
  const formatted = amount.toFixed(2)
  const display = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(parseFloat(formatted))

  return { raw, amount, formatted, display, isLoading, refetch }
}

export function useSendUsdc() {
  const { address, chainId } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: hash, isPending, error: writeError, reset } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, isError: isReceiptError } = useWaitForTransactionReceipt({ hash })

  const isWrongChain = chainId !== ARC_CHAIN_ID

  function send(recipient: `0x${string}`, amountStr: string): void {
    if (isWrongChain) {
      switchChain({ chainId: ARC_CHAIN_ID })
      return
    }
    const parsed = parseAmount(ARC_CHAIN_ID, amountStr)
    writeContract({
      address: USDC_ADDRESS,
      abi: erc20Abi,
      functionName: 'transfer',
      args: [recipient, parsed.raw],
      chainId: ARC_CHAIN_ID,
    })
  }

  const explorerUrl = hash ? buildTxExplorerUrl(ARC_CHAIN_ID, hash) : undefined

  return {
    send,
    hash,
    isPending,
    isConfirming,
    isSuccess,
    isError: isReceiptError || !!writeError,
    error: writeError,
    explorerUrl,
    isWrongChain,
    connectedAddress: address,
    reset,
  }
}

export function formatUsdc(amount: Amount | bigint | string, decimals = USDC_DECIMALS): string {
  let raw: bigint
  if (typeof amount === 'bigint') raw = amount
  else if (typeof amount === 'string') raw = BigInt(Math.round(parseFloat(amount) * 10 ** decimals))
  else raw = amount.raw
  const num = Number(raw) / 10 ** decimals
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(num)
}
