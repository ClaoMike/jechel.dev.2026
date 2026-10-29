import {
  api,
  type AlertChannel,
  type AlertChannelState,
  type Notification,
  type NotificationKind,
  type Page,
  type PushDevice,
  type PushSetup,
  type PushSubscriptionJson,
} from '@/shared/api'
import { baseApi, run, whenFulfilled } from '@/shared/api'
import type { PageArgs } from '@/shared/api'

/** The latest save asked for each kind: an answer to an older one changes nothing (it was clicked again since). */
const latestSave = new Map<string, string>()

/**
 * The admin's Notifications tab: the ways alerts go (ntfy, the site's own notifications, each on or off) and the devices
 * that get the site's own, the kinds of alert (on or off), and the history of what was raised.
 */
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

    listAlertChannels: build.query<AlertChannelState[], void>({ queryFn: (_, { signal }) => run(api.notifications.listChannels(signal)), providesTags: ['AlertChannels'] }),

    /** The switch moves at once; the answer settles both (a failed save puts it back). */
    saveAlertChannel: build.mutation<AlertChannelState[], { channel: AlertChannel; enabled: boolean }>({
      queryFn: ({ channel, enabled }) => run(api.notifications.saveChannel(channel, enabled)),
      onQueryStarted: async ({ channel, enabled }, { dispatch, queryFulfilled }) => {
        const moved = dispatch(
          notificationsApi.util.updateQueryData('listAlertChannels', undefined, (channels) => {
            const saved = channels.find((c) => c.channel === channel)
            if (saved) saved.enabled = enabled
          }),
        )
        try {
          const { data } = await queryFulfilled
          dispatch(notificationsApi.util.upsertQueryData('listAlertChannels', undefined, data))
        } catch {
          moved.undo()
        }
      },
    }),

    getPush: build.query<PushSetup, void>({ queryFn: (_, { signal }) => run(api.notifications.getPush(signal)), providesTags: ['Push'] }),

    /** The device list as the API now has it; whether the site's own notifications can deliver may have changed. */
    addPushDevice: build.mutation<PushDevice[], { subscription: PushSubscriptionJson; label: string }>({
      queryFn: ({ subscription, label }) => run(api.notifications.addPushDevice(subscription, label)),
      invalidatesTags: ['AlertChannels'],
      onQueryStarted: (_, { dispatch, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, (devices) => dispatch(notificationsApi.util.updateQueryData('getPush', undefined, (push) => void (push.devices = devices)))),
    }),

    removePushDevice: build.mutation<PushDevice[], number>({
      queryFn: (id) => run(api.notifications.removePushDevice(id)),
      invalidatesTags: ['AlertChannels'],
      onQueryStarted: (_, { dispatch, queryFulfilled }) =>
        whenFulfilled(queryFulfilled, (devices) => dispatch(notificationsApi.util.updateQueryData('getPush', undefined, (push) => void (push.devices = devices)))),
    }),

    /** A device its push service no longer knows is forgotten by the API: the list loads again. */
    testPushDevice: build.mutation<void, number>({ queryFn: (id) => run(api.notifications.testPushDevice(id)), invalidatesTags: ['Push'] }),

    listNotifications: build.query<Page<Notification>, PageArgs & { kind: string | null }>({
      queryFn: ({ page, pageSize, kind }, { signal }) => run(api.notifications.list(page, pageSize, kind, signal)),
      providesTags: ['Notifications'],
    }),
  }),
})

export const {
  useListNotificationKindsQuery,
  useSaveNotificationKindMutation,
  useListNotificationsQuery,
  useListAlertChannelsQuery,
  useSaveAlertChannelMutation,
  useGetPushQuery,
  useAddPushDeviceMutation,
  useRemovePushDeviceMutation,
  useTestPushDeviceMutation,
} = notificationsApi
