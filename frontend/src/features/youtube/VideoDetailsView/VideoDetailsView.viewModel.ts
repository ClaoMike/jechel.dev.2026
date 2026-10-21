import type { YouTubeVideo } from '../../../services/api'
import { youTubeEmbedUrl } from '../../apps/media'

/** The player's address. */
export function useVideoDetailsViewViewModel({ video }: { video: YouTubeVideo }) {
  return { playerUrl: youTubeEmbedUrl(video.id) }
}
