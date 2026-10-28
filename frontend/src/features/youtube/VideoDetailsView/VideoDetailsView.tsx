import { ExternalLinkIcon } from '../../../components/icons/icons'
import { LinkifiedText } from '../../../components/LinkifiedText'
import type { YouTubeVideo } from '../../../services/api'
import { YouTubePlayer } from '../YouTubePlayer/YouTubePlayer'
import { youTubeEmbedUrl } from '../../apps/media'
import { strings } from '../../../strings'

/**
 * A video to watch here: YouTube's player (the privacy-enhanced one, which sets no cookies
 * until it's played), the full description, and a link to the video on YouTube.
 */
export function VideoDetailsView(props: { video: YouTubeVideo }) {
  const { video } = props
  return (
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
          {strings.videoDetailsView.watchYoutube}
          <ExternalLinkIcon size={16} />
        </a>
      </div>
    </div>
  )
}
