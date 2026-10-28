import { ExternalLinkIcon } from '../../../components/icons/icons'
import { LinkifiedText } from '../../../components/LinkifiedText'
import type { YouTubeVideo } from '../../../services/api'
import { strings } from '../../../strings'
import { formatDate } from '../../../utils/formatDate'
import { youTubeEmbedUrl } from '../../apps/media'
import { YouTubePlayer } from '../../youtube/YouTubePlayer/YouTubePlayer'
import { WhatsNewCard } from '../WhatsNewCard/WhatsNewCard'

/**
 * The newest video, to watch here, dated when it was published: YouTube's player (the privacy-enhanced one, which sets
 * no cookies until it's played), its full description, and a link to it on YouTube.
 */
export function LatestVideo({ video }: { video: YouTubeVideo }) {
  return (
    <WhatsNewCard kind={strings.latestVideo.newVideo} date={formatDate(video.publishedAt)} dateTime={video.publishedAt} title={video.title}>
      <div className="video-details">
        <div className="video-player">
          <YouTubePlayer src={youTubeEmbedUrl(video.id)} title={video.title} lazy />
        </div>
        {video.description && (
          <p className="app-description">
            <LinkifiedText text={video.description} />
          </p>
        )}
        <div>
          <a className="button app-link" href={video.url} target="_blank" rel="noopener noreferrer">
            {strings.latestVideo.watchYoutube}
            <ExternalLinkIcon size={16} />
          </a>
        </div>
      </div>
    </WhatsNewCard>
  )
}
