import { ExternalLinkIcon } from '../../components/icons'
import { LinkifiedText } from '../../components/LinkifiedText'
import type { YouTubeVideo } from '../../services/api'

/**
 * A video to watch here: YouTube's player (the privacy-enhanced one, which sets no cookies
 * until it's played), the full description, and a link to the video on YouTube.
 */
export function VideoDetailsView({ video }: { video: YouTubeVideo }) {
  return (
    <div className="video-details">
      <div className="video-player">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(video.id)}`}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
          loading="lazy"
        />
      </div>
      {video.description && (
        <p className="app-description">
          <LinkifiedText text={video.description} />
        </p>
      )}
      <div>
        <a className="button app-link" href={video.url} target="_blank" rel="noopener noreferrer">
          Watch on YouTube
          <ExternalLinkIcon size={16} />
        </a>
      </div>
    </div>
  )
}
