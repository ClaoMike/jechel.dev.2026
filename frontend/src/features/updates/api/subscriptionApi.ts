import { api, type SubscribeStatus } from '@/shared/api'
import { baseApi, run } from '@/shared/api'

/** Email updates, as a visitor sees them: subscribing, confirming, unsubscribing. */
export const subscriptionApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    subscribe: build.mutation<SubscribeStatus, string>({ queryFn: (email) => run(api.updates.subscribe(email)) }),

    /** The link in the confirmation email; resolves with the address. */
    confirmSubscription: build.mutation<string, string>({ queryFn: (token) => run(api.updates.confirm(token)), invalidatesTags: ['Subscribers'] }),

    unsubscribe: build.mutation<void, string>({ queryFn: (token) => run(api.updates.unsubscribe(token)), invalidatesTags: ['Subscribers'] }),
  }),
})

export const { useSubscribeMutation, useConfirmSubscriptionMutation, useUnsubscribeMutation } = subscriptionApi
