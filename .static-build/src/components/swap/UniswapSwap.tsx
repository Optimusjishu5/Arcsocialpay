'use client'

import { BestPriceView } from './BestPriceView'
import type { SwapProviderId } from '../../lib/swapProviders'

const UNISWAP_ONLY: readonly SwapProviderId[] = ['uniswap']

/** Uniswap v3 pools on Arc, priced on their own. */
export function UniswapSwap() {
  return <BestPriceView routes={UNISWAP_ONLY} />
}
