// Payments made through the SocialPay contract carry their origin in the onchain memo, so any
// device (and anyone reading the explorer) can tell a request payment from a split or a
// scheduled one without relying on this browser's saved records.
//
//   "[request] Lunch"  ->  kind "request", note "Lunch"
//
// The tag is added by the sender's app. It labels a payment; it never changes where money goes.

export type MemoKind = 'batch' | 'request' | 'split' | 'schedule'

const KINDS: readonly MemoKind[] = ['batch', 'request', 'split', 'schedule']
const TAG = /^\[(batch|request|split|schedule)\]\s*/i

/** The memo to put onchain: the user's note, led by the origin tag when there is one. */
export function tagMemo(kind: MemoKind | undefined, note: string): string {
  const clean = note.trim()
  if (!kind) return clean
  return clean ? `[${kind}] ${clean}` : `[${kind}]`
}

/** Splits an onchain memo into its origin tag (if any) and the note the sender typed. */
export function parseMemo(memo: string | undefined): { kind?: MemoKind; note?: string } {
  if (!memo) return {}
  const m = TAG.exec(memo)
  if (!m) return { note: memo }
  const kind = m[1].toLowerCase() as MemoKind
  if (!KINDS.includes(kind)) return { note: memo }
  const note = memo.slice(m[0].length).trim()
  return { kind, note: note || undefined }
}
