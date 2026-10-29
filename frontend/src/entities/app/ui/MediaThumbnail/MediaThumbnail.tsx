import { FittedImage } from '@/shared/ui/FittedImage'
import { PlayIcon } from '@/shared/ui/icons'
import type { AppMedia } from '@/shared/api'
import { youTubeIdIn, youTubeThumbnail } from '../../lib/media'

/**
 * A small picture of an image or video in the app's media list: an image as itself, a video as its first frame, a
 * YouTube video as its thumbnail (videos with a play sign).
 */
export function MediaThumbnail({ item }: { item: AppMedia }) {
  if (item.kind === 'image') return <FittedImage className="media-list-thumb" src={item.url} alt="" />
  const youTube = item.kind === 'youtube' ? youTubeIdIn(item.url) : null
  return (
    <span className="media-list-thumb media-list-video">
      {youTube ? <img src={youTubeThumbnail(youTube)} alt="" draggable={false} /> : <video src={item.url} muted preload="metadata" aria-hidden="true" />}
      <PlayIcon size={20} />
    </span>
  )
}
