import { AVATAR_DATA_URL_MAX } from '@/lib/chatAuth'

const ACCEPTED = /^image\/(jpeg|png|webp)$/
const MAX_FILE_BYTES = 10 * 1024 * 1024
/** Longest side, tried in order until the result is small enough to store. */
const SIDES = [640, 512, 384, 256]

/**
 * Turns a picked photo into a small JPEG data URL. The whole picture is kept
 * (nothing is cropped, the shape is preserved), only scaled down.
 */
export async function fileToAvatarDataUrl(file: File): Promise<string> {
  if (!ACCEPTED.test(file.type)) throw new Error('Choose a JPEG, PNG or WebP image.')
  if (file.size > MAX_FILE_BYTES) throw new Error('That image is larger than 10 MB.')

  const bitmap = await createImageBitmap(file)
  try {
    for (const side of SIDES) {
      const scale = Math.min(1, side / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Your browser could not process the image.')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, w, h)
      for (const quality of [0.85, 0.7, 0.55]) {
        const url = canvas.toDataURL('image/jpeg', quality)
        if (url.length <= AVATAR_DATA_URL_MAX) return url
      }
    }
    throw new Error('That image is too detailed to use. Try a simpler photo.')
  } finally {
    bitmap.close()
  }
}
