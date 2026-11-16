import { api, type AdminSession } from '@/shared/api'
import { baseApi, run } from '@/shared/api'

/** The admin's signed-in devices (Settings → Signed-in devices). */
export const sessionsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listSessions: build.query<AdminSession[], void>({
      queryFn: (_, { signal }) => run(api.auth.listSessions(signal)),
      providesTags: ['Sessions'],
    }),

    /** Signs one device out; the list loads again. */
    endSession: build.mutation<void, string>({
      queryFn: (id) => run(api.auth.endSession(id)),
      invalidatesTags: ['Sessions'],
    }),

    /** Signs out every device but this one; resolves with how many. */
    endOtherSessions: build.mutation<number, void>({
      queryFn: () => run(api.auth.endOtherSessions()),
      invalidatesTags: ['Sessions'],
    }),
  }),
})

export const { useListSessionsQuery, useEndSessionMutation, useEndOtherSessionsMutation } = sessionsApi
