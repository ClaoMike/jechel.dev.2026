import { useEffect, useState } from 'react'
import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { OnOffSwitch } from '../../../components/OnOffSwitch/OnOffSwitch'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { formatDate, formatDateTime } from '../../../utils/formatDate'
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

const CHANNEL_LABELS: Record<AlertChannel, string> = { ntfy: 'The ntfy app', push: "This site's notifications" }

/** Why a way that's on can't deliver yet, and what to do. */
const NOT_READY: Record<AlertChannel, string> = {
  ntfy: 'Not set up: add a topic in Settings → ntfy.',
  push: 'No device yet: allow them on one below.',
}

/** What this browser can do about the site's own notifications. */
export type HereState = { kind: 'unsupported' } | { kind: 'needs-home-screen' } | { kind: 'blocked' } | { kind: 'on'; device: PushDevice } | { kind: 'off' }

export type Outcome = { ok: boolean; text: string }

/**
 * Where alerts go (the Notifications tab's first card): the ntfy app and the site's own notifications, each switched on
 * or off, and the devices that get the site's own: this one allowed here, any one tested or removed.
 */
export function AlertChannelsCard() {
  // The ways alerts go, each switched on or off (an alert goes every way that's on), and the devices that get the
  // site's own notifications: this one allowed or stopped here, any one tested or removed.
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
  const retry = () => void Promise.all([channelsQuery.refetch(), pushQuery.refetch()])
  const channelItems =
    channels.status === 'loaded'
      ? channels.data.map((channel) => ({ ...channel, label: CHANNEL_LABELS[channel.channel], note: channel.enabled && !channel.ready ? NOT_READY[channel.channel] : null }))
      : []
  const devicesLoaded = pushQuery.isSuccess
  const thisDeviceId = thisDevice?.id ?? null

  return (
    <section className="card notifications-card" aria-labelledby="alert-channels-title">
      <div>
        <h3 id="alert-channels-title">Where they go</h3>
        <p className="muted notification-intro">Each alert goes every way that's on.</p>
      </div>
      {channels.status === 'loading' && (
        <Loading label="Loading where they go…">
          {[44, 52].map((width, i) => (
            <div key={i} className="notification-kind">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={96} height={36} radius={999} />
            </div>
          ))}
        </Loading>
      )}
      {channels.status === 'error' && <ErrorState message="Where they go couldn't be loaded." onRetry={retry} />}
      {channelItems.length > 0 && (
        <div className="notification-group">
          {channelItems.map((channel) => (
            <div key={channel.channel} className="notification-kind">
              <span className="notification-kind-text">
                <span className="notification-kind-label">{channel.label}</span>
                {channel.note && <span className="muted notification-kind-meta">{channel.note}</span>}
              </span>
              <OnOffSwitch label={channel.label} on={channel.enabled} onChange={(on) => toggle(channel.channel, on)} />
            </div>
          ))}
        </div>
      )}

      {devicesLoaded && (
        <section className="push-devices" aria-labelledby="push-devices-title">
          <h4 id="push-devices-title">Devices with this site's notifications</h4>
          {devices.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="push-device-list">
              {devices.map((device) => (
                <li key={device.id} className="push-device">
                  <span className="notification-kind-text">
                    <span className="notification-kind-label">
                      {device.label}
                      {device.id === thisDeviceId && <span className="chip push-device-here">This device</span>}
                    </span>
                    <span className="muted notification-kind-meta">
                      Added {formatDate(device.createdAt)}
                      {device.lastSentAt ? ` · last sent ${formatDateTime(device.lastSentAt)}` : ' · nothing sent yet'}
                    </span>
                  </span>
                  <span className="push-device-actions">
                    <button type="button" className="button button-secondary button-small" disabled={testing === device.id} onClick={() => test(device)}>
                      {testing === device.id ? 'Sending…' : 'Send a test'}
                    </button>
                    <DeleteButton
                      what={`notifications on ${device.label}`}
                      action="Remove"
                      detail="It stops getting them. Allow them on it again to have them back."
                      onDelete={() => remove(device)}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Here state={hereState} busy={busy} onAllow={() => void allowHere()} />
        </section>
      )}

      {outcome && (
        <p role={outcome.ok ? 'status' : 'alert'} className={outcome.ok ? 'settings-ok' : 'field-error'}>
          {outcome.ok ? '✓ ' : ''}
          {outcome.text}
        </p>
      )}
    </section>
  )
}

/** This browser: get them here, or why it can't. */
function Here({ state, busy, onAllow }: { state: HereState; busy: boolean; onAllow: () => void }) {
  switch (state.kind) {
    case 'on':
      return <p className="muted push-here">This device gets them. Remove it above to stop.</p>
    case 'off':
      return (
        <div className="push-here">
          <button type="button" className="button button-small" disabled={busy} onClick={onAllow}>
            {busy ? 'Allowing…' : 'Get them on this device'}
          </button>
        </div>
      )
    case 'blocked':
      return (
        <p className="muted push-here">
          Notifications are blocked for this site here. Allow them in the settings (on an iPhone: Settings → Notifications → jechel.dev), then come back.
        </p>
      )
    case 'needs-home-screen':
      return (
        <p className="muted push-here">
          On an iPhone or iPad, they come to the site on the Home Screen: in Safari, Share → Add to Home Screen, open it from there, and allow them here.
        </p>
      )
    case 'unsupported':
      return <p className="muted push-here">This browser can't get notifications.</p>
  }
}
