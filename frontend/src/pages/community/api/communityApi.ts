import {
  api,
  type Announcement,
  type AnnouncementStatus,
  type Donation,
  type Page,
  type Subscriber,
  type TestResult,
  type UpdateEmailKind,
  type UpdateEmailPreview,
  type UpdateEmailsDocument,
  type UpdateEmailWording,
} from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'
import type { PageArgs } from '@/shared/api'

/** The admin's Community tab: donations, subscribers, update emails. */
export const communityApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listDonations: build.query<Page<Donation>, PageArgs>({
      queryFn: ({ page, pageSize }, { signal }) => run(api.support.listDonations(page, pageSize, signal)),
      providesTags: ['Donations'],
    }),

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
  useListDonationsQuery,
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
