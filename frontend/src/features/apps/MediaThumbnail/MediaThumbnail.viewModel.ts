import type { AppMedia } from '../../../services/api'
import { youTubeIdIn, youTubeThumbnail } from '../media'

/** An image as itself; a video as its first frame; a YouTube video as its thumbnail. */
export function useMediaThumbnailViewModel({ item }: { item: AppMedia }) {
  if (item.kind === 'image') return { kind: 'image' as const, src: item.url }
  const youTube = item.kind === 'youtube' ? youTubeIdIn(item.url) : null
  return youTube ? { kind: 'youtube' as const, src: youTubeThumbnail(youTube) } : { kind: 'video' as const, src: item.url }
}
