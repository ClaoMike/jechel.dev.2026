import { api, type Notification, type NotificationKind, type Page } from '../../services/api'
import { baseApi, run, whenFulfilled } from '../baseApi'
import type { PageArgs } from './appsApi'

/** The admin's Notifications tab: the kinds of phone alert (on or off) and the history of what was raised. */
export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNotificationKinds: build.query<NotificationKind[], void>({ queryFn: (_, { signal }) => run(api.notifications.listKinds(signal)), providesTags: ['NotificationKinds'] }),

    /** Every kind as the API now has it, at once. */
    saveNotificationKind: build.mutation<NotificationKind[], { kind: string; enabled: boolean }>({
      queryFn: ({ kind, enabled }) => run(api.notifications.saveKind(kind, enabled)),
      onQueryStarted: (_, { dispatch, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, (data) => dispatch(notificationsApi.util.upsertQueryData('listNotificationKinds', undefined, data))),
    }),

    listNotifications: build.query<Page<Notification>, PageArgs & { kind: string | null }>({
      queryFn: ({ page, pageSize, kind }, { signal }) => run(api.notifications.list(page, pageSize, kind, signal)),
      providesTags: ['Notifications'],
    }),
  }),
})

export const { useListNotificationKindsQuery, useSaveNotificationKindMutation, useListNotificationsQuery } = notificationsApi
