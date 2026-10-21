import {
  api,
  type Announcement,
  type AnnouncementStatus,
  type Donation,
  type Page,
  type Subscriber,
  type SubscribeStatus,
  type SupportInfo,
  type TestResult,
  type UpdateEmailKind,
  type UpdateEmailPreview,
  type UpdateEmailsDocument,
  type UpdateEmailWording,
} from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'
import type { PageArgs } from './appsApi'

/** The people around the site: Buy me a coffee, email updates (subscribing, and the admin's Community tab). */
export const communityApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getSupport: build.query<SupportInfo, void>({ queryFn: (_, { signal }) => run(api.support.get(signal)) }),

    listDonations: build.query<Page<Donation>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.support.listDonations(page, pageSize, signal)),
      providesTags: ['Donations'],
    }),

    subscribe: build.mutation<SubscribeStatus, string>({ queryFn: (email) => run(api.updates.subscribe(email)) }),

    /** The link in the confirmation email; resolves with the address. */
    confirmSubscription: build.mutation<string, string>({ queryFn: (token) => run(api.updates.confirm(token)), invalidatesTags: ['Subscribers'] }),

    unsubscribe: build.mutation<void, string>({ queryFn: (token) => run(api.updates.unsubscribe(token)), invalidatesTags: ['Subscribers'] }),

    listSubscribers: build.query<Page<Subscriber>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.updates.listSubscribers(page, pageSize, signal)),
      providesTags: ['Subscribers'],
    }),

    deleteSubscriber: build.mutation<void, number>({ queryFn: (id) => run(api.updates.deleteSubscriber(id)), invalidatesTags: ['Subscribers'] }),

    listAnnouncements: build.query<Page<Announcement>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.updates.listAnnouncements(page, pageSize, signal)),
      providesTags: ['Announcements'],
    }),

    /** A pending announcement: email it (`send`) or not (`ignore`). */
    decideAnnouncement: build.mutation<AnnouncementStatus, { id: number; decision: 'send' | 'ignore' }>({
      queryFn: ({ id, decision }) => run(api.updates.decide(id, decision)),
      invalidatesTags: ['Announcements'],
    }),

    /** The words of the emails subscribers get (the defaults until saved). */
    getUpdateEmails: build.query<UpdateEmailsDocument, void>({ queryFn: (_, { signal }) => run(api.updates.getEmails(signal)), providesTags: ['UpdateEmails'] }),

    /** The wording as the API now keeps it. */
    saveUpdateEmails: build.mutation<UpdateEmailsDocument, UpdateEmailWording>({
      queryFn: (wording) => run(api.updates.saveEmails(wording)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(communityApi.util.upsertQueryData('getUpdateEmails', undefined, data))),
    }),

    /** Back to the default wording. */
    resetUpdateEmails: build.mutation<UpdateEmailsDocument, void>({
      queryFn: () => run(api.updates.resetEmails()),
      onQueryStarted: (_, { dispatch, queryFulfilled }) => whenFulfilled(queryFulfilled, (data) => dispatch(communityApi.util.upsertQueryData('getUpdateEmails', undefined, data))),
    }),

    /** One email in a draft wording, as a subscriber would get it. */
    previewUpdateEmail: build.query<UpdateEmailPreview, { kind: UpdateEmailKind; wording: UpdateEmailWording }>({
      queryFn: ({ kind, wording }, { signal }) => run(api.updates.previewEmail(kind, wording, signal)),
      keepUnusedDataFor: 10,
    }),

    /** Sends one email in a draft wording to the admin. */
    testUpdateEmail: build.mutation<TestResult, { kind: UpdateEmailKind; wording: UpdateEmailWording }>({
      queryFn: ({ kind, wording }) => run(api.updates.testEmail(kind, wording)),
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
  useGetUpdateEmailsQuery,
  useSaveUpdateEmailsMutation,
  useResetUpdateEmailsMutation,
  usePreviewUpdateEmailQuery,
  useTestUpdateEmailMutation,
} = communityApi
