import { api, type ResumeChoices, type ResumeContact, type ResumeSettingsDetails } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'

const keep = (data: ResumeSettingsDetails) => resumeApi.util.upsertQueryData('getResumeSettings', undefined, data)

/** The admin's résumé generator: its header (phone, email, headline), sections and skills. */
export const resumeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getResumeSettings: build.query<ResumeSettingsDetails, void>({
      queryFn: (_, { signal }) => run(api.resume.getSettings(signal)),
      providesTags: ['Resume'],
    }),

    saveResumeContact: build.mutation<ResumeSettingsDetails, ResumeContact>({
      queryFn: (contact) => run(api.resume.saveContact(contact)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(keep(data))),
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

export const { useGetResumeSettingsQuery, useSaveResumeContactMutation, useSaveResumeChoicesMutation, useGenerateResumeMutation } = resumeApi
