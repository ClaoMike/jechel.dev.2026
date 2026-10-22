import { api, type Notification, type NotificationKind, type Page } from '../../services/api'
import { baseApi, run } from '../baseApi'
import type { PageArgs } from './appsApi'

/** The latest save asked for each kind: an answer to an older one changes nothing (it was clicked again since). */
const latestSave = new Map<string, string>()

/** The admin's Notifications tab: the kinds of phone alert (on or off) and the history of what was raised. */
export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    listNotificationKinds: build.query<NotificationKind[], void>({ queryFn: (_, { signal }) => run(api.notifications.listKinds(signal)), providesTags: ['NotificationKinds'] }),

    /**
     * The switch moves at once, before the API answers; the answer then settles that kind alone, and only if
     * it's the answer to the latest click on it. (Taking the whole list from each answer let one arriving late
     * put back a switch saved since.) A failed save puts the switch back.
     */
    saveNotificationKind: build.mutation<NotificationKind[], { kind: string; enabled: boolean }>({
      queryFn: ({ kind, enabled }) => run(api.notifications.saveKind(kind, enabled)),
      onQueryStarted: async ({ kind, enabled }, { dispatch, queryFulfilled, requestId }) => {
        latestSave.set(kind, requestId)
        const setKind = (change: (saved: NotificationKind) => void) =>
          dispatch(
            notificationsApi.util.updateQueryData('listNotificationKinds', undefined, (kinds) => {
              const saved = kinds.find((k) => k.kind === kind)
              if (saved) change(saved)
            }),
          )
        const moved = setKind((saved) => (saved.enabled = enabled))
        try {
          const { data } = await queryFulfilled
          const answer = data.find((k) => k.kind === kind)
          if (answer && latestSave.get(kind) === requestId) setKind((saved) => Object.assign(saved, answer))
        } catch {
          if (latestSave.get(kind) === requestId) moved.undo()
        } finally {
          if (latestSave.get(kind) === requestId) latestSave.delete(kind)
        }
      },
    }),

    listNotifications: build.query<Page<Notification>, PageArgs & { kind: string | null }>({
      queryFn: ({ page, pageSize, kind }, { signal }) => run(api.notifications.list(page, pageSize, kind, signal)),
      providesTags: ['Notifications'],
    }),
  }),
})

export const { useListNotificationKindsQuery, useSaveNotificationKindMutation, useListNotificationsQuery } = notificationsApi
