import type { AppMedia } from '../../../services/api'
import { youTubeEmbedUrl, youTubeIdIn, youTubeThumbnail } from '../media'

export interface MediaSlideProps {
  item: AppMedia
  index: number
  /** The slide on show: only it loads a YouTube player. */
  active: boolean
  /** "LIGHTHOUSE, image 1 of 3". */
  label: string
  show: () => void
}

/** What the slide is: an image, a video, a YouTube player (on show) or its thumbnail (elsewhere), or nothing for a bad YouTube link. */
export function useMediaSlideViewModel({ item, index, active, label }: MediaSlideProps) {
  if (item.kind === 'image') return { kind: 'image' as const, src: item.url, alt: label, loading: index === 0 ? ('eager' as const) : ('lazy' as const) }
  if (item.kind === 'video') return { kind: 'video' as const, src: item.url, index, label }
  const id = youTubeIdIn(item.url)
  if (!id) return { kind: 'none' as const }
  return active ? { kind: 'youtube' as const, src: youTubeEmbedUrl(id), label } : { kind: 'thumbnail' as const, src: youTubeThumbnail(id), label: `Show ${label}` }
}
