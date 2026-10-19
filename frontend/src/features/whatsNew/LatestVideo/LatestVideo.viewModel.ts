import type { YouTubeVideo } from '../../../services/api'
import { formatDate } from '../../../utils/formatDate'

/** The card's kind and date, for a video: when it was published. */
export function useLatestVideoViewModel({ video }: { video: YouTubeVideo }) {
  return { kind: 'New video', date: formatDate(video.publishedAt), dateTime: video.publishedAt, title: video.title }
}
