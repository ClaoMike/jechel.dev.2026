import { api, type TermsContent, type TermsDocument } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'

/** The terms and conditions: loaded once for the whole site (the popup, the gate, the Terms tab). */
export const termsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getTerms: build.query<TermsDocument, void>({
      queryFn: (_, { signal }) => run(api.terms.get(signal)),
      providesTags: ['Terms'],
      // Needed on every page: kept while the site is open.
      keepUnusedDataFor: Infinity,
    }),

    /** After the admin saves, everyone on this page sees the new terms (and visitors are asked again). */
    updateTerms: build.mutation<TermsDocument, TermsContent>({
      queryFn: (content) => run(api.terms.update(content)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(termsApi.util.upsertQueryData('getTerms', undefined, data))),
    }),
  }),
})

export const { useGetTermsQuery, useUpdateTermsMutation } = termsApi
