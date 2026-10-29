import { api, type AboutContent, type City, type LeetCodeStats } from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'

/** About Me: the page, its LeetCode stats, and the admin's city search (Where I've been). */
export const aboutApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getAbout: build.query<AboutContent, void>({
      queryFn: (_, { signal }) => run(api.about.get(signal)),
      providesTags: ['About'],
    }),

    /** Replaces the whole page; every view shows it as the API stored it. */
    updateAbout: build.mutation<AboutContent, AboutContent>({
      queryFn: (content) => run(api.about.update(content)),
      // The LeetCode username may have changed.
      invalidatesTags: ['LeetCode'],
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(aboutApi.util.upsertQueryData('getAbout', undefined, data))),
    }),

    /** By username only so that a new one loads afresh: the API reads the saved one. Null when none is set. */
    getLeetCode: build.query<LeetCodeStats | null, string>({
      queryFn: (_, { signal }) => run(api.leetcode.get(signal)),
      providesTags: ['LeetCode'],
    }),

    searchCities: build.query<City[], string>({
      queryFn: (query, { signal }) => run(api.places.searchCities(query, signal)),
      keepUnusedDataFor: 300,
    }),
  }),
})

export const { useGetAboutQuery, useUpdateAboutMutation, useGetLeetCodeQuery, useSearchCitiesQuery } = aboutApi
