import { api, type AppCategory, type AppCategoryRequest, type AppDetails, type AppRequest, type Page, type YouTubeVideo } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'

export interface PageArgs {
  page: number
  pageSize: number
}

/** The newest app or video, whichever came last (What's new?). */
export type Latest = { kind: 'app'; app: AppDetails } | { kind: 'video'; video: YouTubeVideo }

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
    }),

    /**
     * The newest app or video. If one list can't be loaded (e.g. YouTube isn't set up), the other is
     * shown; it's an error only when nothing can be shown because something failed.
     */
    getLatest: build.query<Latest | null, void>({
      queryFn: async (_, { signal }) => {
        // `null` when that list couldn't be loaded, `undefined` when it's empty.
        const first = <T>(load: Promise<{ items: T[] }>) => load.then((page) => page.items[0]).catch(() => null)
        const [app, video] = await Promise.all([first(api.apps.list(1, 1, signal)), first(api.youtube.listVideos(1, 1, signal))])
        const latest = newest(app ?? undefined, video ?? undefined)
        if (latest === null && (app === null || video === null)) return { error: { status: 0, validationErrors: null } }
        return { data: latest }
      },
      providesTags: ['Apps'],
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
  useGetLatestQuery,
} = appsApi
