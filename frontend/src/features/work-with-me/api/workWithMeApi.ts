import { api, type WorkWithMePrice } from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'

/** Work with me's hourly price: anyone reads it, the admin changes it. */
export const workWithMeApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getWorkWithMePrice: build.query<WorkWithMePrice, void>({ queryFn: (_, { signal }) => run(api.workWithMe.getPrice(signal)), providesTags: ['WorkWithMePrice'] }),

    /** Once saved, the price on show is the one the API kept. */
    saveWorkWithMePrice: build.mutation<WorkWithMePrice, WorkWithMePrice>({
      queryFn: (price) => run(api.workWithMe.savePrice(price)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, (data) => dispatch(workWithMeApi.util.upsertQueryData('getWorkWithMePrice', undefined, data))),
    }),
  }),
})

export const { useGetWorkWithMePriceQuery, useSaveWorkWithMePriceMutation } = workWithMeApi
