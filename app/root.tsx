'use client'

import { Providers } from './providers'
import App from '@/App'

export default function Root() {
  return (
    <Providers>
      <App />
    </Providers>
  )
}
