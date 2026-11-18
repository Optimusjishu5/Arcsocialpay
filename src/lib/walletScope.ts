'use client'

// Keeps the app's private chat data in step with the connected wallet. It listens to the wallet
// connection itself (not to React), so the previous wallet's conversations and messages leave
// memory in the same moment the account changes or the wallet disconnects, before the screen redraws.

import { getAccount, watchAccount } from 'wagmi/actions'
import type { Config } from 'wagmi'
import { appStore } from '../store/appStore'
import { clearSession, setChatAuthState } from './chatSession'

let installed = false

// Phone wallets drop and restore the connection for a moment when you switch to the wallet app to
// sign. Chats leave the screen at once, but the saved sign-in only ends if the wallet stays gone;
// otherwise you would be asked to sign again right after signing. Disconnecting with the app's own
// button ends the sign-in immediately.
const SIGN_IN_GRACE_MS = 2 * 60_000
let graceTimer: ReturnType<typeof setTimeout> | null = null

function apply(status: string, address: string | undefined) {
  if (status === 'connected' && address) {
    if (graceTimer) { clearTimeout(graceTimer); graceTimer = null }
    appStore.setActiveWallet(address)
    return
  }
  // Disconnected (or switching): show nothing private.
  if (status === 'disconnected') {
    appStore.setActiveWallet(null)
    setChatAuthState('off')
    if (!graceTimer) graceTimer = setTimeout(() => { graceTimer = null; clearSession() }, SIGN_IN_GRACE_MS)
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
