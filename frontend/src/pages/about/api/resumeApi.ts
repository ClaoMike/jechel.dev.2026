import { api, type ResumeChoices, type ResumeContact, type ResumeSettingsDetails } from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'

const keep = (data: ResumeSettingsDetails) => resumeApi.util.upsertQueryData('getResumeSettings', undefined, data)
const keepHeadline = (data: ResumeSettingsDetails) => resumeApi.util.upsertQueryData('getResumeHeadline', undefined, data.headline)

/** The admin's résumé generator: its header (phone, email, headline), sections and skills; and the public headline. */
export const resumeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    /** Public: shown under the name on About Me. */
    getResumeHeadline: build.query<string, void>({
      queryFn: (_, { signal }) => run(api.resume.getHeadline(signal)),
    }),

    getResumeSettings: build.query<ResumeSettingsDetails, void>({
      queryFn: (_, { signal }) => run(api.resume.getSettings(signal)),
      providesTags: ['Resume'],
    }),

    /** The headline under the name changes at once too. */
    saveResumeContact: build.mutation<ResumeSettingsDetails, ResumeContact>({
      queryFn: (contact) => run(api.resume.saveContact(contact)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, (data) => {
          dispatch(keep(data))
          dispatch(keepHeadline(data))
        }),
    }),

    saveResumeChoices: build.mutation<ResumeSettingsDetails, ResumeChoices>({
      queryFn: (choices) => run(api.resume.saveChoices(choices)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(keep(data))),
    }),

    /** Saves the choices and makes both PDFs; About Me loads again (its "Download résumé" link changed). */
    generateResume: build.mutation<ResumeSettingsDetails, ResumeChoices>({
      queryFn: (choices) => run(api.resume.generate(choices)),
      invalidatesTags: ['About'],
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(keep(data))),
    }),
  }),
})

export const { useGetResumeHeadlineQuery, useGetResumeSettingsQuery, useSaveResumeContactMutation, useSaveResumeChoicesMutation, useGenerateResumeMutation } = resumeApi
