import { strings } from '../../i18n'

/** YouTube's privacy-enhanced player (no cookies until it's played), for an embed URL. */
export function YouTubePlayer({ src, title, lazy = false }: { src: string; title: string; lazy?: boolean }) {
  return (
    <iframe
      src={src}
      title={title}
      allow={strings.youTubePlayer.accelerometerAutoplayClipboardWrite}
      referrerPolicy="strict-origin-when-cross-origin"
      allowFullScreen
      loading={lazy ? 'lazy' : undefined}
    />
  )
}
