import { toast } from 'sonner'

/** Centralized clipboard helper: wraps writeText with fallback + toasts. */
export async function copyText(text: string, successMessage = 'Copied'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage, { duration: 1500 })
    return true
  } catch {
    // Fallback for non-secure contexts / denied permissions.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        toast.success(successMessage, { duration: 1500 })
        return true
      }
    } catch {
      /* fall through to error toast */
    }
    toast.error('Copy failed — please copy manually.')
    return false
  }
}
