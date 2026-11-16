'use client'

import { useMemo } from 'react'
import type { EvmChainDef } from '../../lib/circleKit'
import { useBridgeChains } from '../../lib/bridgeChains'
import { ChainPicker } from './ChainPicker'

/** Network picker for the networks Circle's bridge supports, with logos from LI.FI's chain list. */
export function KitChainPicker({ label, value, chains, onChange, disabled }: {
  label: string
  value: string
  chains: EvmChainDef[]
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const { chains: logos } = useBridgeChains()
  const options = useMemo(() => {
    const list = chains.map((c) => ({
      key: String(c.chain), id: c.chainId, name: c.name, logoURI: logos.find((l) => l.id === c.chainId)?.logoURI,
    }))
    return list.length ? list : [{ key: value, id: 0, name: value }]
  }, [chains, logos, value])
  return <ChainPicker label={label} value={value} options={options} onChange={onChange} disabled={disabled} loading={chains.length === 0} />
}
