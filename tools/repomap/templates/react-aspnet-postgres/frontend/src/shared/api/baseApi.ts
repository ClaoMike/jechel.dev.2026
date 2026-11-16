import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react'

/** The server's data (RTK Query): every slice adds its endpoints in its api/ segment with `baseApi.injectEndpoints`. */
export const baseApi = createApi({
  reducerPath: 'serverData',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
  endpoints: () => ({}),
})
