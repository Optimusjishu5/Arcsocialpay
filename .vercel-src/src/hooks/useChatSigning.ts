'use client'

// Wallet signatures for chat messages (EIP-712). Signing is only needed when
// the server keeps chat history (Turso configured); in local-only mode there is
// nobody to prove anything to, so no signature prompt appears.

import { useCallback, useEffect, useState } from 'react'
import { useSignTypedData, useSwitchChain, useAccount } from 'wagmi'
import { getAddress } from 'viem'
import { ARC_CHAIN_ID } from '../chains'
import { CHAT_DOMAIN, CHAT_TYPES, chatTypedMessage } from '../lib/chatAuth'
import { generateId } from '../utils/format'

export interface SignedMessage {
  id: string
  createdAt: number
  signature: string
}

export function useChatSigning() {
  const { chainId } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChainAsync } = useSwitchChain()
  const [required, setRequired] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: { turso?: { configured?: boolean } }) => { if (!cancelled) setRequired(!!j?.turso?.configured) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const sign = useCallback(
    async (f: { conversationId: string; sender: string; content: string; replyToId?: string }): Promise<SignedMessage> => {
      // Wallets only sign typed data for the chain named in the domain.
      if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
      const id = generateId()
      const createdAt = Date.now()
      const signature = await signTypedDataAsync({
        domain: CHAT_DOMAIN,
        types: CHAT_TYPES,
        primaryType: 'ChatMessage',
        message: chatTypedMessage({ id, conversationId: f.conversationId, sender: getAddress(f.sender), content: f.content, createdAt, replyToId: f.replyToId }),
      })
      return { id, createdAt, signature }
    },
    [chainId, signTypedDataAsync, switchChainAsync],
  )

  return { required, sign }
}
