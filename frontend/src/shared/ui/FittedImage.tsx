/**
 * An image shown whole, scaled to fit its frame whatever its shape (a tall phone screenshot,
 * a wide banner), on a blurred, enlarged copy of itself instead of empty bars. The frame's
 * size comes from its CSS (e.g. an aspect ratio), never from the image. Both are the same file,
 * so it's downloaded once.
 */
export function FittedImage({ src, alt, className = '', loading = 'lazy' }: { src: string; alt: string; className?: string; loading?: 'lazy' | 'eager' }) {
  return (
    <span className={`fitted-image ${className}`.trim()}>
      <img className="fitted-image-backdrop" src={src} alt="" aria-hidden="true" loading={loading} draggable={false} />
      <img className="fitted-image-main" src={src} alt={alt} loading={loading} draggable={false} />
    </span>
  )
}
