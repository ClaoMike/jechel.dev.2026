import { useAppSelector } from '../../store'
import { useGetLatestQuery } from '../../store/api/appsApi'
import { toLoadable } from '../../store/loadable'

/** What it says, naming only what it shows: apps, videos, or both. */
function texts(apps: boolean, videos: boolean) {
  const what = apps && videos ? { newest: 'app and video', added: 'apps and videos' } : apps ? { newest: 'app', added: 'apps' } : videos ? { newest: 'video', added: 'videos' } : { newest: 'app and video', added: 'apps and videos' }
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
 * The newest app or video, whichever came last, of the sections visitors may see (Settings → Visitor
 * pages): both, one, or none. The same for the admin, who's told what's left out. Waits until it's known.
 */
export function useWhatsNewPageViewModel() {
  const site = useAppSelector((state) => state.site)
  const isAdmin = useAppSelector((state) => state.auth.status === 'authenticated')
  const pages = site.status === 'loaded' ? site.site.pages : null
  const apps = pages?.apps === true
  const videos = pages?.youtube === true
  const query = useGetLatestQuery({ apps, videos }, { skip: pages === null })
  const state = toLoadable(query)
  const latest = state.status === 'loaded' ? state.data : null
  return {
    texts: texts(apps, videos),
    status: state.status,
    empty: state.status === 'loaded' && latest === null,
    app: latest?.kind === 'app' ? latest.app : null,
    video: latest?.kind === 'video' ? latest.video : null,
    retry: () => void query.refetch(),
    adminNote: isAdmin && pages !== null ? hiddenNote(apps, videos) : null,
  }
}
