import { MediaCard } from '../../components/MediaCard'
import { PagedGrid } from '../../components/PagedGrid/PagedGrid'
import type { YouTubeVideo } from '../../services/api'
import { useListVideosQuery } from '../../store/api/appsApi'
import { formatDate } from '../../utils/formatDate'
import { useYouTubePageViewModel } from './YouTubePage.viewModel'

/** My YouTube videos, newest first, nine a page. Each opens on YouTube in a new tab. */
export function YouTubePage() {
  const vm = useYouTubePageViewModel()

  return (
    <section className="youtube" aria-label="YouTube">
      <PagedGrid<YouTubeVideo>
        useItems={useListVideosQuery}
        itemKey={(video) => video.id}
        texts={vm.texts}
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
