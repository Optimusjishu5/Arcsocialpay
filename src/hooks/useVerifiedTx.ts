'use client'

// Asks the Arc node (through /api/tx, or directly from the browser on a static host) whether a transaction exists, whether it succeeded, and which
// SocialPay events its receipt holds. A transaction that is not on chain yet is asked again every few
// seconds, so a payment that was just sent turns "verified" as soon as the network has it.

import { useEffect, useState } from 'react'
import type { TxVerification } from '../server/arcRpc'
import { isTxHash } from '../lib/arcExplorers'

type Found = Extract<TxVerification, { found: true }>

export type VerifiedTx =
  | { state: 'idle' }
  | { state: 'checking' }
  /** The node has the transaction and its receipt, transaction and logs agree. */
  | { state: 'verified'; tx: Found }
  /** The node has it but the pieces disagree. Never linked. */
  | { state: 'inconsistent'; mismatches: string[] }
  /** The node does not know this hash (yet). */
  | { state: 'not-found' }
  | { state: 'error' }

const done = new Map<string, VerifiedTx>()
const RETRY_MS = 3_000
const GIVE_UP_MS = 3 * 60_000

function toResult(body: TxVerification): VerifiedTx {
  if (!body.found) return { state: 'not-found' }
  return body.verified ? { state: 'verified', tx: body } : { state: 'inconsistent', mismatches: body.mismatches }
}

/** Asks the Arc node from the browser. Used when this app has no server (a static host) or its server cannot reach the node. */
async function askFromBrowser(hash: string): Promise<VerifiedTx> {
  try {
    const { verifyTransaction } = await import('../server/arcRpc')
    return toResult(await verifyTransaction(hash))
  } catch {
    return { state: 'error' }
  }
}

async function ask(hash: string): Promise<VerifiedTx> {
  try {
    const res = await fetch(`/api/tx?hash=${hash}`, { cache: 'no-store' })
    if (res.ok) return toResult((await res.json()) as TxVerification)
    if (res.status === 400 || res.status === 429) return { state: 'error' }
  } catch {
    // no server to ask: read the node directly below
  }
  return askFromBrowser(hash)
}

export function useVerifiedTx(hash: string | undefined | null, enabled = true): VerifiedTx {
  const key = isTxHash(hash) ? hash.toLowerCase() : ''
  // The latest answer, tagged with the hash it is for. An answer for another hash is never shown.
  const [answer, setAnswer] = useState<{ key: string; result: VerifiedTx }>({ key: '', result: { state: 'idle' } })

  useEffect(() => {
    if (!key || !enabled || done.has(key)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const started = Date.now()
    const run = async () => {
      const r = await ask(key)
      if (cancelled) return
      if (r.state === 'verified' || r.state === 'inconsistent') done.set(key, r)
      setAnswer({ key, result: r })
      // A new transaction: keep asking until the network has it.
      if ((r.state === 'not-found' || r.state === 'error') && Date.now() - started < GIVE_UP_MS) timer = setTimeout(() => { void run() }, RETRY_MS)
    }
    void run()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, enabled])

  if (!key || !enabled) return { state: 'idle' }
  return done.get(key) ?? (answer.key === key ? answer.result : { state: 'checking' })
}
