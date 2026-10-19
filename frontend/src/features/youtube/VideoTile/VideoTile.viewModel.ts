import type { YouTubeVideo } from '../../../services/api'
import { formatDate } from '../../../utils/formatDate'

/** The video's date, as shown and as a machine-readable date. */
export function useVideoTileViewModel({ item }: { item: YouTubeVideo }) {
  return { date: formatDate(item.publishedAt), dateTime: item.publishedAt }
}
