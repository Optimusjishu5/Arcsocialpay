import './globals.css'
import { Providers } from './providers'
import App from '@/App'

// Wallet + chat state is fully client-side; skip static prerender.
export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <Providers>
      <App />
    </Providers>
  )
}
