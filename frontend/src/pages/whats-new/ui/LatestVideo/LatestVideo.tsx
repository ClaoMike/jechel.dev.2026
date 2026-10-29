import { ExternalLinkIcon } from '@/shared/ui/icons'
import { LinkifiedText } from '@/shared/ui/LinkifiedText'
import type { YouTubeVideo } from '@/shared/api'
import { strings } from '@/shared/i18n'
import { formatDate } from '@/shared/lib/format'
import { youTubeEmbedUrl } from '@/entities/app'
import { YouTubePlayer } from '@/shared/ui/YouTubePlayer'
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
