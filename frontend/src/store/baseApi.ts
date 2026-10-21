import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import { failureOf, type ApiFailure } from '../services/api'

/**
 * The server's data in the Redux store (RTK Query): loaded once, shared by every view that shows it,
 * and loaded again when a save changes it (tags). Each feature adds its endpoints in `store/api/`
 * with `baseApi.injectEndpoints`. Requests still go through `services/api.ts` (its axios instance, the
 * admin's preview switch, ApiError), so an endpoint is just `run(api.<group>.<call>(…, signal))`.
 */
export const baseApi = createApi({
  reducerPath: 'serverData',
  baseQuery: fakeBaseQuery<ApiFailure>(),
  tagTypes: [
    'About',
    'AppCategories',
    'Apps',
    'Announcements',
    'Donations',
    'LeetCode',
    'Meetings',
    'Message',
    'Messages',
    'Resume',
    'Settings',
    'Subscribers',
    'Summary',
    'Terms',
    'Visit',
    'Visits',
  ],
  // Coming back to a view shows what was loaded at once, and checks for news meanwhile.
  refetchOnMountOrArgChange: 30,
  endpoints: () => ({}),
})

/** Runs a call to the API service the way RTK Query expects: `{ data }`, or `{ error }` as a serializable ApiFailure. */
export async function run<T>(call: Promise<T>): Promise<{ data: T } | { error: ApiFailure }> {
  try {
    return { data: await call }
  } catch (error) {
    return { error: failureOf(error) }
  }
}

/** For `onQueryStarted`: runs `then` with the data once the request succeeds. A failure is the caller's (`.unwrap()`, `error`). */
export async function whenFulfilled<T>(queryFulfilled: Promise<{ data: T }>, then: (data: T) => void) {
  const result = await queryFulfilled.catch(() => null)
  if (result) then(result.data)
}
