/** YouTube's privacy-enhanced player (no cookies until it's played), for an embed URL. */
export function YouTubePlayer({ src, title, lazy = false }: { src: string; title: string; lazy?: boolean }) {
  return (
    <iframe
      src={src}
      title={title}
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      loading={lazy ? 'lazy' : undefined}
    />
  )
}
