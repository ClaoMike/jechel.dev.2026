import { api, type SettingsResponse, type TestResult } from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'

export type TestableService = 'ntfy' | 'email' | 'youtube' | 'cal'

/** The admin's Settings tab: every service the site connects to. */
export const settingsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSettings: build.query<SettingsResponse, void>({
      queryFn: (_, { signal }) => run(api.settings.get(signal)),
      providesTags: ['Settings'],
    }),

    /** Applies at once; an empty value clears it. Every setting shows as the API now has it. */
    saveSetting: build.mutation<SettingsResponse, { key: string; value: string }>({
      queryFn: ({ key, value }) => run(api.settings.save(key, value)),
      // The header's Buy me a coffee asks again when its settings change, and the admin's booking link when Cal.com's do.
      invalidatesTags: (result, _, { key }) => (!result ? [] : key.startsWith('Support:') ? ['Support'] : key.startsWith('Cal:') ? ['MeetingsLink'] : []),
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(settingsApi.util.upsertQueryData('getSettings', undefined, data))),
    }),

    testService: build.mutation<TestResult, TestableService>({
      queryFn: (service) => run(api.settings.test(service)),
    }),
  }),
})

export const { useGetSettingsQuery, useSaveSettingMutation, useTestServiceMutation } = settingsApi
