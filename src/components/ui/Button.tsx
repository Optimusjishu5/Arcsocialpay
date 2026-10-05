import { ButtonHTMLAttributes } from 'react'
import clsx from 'clsx'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className = '',
  disabled,
  children,
  ...rest
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-semibold rounded-xl transition-all duration-150 select-none focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]'

  const variants = {
    primary: 'bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] focus-visible:ring-[var(--focus)]',
    secondary: 'border border-[var(--border-strong)] bg-[var(--surface-strong)] text-[var(--ink)] hover:bg-[var(--surface-muted)] focus-visible:ring-[var(--focus)]',
    ghost: 'text-[var(--ink-2)] hover:bg-[var(--surface-muted)] focus-visible:ring-[var(--focus)]',
    danger: 'bg-[var(--danger)] text-white hover:opacity-90 focus-visible:ring-[var(--danger)]',
  }

  const sizes = {
    sm: 'h-8 px-3 text-sm gap-1.5',
    md: 'h-10 px-4 text-sm gap-2',
    lg: 'h-12 px-6 text-base gap-2',
  }

  return (
    <button
      className={clsx(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && (
        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      )}
      {children}
    </button>
  )
}
