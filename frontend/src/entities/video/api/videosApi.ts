import { api, type Page, type YouTubeChannel, type YouTubeVideo } from '@/shared/api'
import { baseApi, run } from '@/shared/api'
import type { PageArgs } from '@/shared/api'

/** A page counts as fresh for this long: loading ahead skips it (the same as baseApi's refetchOnMountOrArgChange). */
const PREFETCH_FRESH_SECONDS = 30

/** YouTube videos and the channel. */
export const videosApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** My channel's page on YouTube, or null when no channel is set. */
    getYouTubeChannel: build.query<YouTubeChannel | null, void>({
      queryFn: (_, { signal }) => run(api.youtube.channel(signal)),
      providesTags: ['Videos'],
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
  }),
})

export const { useGetYouTubeChannelQuery, useListVideosQuery, useRefreshVideosMutation } = videosApi

/** Loads a page of videos ahead (the grid's neighbours), unless it's loaded and fresh. */
export const usePrefetchVideos = () => videosApi.usePrefetch('listVideos', { ifOlderThan: PREFETCH_FRESH_SECONDS })
