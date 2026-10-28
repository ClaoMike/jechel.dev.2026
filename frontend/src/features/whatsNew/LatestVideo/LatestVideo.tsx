import type { YouTubeVideo } from '../../../services/api'
import { formatDate } from '../../../utils/formatDate'
import { VideoDetailsView } from '../../youtube/VideoDetailsView/VideoDetailsView'
import { WhatsNewCard } from '../WhatsNewCard/WhatsNewCard'
import { strings } from '../../../strings'

/** The newest video, to watch here: the player, its description, and a link to it on YouTube, dated when it was published. */
export function LatestVideo({ video }: { video: YouTubeVideo }) {
  return (
    <WhatsNewCard kind={strings.latestVideo.newVideo} date={formatDate(video.publishedAt)} dateTime={video.publishedAt} title={video.title}>
      <VideoDetailsView video={video} />
    </WhatsNewCard>
  )
}
