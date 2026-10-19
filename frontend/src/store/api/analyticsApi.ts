import { api, type AnalyticsRange, type AnalyticsSummary, type Page, type VisitDetails, type VisitSummary } from '../../services/api'
import { baseApi, run } from '../baseApi'
import type { PageArgs } from './appsApi'

/** The Engagement tab: the numbers for a period, and every visit. (Recording visits is the tracker's: features/analytics.) */
export const analyticsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSummary: build.query<AnalyticsSummary, AnalyticsRange>({
      queryFn: (range, { signal }) => run(api.analytics.summary(range, signal)),
      providesTags: ['Summary'],
    }),

    listVisits: build.query<Page<VisitSummary>, PageArgs & { errorsOnly: boolean }>({
      queryFn: ({ page, pageSize, errorsOnly }, { signal }) => run(api.analytics.listSessions(page, pageSize, errorsOnly, signal)),
      providesTags: ['Visits'],
    }),

    getVisit: build.query<VisitDetails, string>({
      queryFn: (id, { signal }) => run(api.analytics.getSession(id, signal)),
      providesTags: (_, __, id) => [{ type: 'Visit', id }],
    }),

    /** The numbers and the list load again. */
    deleteVisit: build.mutation<void, string>({
      queryFn: (id) => run(api.analytics.deleteSession(id)),
      invalidatesTags: ['Summary', 'Visits'],
    }),
  }),
})

export const { useGetSummaryQuery, useListVisitsQuery, useGetVisitQuery, useDeleteVisitMutation } = analyticsApi
