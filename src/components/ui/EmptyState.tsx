import { ReactNode } from 'react'

interface Props {
  icon: ReactNode
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'var(--surface-muted)', color: 'var(--muted)' }}>
        {icon}
      </div>
      <div>
        <p className="font-semibold text-base mb-1" style={{ color: 'var(--ink)' }}>{title}</p>
        {description && (
          <p className="text-sm max-w-xs" style={{ color: 'var(--muted)' }}>{description}</p>
        )}
      </div>
      {action}
    </div>
  )
}
