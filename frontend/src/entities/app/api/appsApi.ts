import { api, type AppCategory, type AppCategoryRequest, type AppDetails, type AppOrderItem, type AppRequest, type Page } from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'
import type { PageArgs } from '@/shared/api'

/** Apps and their categories. */
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

    /** Admin only: every app, in the order (Organise). Loads again whenever apps change. */
    getAppOrder: build.query<AppOrderItem[], void>({
      queryFn: (_, { signal }) => run(api.apps.listOrder(signal)),
      providesTags: ['Apps'],
    }),

    /**
     * The Apps page and What's new? follow the new order. Organise's cached order is the saved one before the
     * save resolves (not after, as onQueryStarted would): it shows it at once, without a frame of the old one.
     */
    saveAppOrder: build.mutation<AppOrderItem[], AppOrderItem[]>({
      queryFn: async (order, { dispatch }) => {
        const result = await run(api.apps.saveOrder(order.map(({ id, showInWhatsNew }) => ({ id, showInWhatsNew }))))
        if ('data' in result) dispatch(appsApi.util.updateQueryData('getAppOrder', undefined, () => result.data))
        return result
      },
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
  }),
})

export const { useListAppsQuery, useSaveAppMutation, useDeleteAppMutation, useGetAppOrderQuery, useSaveAppOrderMutation, useListAppCategoriesQuery, useSaveAppCategoriesMutation } =
  appsApi

/** A page counts as fresh for this long: loading ahead skips it (the same as baseApi's refetchOnMountOrArgChange). */
export const PREFETCH_FRESH_SECONDS = 30

/** Loads a page of apps ahead (the grid's neighbours), unless it's loaded and fresh. */
export const usePrefetchApps = () => appsApi.usePrefetch('listApps', { ifOlderThan: PREFETCH_FRESH_SECONDS })
