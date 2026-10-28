import { ErrorState } from '../../components/ErrorState/ErrorState'
import { LatestApp } from '../../features/whatsNew/LatestApp/LatestApp'
import { LatestVideo } from '../../features/whatsNew/LatestVideo/LatestVideo'
import { WhatsNewSkeleton } from '../../features/whatsNew/WhatsNewSkeleton/WhatsNewSkeleton'
import { useAppSelector } from '../../store'
import { useGetLatestQuery } from '../../store/api/appsApi'
import { toLoadable } from '../../store/loadable'

/** What it says, naming only what it shows: apps, videos, or both. */
function textsFor(apps: boolean, videos: boolean) {
  const what =
    apps && videos
      ? { newest: 'app and video', added: 'apps and videos' }
      : apps
        ? { newest: 'app', added: 'apps' }
        : videos
          ? { newest: 'video', added: 'videos' }
          : { newest: 'app and video', added: 'apps and videos' }
  return {
    label: "What's new?",
    loading: "Loading what's new…",
    error: `The newest ${what.newest} can't be loaded right now.`,
    empty: `Nothing here yet. New ${what.added} will show up here.`,
  }
}

/** For the admin, when What's new? leaves a section out: which, and why. */
function hiddenNote(apps: boolean, videos: boolean): string | null {
  if (apps && videos) return null
  if (!apps && !videos) return "Apps and YouTube are hidden from visitors (Settings → Visitor pages), so What's new? has nothing to show them."
  return `As visitors see it: ${apps ? 'YouTube' : 'Apps'} is hidden from them (Settings → Visitor pages), so only ${apps ? 'apps' : 'videos'} count.`
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
