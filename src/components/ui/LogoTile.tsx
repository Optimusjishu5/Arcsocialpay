/** A provider's official logo in a rounded tile. Fixed size and async decoding keep lists from shifting or stalling. */
export function LogoTile({ src, size = 32 }: { src: string; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      className="flex-shrink-0 object-cover"
      style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), border: '1px solid var(--border)', background: '#fff', boxShadow: '0 6px 14px -8px rgba(15,23,42,0.35)' }}
    />
  )
}
