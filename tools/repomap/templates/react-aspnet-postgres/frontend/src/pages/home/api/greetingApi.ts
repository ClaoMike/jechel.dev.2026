import { baseApi } from '@/shared/api'

export interface Greeting {
  text: string
}

/** The home page's greeting, from the API (backend Features/Greetings/GetGreeting.cs). */
export const greetingApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getGreeting: build.query<Greeting, void>({ query: () => 'greeting' }),
  }),
})

export const { useGetGreetingQuery } = greetingApi
