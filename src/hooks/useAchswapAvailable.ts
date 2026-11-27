'use client'

// Whether AchSwap prices are set up on this server. The swap screen only shows the route when they are.

import { useEffect, useState } from 'react'

let known: boolean | null = null

export function useAchswapAvailable(): boolean {
  const [ok, setOk] = useState<boolean>(known === true)
  useEffect(() => {
    if (known !== null) return
    let cancelled = false
    fetch('/api/achswap')
      .then((r) => (r.ok ? r.json() : { configured: false }))
      .then((j: { configured?: boolean }) => { known = !!j.configured; if (!cancelled) setOk(known) })
      .catch(() => undefined) // stays hidden; tried again next time the screen opens
    return () => { cancelled = true }
  }, [])
  return ok
}
