import { api, type SupportInfo } from '@/shared/api'
import { baseApi, run } from '@/shared/api'

/** Buy me a coffee: whether it's offered, and where it leads. */
export const supportApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSupport: build.query<SupportInfo, void>({
      queryFn: (_, { signal }) => run(api.support.get(signal)),
      // Asked again when the admin switches Buy me a coffee or changes its link (app/model/listeners.ts).
      providesTags: ['Support'],
    }),
  }),
})

export const { useGetSupportQuery } = supportApi
