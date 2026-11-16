'use client'

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Maximize2, X } from 'lucide-react'

interface PhotoFrameProps {
  url: string
  size: number
  /** Ring colors (profile color). */
  from: string
  to: string
  /** Tap to open the full-size viewer. */
  zoomable?: boolean
  alt?: string
}

/**
 * Shows a profile photo in full: the whole picture is visible (nothing cropped),
 * sitting on a soft blurred copy of itself so any leftover space still looks good.
 */
export function PhotoFrame({ url, size, from, to, zoomable = true, alt = 'Profile picture' }: PhotoFrameProps) {
  const [open, setOpen] = useState(false)
  const radius = Math.round(size / 2)
  // The largest square that fits inside a circle: any photo shown inside it is never clipped by the round edge.
  const inset = Math.round(size * 0.146)

  const frame = (
    <span
      className="relative block overflow-hidden"
      style={{ width: size, height: size, borderRadius: radius, background: 'var(--surface)' }}
    >
      <span
        aria-hidden
        className="absolute inset-0 scale-125"
        style={{ backgroundImage: `url(${url})`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(16px) saturate(1.4)', opacity: 0.9 }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={alt} draggable={false} className="absolute object-contain drop-shadow-lg" style={{ inset, width: size - inset * 2, height: size - inset * 2 }} />
      {zoomable && (
        <span
          className="absolute bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full flex items-center justify-center text-white"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }}
        >
          <Maximize2 size={12} />
        </span>
      )}
    </span>
  )

  return (
    <>
      <span
        className="block p-1"
        style={{
          borderRadius: radius + 4,
          background: `linear-gradient(135deg, ${from}, ${to})`,
          boxShadow: `0 14px 30px -12px ${to}`,
        }}
      >
        <span className="block p-[3px]" style={{ borderRadius: radius + 2, background: 'var(--surface)' }}>
          {zoomable ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="View full profile picture"
              className="block transition-transform active:scale-[0.98]"
              style={{ borderRadius: radius }}
            >
              {frame}
            </button>
          ) : (
            frame
          )}
        </span>
      </span>
      {open && <Lightbox url={url} alt={alt} onClose={() => setOpen(false)} />}
    </>
  )
}

function Lightbox({ url, alt, onClose }: { url: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return createPortal(
    <div
      role="dialog"
      aria-label="Profile picture"
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(5,10,20,0.88)', backdropFilter: 'blur(10px)' }}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center text-white"
        style={{ background: 'rgba(255,255,255,0.14)' }}
      >
        <X size={18} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={alt}
        draggable={false}
        onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-[88vh] object-contain rounded-2xl"
        style={{ boxShadow: '0 30px 80px -20px rgba(0,0,0,0.7)' }}
      />
    </div>,
    document.body,
  )
}
