import { api, type AppDetails, type YouTubeVideo } from '@/shared/api'
import { baseApi } from '@/shared/api'

/** The newest app or video, whichever came last (What's new?). */
export type Latest = { kind: 'app'; app: AppDetails } | { kind: 'video'; video: YouTubeVideo }

/** Which sections What's new? may show: the ones the visitor may see. */
export interface LatestSections {
  apps: boolean
  videos: boolean
}

/**
 * The app What's new? may show (the first in the admin's order that may), or the newest YouTube video, whichever
 * came last: the app by when it was added, the video by when it was published.
 */
function newest(app: AppDetails | undefined, video: YouTubeVideo | undefined): Latest | null {
  if (app && (!video || new Date(app.createdAt) >= new Date(video.publishedAt))) return { kind: 'app', app }
  return video ? { kind: 'video', video } : null
}

/** What's new?: the newest app or video. */
export const latestApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /**
     * The app What's new? may show or the newest video, of the sections given (the others aren't asked for). If one can't be
     * loaded (e.g. YouTube isn't set up), the other is shown; it's an error only when nothing can be
     * shown because something failed.
     */
    getLatest: build.query<Latest | null, LatestSections>({
      queryFn: async (sections, { signal }) => {
        // `null` when that list couldn't be loaded, `undefined` when it's empty or not asked for.
        const first = <T>(load: Promise<{ items: T[] }>) => load.then((page) => page.items[0]).catch(() => null)
        const [app, video] = await Promise.all([
          sections.apps
            ? api.apps.whatsNew(signal).then(
                (found) => found ?? undefined,
                () => null,
              )
            : undefined,
          sections.videos ? first(api.youtube.listVideos(1, 1, signal)) : undefined,
        ])
        const latest = newest(app ?? undefined, video ?? undefined)
        if (latest === null && (app === null || video === null)) return { error: { status: 0, validationErrors: null } }
        return { data: latest }
      },
      providesTags: ['Apps', 'Videos'],
    }),
  }),
})

export const { useGetLatestQuery } = latestApi
