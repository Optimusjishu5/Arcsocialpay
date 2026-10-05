import { ReactNode, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  maxWidth?: string
}

export function Modal({ open, onClose, title, children, maxWidth = 'max-w-md' }: ModalProps) {
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      return () => { document.body.style.overflow = prev }
    }
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            className={`relative w-full ${maxWidth} rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden`}
            style={{ background: 'var(--surface-strong)', border: '1px solid var(--border)' }}
          >
            {/* Drag handle on mobile */}
            <div className="sm:hidden flex justify-center pt-3 pb-1">
              <div className="w-8 h-1 rounded-full" style={{ background: 'var(--border-strong)' }} />
            </div>
            {title && (
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
                <h2 className="display font-semibold text-base" style={{ color: 'var(--ink)' }}>{title}</h2>
                <button
                  onClick={onClose}
                  className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors hover:bg-[var(--surface-muted)]"
                  style={{ color: 'var(--muted)' }}
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>
            )}
            <div className="p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
