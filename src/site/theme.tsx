'use client'

import { useCallback, useSyncExternalStore } from 'react'
import { Moon, Sun } from 'lucide-react'

type Theme = 'light' | 'dark'

// Same storage entry the app uses, so the theme chosen here carries into the app and back.
const STORAGE_KEY = 'arc-socialpay-v1'

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

function readTheme(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function persist(theme: Theme) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : null
    const base = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : { version: 1 }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...base, theme }))
  } catch {
    // Storage unavailable: the choice just lasts for this visit.
  }
}

export function useSiteTheme() {
  // Server and first client render agree on "dark"; the real value is read once the page is in the browser.
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'dark' as Theme)

  const apply = useCallback((next: Theme) => {
    document.documentElement.classList.toggle('dark', next === 'dark')
    persist(next)
    listeners.forEach((l) => l())
  }, [])

  return { theme, setTheme: apply, toggle: () => apply(theme === 'dark' ? 'light' : 'dark') }
}

export function ThemeToggle() {
  const { theme, toggle } = useSiteTheme()
  const label = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="site-focus inline-flex h-11 w-11 items-center justify-center rounded-full site-ink transition-colors hover:bg-[var(--surface)]"
      style={{ border: '1px solid var(--border)' }}
    >
      {theme === 'dark' ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  )
}
