import { ErrorState } from '@/shared/ui/ErrorState'
import { LatestApp } from './LatestApp/LatestApp'
import { LatestVideo } from './LatestVideo/LatestVideo'
import { WhatsNewSkeleton } from './WhatsNewSkeleton/WhatsNewSkeleton'
import { useAppSelector } from '@/shared/lib/store'
import { useGetLatestQuery } from '../api/latestApi'
import { toLoadable } from '@/shared/api'
import { strings } from '@/shared/i18n'

/** What it says, naming only what it shows: apps, videos, or both. */
function textsFor(apps: boolean, videos: boolean) {
  const what =
    apps && videos
      ? { newest: strings.whatsNewPage.appVideo, added: strings.whatsNewPage.appsVideos }
      : apps
        ? { newest: strings.whatsNewPage.app, added: strings.whatsNewPage.apps }
        : videos
          ? { newest: strings.whatsNewPage.video, added: strings.whatsNewPage.videos }
          : { newest: strings.whatsNewPage.appVideo, added: strings.whatsNewPage.appsVideos }
  return {
    label: strings.common.whatsNew,
    loading: strings.whatsNewPage.loadingWhatsNew,
    error: strings.whatsNewPage.newestCantLoadedRight(what.newest),
    empty: strings.whatsNewPage.nothingHereYetNew(what.added),
  }
}

/** For the admin, when What's new? leaves a section out: which, and why. */
function hiddenNote(apps: boolean, videos: boolean): string | null {
  if (apps && videos) return null
  if (!apps && !videos) return strings.whatsNewPage.appsYoutubeAreHidden
  return strings.whatsNewPage.visitorsSeeHiddenThem(apps ? strings.whatsNewPage.youtube : strings.common.apps, apps ? strings.whatsNewPage.apps : strings.whatsNewPage.videos)
}

/**
 * The most recent thing I made: the newest app or YouTube video, whichever came last, shown in
 * full; only from the sections visitors may see (the admin sees the same, with a note on what's left
 * out). If one of them can't be loaded (e.g. YouTube isn't set up), the other is shown. Waits until it's known which
 * sections visitors may see.
 */
export function WhatsNewPage() {
  const site = useAppSelector((state) => state.site)
  const isAdmin = useAppSelector((state) => state.auth.status === 'authenticated')
  const pages = site.status === 'loaded' ? site.site.pages : null
  const apps = pages?.apps === true
  const videos = pages?.youtube === true
  const query = useGetLatestQuery({ apps, videos }, { skip: pages === null })
  const state = toLoadable(query)
  const latest = state.status === 'loaded' ? state.data : null
  const texts = textsFor(apps, videos)
  const adminNote = isAdmin && pages !== null ? hiddenNote(apps, videos) : null

  return (
    <section className="whats-new" aria-label={texts.label}>
      {adminNote && <p className="muted whats-new-admin-note">{adminNote}</p>}
      {state.status === 'loading' && <WhatsNewSkeleton label={texts.loading} />}
      {state.status === 'error' && <ErrorState message={texts.error} onRetry={() => void query.refetch()} />}
      {state.status === 'loaded' && latest === null && <p className="muted">{texts.empty}</p>}
      {latest?.kind === 'app' && <LatestApp app={latest.app} />}
      {latest?.kind === 'video' && <LatestVideo video={latest.video} />}
    </section>
  )
}
