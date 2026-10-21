import { api, type AppCategory, type AppCategoryRequest, type AppDetails, type AppRequest, type Page, type YouTubeVideo } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'

export interface PageArgs {
  page: number
  pageSize: number
}

/** The newest app or video, whichever came last (What's new?). */
export type Latest = { kind: 'app'; app: AppDetails } | { kind: 'video'; video: YouTubeVideo }

/** Which sections What's new? may show: the ones the visitor may see. */
export interface LatestSections {
  apps: boolean
  videos: boolean
}

/** The newest app (by when it was added) or YouTube video (by when it was published). */
function newest(app: AppDetails | undefined, video: YouTubeVideo | undefined): Latest | null {
  if (app && (!video || new Date(app.createdAt) >= new Date(video.publishedAt))) return { kind: 'app', app }
  return video ? { kind: 'video', video } : null
}

/** Apps, their categories, and YouTube videos. */
export const appsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listApps: build.query<Page<AppDetails>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.apps.list(page, pageSize, signal)),
      providesTags: ['Apps'],
    }),

    /** Adds the app (no id) or saves it. */
    saveApp: build.mutation<AppDetails, { id: number | null; app: AppRequest }>({
      queryFn: ({ id, app }) => run(id === null ? api.apps.create(app) : api.apps.update(id, app)),
      invalidatesTags: ['Apps'],
    }),

    deleteApp: build.mutation<void, number>({
      queryFn: (id) => run(api.apps.delete(id)),
      invalidatesTags: ['Apps'],
    }),

    listAppCategories: build.query<AppCategory[], void>({
      queryFn: (_, { signal }) => run(api.apps.listCategories(signal)),
      providesTags: ['AppCategories'],
    }),

    /** Apps show the new names, and lose deleted ones. */
    saveAppCategories: build.mutation<AppCategory[], AppCategoryRequest[]>({
      queryFn: (categories) => run(api.apps.saveCategories(categories)),
      invalidatesTags: ['Apps'],
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(appsApi.util.upsertQueryData('listAppCategories', undefined, data))),
    }),

    listVideos: build.query<Page<YouTubeVideo>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.youtube.listVideos(page, pageSize, signal)),
      providesTags: ['Videos'],
    }),

    /** Admin only. Asks YouTube now; every list of videos (and What's new?) loads again. Resolves with how many there are. */
    refreshVideos: build.mutation<number, void>({
      queryFn: () => run(api.youtube.refreshVideos()),
      invalidatesTags: ['Videos'],
    }),

    /**
     * The newest app or video, of the sections given (the others aren't asked for). If one list can't be
     * loaded (e.g. YouTube isn't set up), the other is shown; it's an error only when nothing can be
     * shown because something failed.
     */
    getLatest: build.query<Latest | null, LatestSections>({
      queryFn: async (sections, { signal }) => {
        // `null` when that list couldn't be loaded, `undefined` when it's empty or not asked for.
        const first = <T>(load: Promise<{ items: T[] }>) => load.then((page) => page.items[0]).catch(() => null)
        const [app, video] = await Promise.all([
          sections.apps ? first(api.apps.list(1, 1, signal)) : undefined,
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

export const {
  useListAppsQuery,
  useSaveAppMutation,
  useDeleteAppMutation,
  useListAppCategoriesQuery,
  useSaveAppCategoriesMutation,
  useListVideosQuery,
  useRefreshVideosMutation,
  useGetLatestQuery,
} = appsApi

/** A page counts as fresh for this long: loading ahead skips it (the same as baseApi's refetchOnMountOrArgChange). */
export const PREFETCH_FRESH_SECONDS = 30

/** Loads a page of apps ahead (the grid's neighbours), unless it's loaded and fresh. */
export const usePrefetchApps = () => appsApi.usePrefetch('listApps', { ifOlderThan: PREFETCH_FRESH_SECONDS })

/** Loads a page of videos ahead (the grid's neighbours), unless it's loaded and fresh. */
export const usePrefetchVideos = () => appsApi.usePrefetch('listVideos', { ifOlderThan: PREFETCH_FRESH_SECONDS })
