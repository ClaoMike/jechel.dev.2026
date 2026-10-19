import { ErrorState } from '../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonText } from '../../components/Skeleton'
import { CategoryLabels } from '../../features/apps/AppFields/AppFields'
import { AppDetailsView } from '../../features/apps/AppDetailsView/AppDetailsView'
import { VideoDetailsView } from '../../features/youtube/VideoDetailsView'
import type { AppDetails, YouTubeVideo } from '../../services/api'
import { formatDate } from '../../utils/formatDate'
import { useWhatsNewPageViewModel } from './WhatsNewPage.viewModel'

/**
 * The most recent thing I made: the newest app or YouTube video, whichever came last, shown in
 * full. If one of them can't be loaded (e.g. YouTube isn't set up), the other is shown.
 */
export function WhatsNewPage() {
  const vm = useWhatsNewPageViewModel()
  const { state } = vm

  return (
    <section className="whats-new" aria-label="What's new?">
      {state.status === 'loading' && (
        <Loading label="Loading what's new…">
          <div className="card whats-new-item">
            <Skeleton width="30%" height={14} />
            <Skeleton width="65%" height={28} />
            <Skeleton height="auto" radius={16} className="skeleton-media" />
            <SkeletonText lines={4} />
          </div>
        </Loading>
      )}
      {state.status === 'error' && <ErrorState message="The newest app and video can't be loaded right now." onRetry={vm.retry} />}
      {state.status === 'loaded' && state.data === null && <p className="muted">Nothing here yet. New apps and videos will show up here.</p>}
      {state.status === 'loaded' && state.data?.kind === 'app' && <LatestApp app={state.data.app} />}
      {state.status === 'loaded' && state.data?.kind === 'video' && <LatestVideo video={state.data.video} />}
    </section>
  )
}

function LatestApp({ app }: { app: AppDetails }) {
  return (
    <article className="card whats-new-item" aria-labelledby="whats-new-item-title">
      <header className="whats-new-header">
        <p className="whats-new-kind">
          New app · <time dateTime={app.createdAt}>{formatDate(app.createdAt)}</time>
        </p>
        <h3 id="whats-new-item-title">{app.title}</h3>
        <CategoryLabels categories={app.categories} />
      </header>
      <AppDetailsView app={app} />
    </article>
  )
}

function LatestVideo({ video }: { video: YouTubeVideo }) {
  return (
    <article className="card whats-new-item" aria-labelledby="whats-new-item-title">
      <header className="whats-new-header">
        <p className="whats-new-kind">
          New video · <time dateTime={video.publishedAt}>{formatDate(video.publishedAt)}</time>
        </p>
        <h3 id="whats-new-item-title">{video.title}</h3>
      </header>
      <VideoDetailsView video={video} />
    </article>
  )
}
