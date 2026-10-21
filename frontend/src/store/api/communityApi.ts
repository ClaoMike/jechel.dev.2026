import { api, type Announcement, type AnnouncementStatus, type Donation, type Page, type Subscriber, type SubscribeStatus, type SupportInfo } from '../../services/api'
import { baseApi, run } from '../baseApi'
import type { PageArgs } from './appsApi'

/** The people around the site: Buy me a coffee, email updates (subscribing, and the admin's Community tab). */
export const communityApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSupport: build.query<SupportInfo, void>({
      queryFn: (_, { signal }) => run(api.support.get(signal)),
    }),

    listDonations: build.query<Page<Donation>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.support.listDonations(page, pageSize, signal)),
      providesTags: ['Donations'],
    }),

    subscribe: build.mutation<SubscribeStatus, string>({
      queryFn: (email) => run(api.updates.subscribe(email)),
    }),

    /** The link in the confirmation email; resolves with the address. */
    confirmSubscription: build.mutation<string, string>({
      queryFn: (token) => run(api.updates.confirm(token)),
    }),

    unsubscribe: build.mutation<void, string>({
      queryFn: (token) => run(api.updates.unsubscribe(token)),
    }),

    listSubscribers: build.query<Page<Subscriber>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.updates.listSubscribers(page, pageSize, signal)),
      providesTags: ['Subscribers'],
    }),

    deleteSubscriber: build.mutation<void, number>({
      queryFn: (id) => run(api.updates.deleteSubscriber(id)),
      invalidatesTags: ['Subscribers'],
    }),

    listAnnouncements: build.query<Page<Announcement>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.updates.listAnnouncements(page, pageSize, signal)),
      providesTags: ['Announcements'],
    }),

    /** A pending announcement: email it (`send`) or not (`ignore`). */
    decideAnnouncement: build.mutation<AnnouncementStatus, { id: number; decision: 'send' | 'ignore' }>({
      queryFn: ({ id, decision }) => run(api.updates.decide(id, decision)),
      invalidatesTags: ['Announcements'],
    }),
  }),
})

export const {
  useGetSupportQuery,
  useListDonationsQuery,
  useSubscribeMutation,
  useConfirmSubscriptionMutation,
  useUnsubscribeMutation,
  useListSubscribersQuery,
  useDeleteSubscriberMutation,
  useListAnnouncementsQuery,
  useDecideAnnouncementMutation,
} = communityApi
