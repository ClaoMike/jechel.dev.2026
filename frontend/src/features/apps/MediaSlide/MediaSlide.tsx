import { FittedImage } from '../../../components/FittedImage'
import { PlayIcon } from '../../../components/icons/icons'
import type { AppMedia } from '../../../services/api'
import { YouTubePlayer } from '../../youtube/YouTubePlayer/YouTubePlayer'
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

/** One slide: an image, a video, or a YouTube video (its player only while on show, its thumbnail otherwise); nothing for a bad YouTube link. */
export function MediaSlide({ item, index, active, label, show }: MediaSlideProps) {
  if (item.kind === 'image') return <FittedImage src={item.url} alt={label} loading={index === 0 ? 'eager' : 'lazy'} />
  if (item.kind === 'video') return <video src={item.url} data-index={index} controls preload="metadata" playsInline aria-label={label} />
  const id = youTubeIdIn(item.url)
  if (!id) return null
  if (active) return <YouTubePlayer src={youTubeEmbedUrl(id)} title={label} />
  return (
    <button type="button" className="carousel-youtube-thumb" aria-label={`Show ${label}`} onClick={show}>
      <img src={youTubeThumbnail(id)} alt="" loading="lazy" />
      <PlayIcon size={40} />
    </button>
  )
}
