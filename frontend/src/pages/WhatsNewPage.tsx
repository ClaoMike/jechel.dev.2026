import { useEffect, useState } from 'react'
import { CategoryLabels } from '../features/apps/AppFields'
import { AppDetailsView } from '../features/apps/AppDetailsView'
import { VideoDetailsView } from '../features/youtube/VideoDetailsView'
import { api, type AppDetails, type YouTubeVideo } from '../services/api'
import { formatDate } from '../utils/formatDate'

type Latest = { kind: 'app'; app: AppDetails } | { kind: 'video'; video: YouTubeVideo }
type State = { status: 'loading' } | { status: 'loaded'; latest: Latest | null }

/** The newest app (by when it was added) or YouTube video (by when it was published). */
function newest(app: AppDetails | undefined, video: YouTubeVideo | undefined): Latest | null {
  if (app && (!video || new Date(app.createdAt) >= new Date(video.publishedAt))) return { kind: 'app', app }
  return video ? { kind: 'video', video } : null
}

/**
 * The most recent thing I made: the newest app or YouTube video, whichever came last, shown in
 * full. If one of them can't be loaded (e.g. YouTube isn't set up), the other is shown.
 */
export function WhatsNewPage() {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()
    const first = <T,>(load: Promise<{ items: T[] }>) => load.then((page) => page.items[0]).catch(() => undefined)
    void Promise.all([first(api.apps.list(1, 1, controller.signal)), first(api.youtube.listVideos(1, 1, controller.signal))]).then(([app, video]) => {
      if (!controller.signal.aborted) setState({ status: 'loaded', latest: newest(app, video) })
    })
    return () => controller.abort()
  }, [])

  return (
    <section className="whats-new" aria-labelledby="whats-new-title">
      <h2 id="whats-new-title" className="page-title">
        What's new?
      </h2>
      {state.status === 'loading' && <p>Loading…</p>}
      {state.status === 'loaded' && state.latest === null && <p className="muted">Nothing here yet. New apps and videos will show up here.</p>}
      {state.status === 'loaded' && state.latest?.kind === 'app' && <LatestApp app={state.latest.app} />}
      {state.status === 'loaded' && state.latest?.kind === 'video' && <LatestVideo video={state.latest.video} />}
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
