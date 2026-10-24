import { useEffect, useState } from 'react'
import type { AlertChannel, PushDevice } from '../../../services/api'
import {
  useAddPushDeviceMutation,
  useGetPushQuery,
  useListAlertChannelsQuery,
  useRemovePushDeviceMutation,
  useSaveAlertChannelMutation,
  useTestPushDeviceMutation,
} from '../../../store/api/notificationsApi'
import { toLoadable } from '../../../store/loadable'
import { webPush } from '../webPush'

export const CHANNEL_LABELS: Record<AlertChannel, string> = { ntfy: 'The ntfy app', push: "This site's notifications" }

/** Why a way that's on can't deliver yet, and what to do. */
const NOT_READY: Record<AlertChannel, string> = {
  ntfy: 'Not set up: add a topic in Settings → ntfy.',
  push: 'No device yet: allow them on one below.',
}

/** What this browser can do about the site's own notifications. */
export type HereState =
  | { kind: 'unsupported' }
  | { kind: 'needs-home-screen' }
  | { kind: 'blocked' }
  | { kind: 'on'; device: PushDevice }
  | { kind: 'off' }

export type Outcome = { ok: boolean; text: string }

/**
 * The ways alerts go, each switched on or off (an alert goes every way that's on), and the devices that get the site's
 * own notifications: this one allowed or stopped here, any one tested or removed.
 */
export function useAlertChannelsCardViewModel() {
  const channelsQuery = useListAlertChannelsQuery()
  const pushQuery = useGetPushQuery()
  const channels = toLoadable(channelsQuery)
  const [saveChannel] = useSaveAlertChannelMutation()
  const [addDevice] = useAddPushDeviceMutation()
  const [removeDevice] = useRemovePushDeviceMutation()
  const [testDevice] = useTestPushDeviceMutation()

  const [support] = useState(webPush.support)
  const [permission, setPermission] = useState(webPush.permission)
  // This browser's push address, once known: tells this device from the others.
  const [here, setHere] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [testing, setTesting] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  useEffect(() => {
    let live = true
    webPush.currentEndpoint().then(
      (endpoint) => live && setHere(endpoint),
      () => {},
    )
    return () => {
      live = false
    }
  }, [])

  const devices = pushQuery.data?.devices ?? []
  const thisDevice = here ? devices.find((device) => device.endpoint === here) : undefined
  const hereState: HereState =
    support === 'unsupported'
      ? { kind: 'unsupported' }
      : support === 'needs-home-screen'
        ? { kind: 'needs-home-screen' }
        : thisDevice
          ? { kind: 'on', device: thisDevice }
          : permission === 'denied'
            ? { kind: 'blocked' }
            : { kind: 'off' }

  async function toggle(channel: AlertChannel, enabled: boolean) {
    setOutcome(null)
    try {
      await saveChannel({ channel, enabled }).unwrap()
    } catch {
      setOutcome({ ok: false, text: "That couldn't be saved. Please try again." })
    }
  }

  // An iPhone asks to allow notifications only straight after a tap: subscribe() asks first thing.
  async function allowHere() {
    const publicKey = pushQuery.data?.publicKey
    if (!publicKey) return
    setOutcome(null)
    setBusy(true)
    try {
      const subscription = await webPush.subscribe(publicKey)
      await addDevice({ subscription, label: webPush.deviceLabel() }).unwrap()
      setHere(subscription.endpoint)
      setOutcome({ ok: true, text: 'This device gets them now. Send it a test to check.' })
    } catch {
      const now = webPush.permission()
      setPermission(now)
      setOutcome({ ok: false, text: now === 'denied' ? 'Notifications are blocked here: see below.' : "That didn't work. Please try again." })
    } finally {
      setBusy(false)
    }
  }

  async function remove(device: PushDevice) {
    setOutcome(null)
    await removeDevice(device.id).unwrap()
    // This browser too: it would keep a subscription nothing sends to.
    if (device.endpoint === here) {
      await webPush.unsubscribe().catch(() => {})
      setHere(null)
    }
  }

  async function test(device: PushDevice) {
    setOutcome(null)
    setTesting(device.id)
    try {
      await testDevice(device.id).unwrap()
      setOutcome({ ok: true, text: `Sent to ${device.label}: it should show in a moment.` })
    } catch {
      setOutcome({ ok: false, text: `It couldn't be sent to ${device.label}. If it was removed from the Home Screen, allow them there again.` })
    } finally {
      setTesting(null)
    }
  }

  return {
    channels,
    retry: () => void Promise.all([channelsQuery.refetch(), pushQuery.refetch()]),
    channelItems:
      channels.status === 'loaded'
        ? channels.data.map((channel) => ({ ...channel, label: CHANNEL_LABELS[channel.channel], note: channel.enabled && !channel.ready ? NOT_READY[channel.channel] : null }))
        : [],
    devices,
    devicesLoaded: pushQuery.isSuccess,
    thisDeviceId: thisDevice?.id ?? null,
    hereState,
    busy,
    testing,
    outcome,
    toggle: (channel: AlertChannel, enabled: boolean) => void toggle(channel, enabled),
    allowHere: () => void allowHere(),
    remove,
    test: (device: PushDevice) => void test(device),
  }
}
