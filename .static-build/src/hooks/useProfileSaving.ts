'use client'

// Saves profile edits (username, bio, picture, color). When the server keeps
// profiles, the wallet signs the edit first (free, no gas) so nobody can change
// someone else's profile. Without server storage the edit is saved in this browser only.

import { useCallback, useEffect, useState } from 'react'
import { useAccount, useSignTypedData, useSwitchChain } from 'wagmi'
import { getAddress } from 'viem'
import { ARC_CHAIN_ID } from '../chains'
import { PROFILE_DOMAIN, PROFILE_TYPES, profileTypedMessage } from '../lib/chatAuth'
import { appStore } from '../store/appStore'

export interface ProfileEdit {
  username: string
  bio: string
  avatarUrl: string
  accent: string
}

export function useProfileSaving() {
  const { chainId } = useAccount()
  const { signTypedDataAsync } = useSignTypedData()
  const { switchChainAsync } = useSwitchChain()
  const [serverStored, setServerStored] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then((r) => r.json())
      .then((j: { turso?: { configured?: boolean } }) => { if (!cancelled) setServerStored(!!j?.turso?.configured) })
      .catch(() => undefined)
    return () => { cancelled = true }
  }, [])

  const save = useCallback(
    async (address: string, edit: ProfileEdit): Promise<void> => {
      const owner = getAddress(address)
      if (serverStored) {
        if (chainId !== ARC_CHAIN_ID) await switchChainAsync({ chainId: ARC_CHAIN_ID })
        const updatedAt = Date.now()
        const signature = await signTypedDataAsync({
          domain: PROFILE_DOMAIN,
          types: PROFILE_TYPES,
          primaryType: 'ProfileUpdate',
          message: profileTypedMessage({ address: owner, ...edit, updatedAt }),
        })
        const res = await fetch('/api/profiles/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: owner, ...edit, updatedAt, signature }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? 'Could not save your profile.')
        }
      }
      appStore.upsertProfile(owner, { address: owner, ...edit })
    },
    [serverStored, chainId, signTypedDataAsync, switchChainAsync],
  )

  return { save, serverStored }
}
