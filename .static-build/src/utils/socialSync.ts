// Decides how a snapshot of posts or comments from the server is merged with what this
// browser already has, so a fresh local post is never mistaken for one "deleted elsewhere".

interface Item {
  id: string
  createdAt: number
}

interface ReconcileInput<T extends Item> {
  /** What the server returned. */
  server: T[]
  /** What this browser has now. */
  local: T[]
  /** Items the server has acknowledged, with the time it did so (ms). */
  confirmedAt: Map<string, number>
  /** When the request that produced `server` was started (ms). */
  startedAt: number
  /** The page size that was requested. A full page means older items were cut off. */
  limit: number
  /** Last server version of each item, as JSON. Only for items that can be edited. */
  snapshots?: Map<string, string>
}

export interface Reconciled<T extends Item> {
  /** The list to merge into the app (server items, with unsynced local edits kept). */
  items: T[]
  /** Items that really were removed on another device. */
  gone: Set<string>
}

export function reconcileWithServer<T extends Item>(input: ReconcileInput<T>): Reconciled<T> {
  const { server, local, confirmedAt, startedAt, limit, snapshots } = input
  const localById = new Map(local.map((x) => [x.id, x]))
  const serverIds = new Set(server.map((x) => x.id))
  // A full page means the server only showed the newest items: older ones are not "missing".
  const floor = server.length >= limit ? Math.min(...server.map((x) => x.createdAt)) : -Infinity

  const items: T[] = []
  for (const s of server) {
    const mine = localById.get(s.id)
    if (snapshots) {
      // Deleted here, the delete has not reached the server yet: do not bring it back.
      if (!mine && snapshots.has(s.id)) continue
      // Changed here (a like, an edit) and not sent yet: keep the local version.
      if (mine && snapshots.has(s.id) && JSON.stringify(mine) !== snapshots.get(s.id)) {
        items.push(mine)
        continue
      }
    }
    items.push(s)
  }

  const gone = new Set<string>()
  for (const [id, at] of confirmedAt) {
    if (serverIds.has(id)) continue
    const mine = localById.get(id)
    if (!mine) continue
    // The server acknowledged it after this request began, so the response could not know about it.
    if (at >= startedAt) continue
    if (mine.createdAt < floor) continue
    gone.add(id)
  }
  return { items, gone }
}
