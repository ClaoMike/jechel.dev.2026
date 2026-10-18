import { MediaCard } from '../components/MediaCard'
import { PagedGrid } from '../components/PagedGrid'
import { api, type YouTubeVideo } from '../services/api'
import { formatDate } from '../utils/formatDate'

/** My YouTube videos, newest first, nine a page. Each opens on YouTube in a new tab. */
export function YouTubePage() {
  return (
    <section className="youtube" aria-labelledby="youtube-title">
      <h2 id="youtube-title" className="page-title">
        YouTube
      </h2>
      <PagedGrid<YouTubeVideo>
        load={api.youtube.listVideos}
        itemKey={(video) => video.id}
        label="Videos"
        loadingLabel="Loading videos…"
        empty={<p className="muted">No videos yet.</p>}
        errorMessage="The videos can't be loaded right now."
        renderItem={(video) => (
          <MediaCard
            href={video.url}
            imageUrl={video.thumbnailUrl}
            title={video.title}
            description={video.description}
            meta={<time dateTime={video.publishedAt}>{formatDate(video.publishedAt)}</time>}
          />
        )}
      />
    </section>
  )
}
