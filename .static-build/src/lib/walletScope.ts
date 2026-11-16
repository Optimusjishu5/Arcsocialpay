'use client'

// Keeps the app's private chat data in step with the connected wallet. It listens to the wallet
// connection itself (not to React), so the previous wallet's conversations and messages leave
// memory in the same moment the account changes or the wallet disconnects, before the screen redraws.

import { getAccount, watchAccount } from 'wagmi/actions'
import type { Config } from 'wagmi'
import { appStore } from '../store/appStore'
import { clearSession, setChatAuthState } from './chatSession'

let installed = false

function apply(status: string, address: string | undefined) {
  if (status === 'connected' && address) {
    appStore.setActiveWallet(address)
    return
  }
  // Disconnected (or switching): show nothing private and drop the sign-in for the old wallet.
  if (status === 'disconnected') {
    appStore.setActiveWallet(null)
    clearSession()
    setChatAuthState('off')
  }
}

export function installWalletScope(config: Config): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  const now = getAccount(config)
  apply(now.status, now.address)
  watchAccount(config, {
    onChange(account, prev) {
      // A different address under the same connection is a different wallet: leave the old one first.
      if (prev.address && account.address && prev.address.toLowerCase() !== account.address.toLowerCase()) {
        appStore.setActiveWallet(null)
        clearSession()
        setChatAuthState('off')
      }
      apply(account.status, account.address)
    },
  })
}
