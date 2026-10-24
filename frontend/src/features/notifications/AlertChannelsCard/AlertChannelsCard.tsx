import { DeleteButton } from '../../../components/DeleteButton/DeleteButton'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { OnOffSwitch } from '../../../components/OnOffSwitch/OnOffSwitch'
import { Loading, Skeleton } from '../../../components/Skeleton'
import { formatDate, formatDateTime } from '../../../utils/formatDate'
import { useAlertChannelsCardViewModel, type HereState } from './AlertChannelsCard.viewModel'

/**
 * Where alerts go (the Notifications tab's first card): the ntfy app and the site's own notifications, each switched on
 * or off, and the devices that get the site's own: this one allowed here, any one tested or removed.
 */
export function AlertChannelsCard() {
  const vm = useAlertChannelsCardViewModel()

  return (
    <section className="card notifications-card" aria-labelledby="alert-channels-title">
      <div>
        <h3 id="alert-channels-title">Where they go</h3>
        <p className="muted notification-intro">Each alert goes every way that's on.</p>
      </div>
      {vm.channels.status === 'loading' && (
        <Loading label="Loading where they go…">
          {[44, 52].map((width, i) => (
            <div key={i} className="notification-kind">
              <Skeleton width={`${width}%`} height={16} />
              <Skeleton width={96} height={36} radius={999} />
            </div>
          ))}
        </Loading>
      )}
      {vm.channels.status === 'error' && <ErrorState message="Where they go couldn't be loaded." onRetry={vm.retry} />}
      {vm.channelItems.length > 0 && (
        <div className="notification-group">
          {vm.channelItems.map((channel) => (
            <div key={channel.channel} className="notification-kind">
              <span className="notification-kind-text">
                <span className="notification-kind-label">{channel.label}</span>
                {channel.note && <span className="muted notification-kind-meta">{channel.note}</span>}
              </span>
              <OnOffSwitch label={channel.label} on={channel.enabled} onChange={(on) => vm.toggle(channel.channel, on)} />
            </div>
          ))}
        </div>
      )}

      {vm.devicesLoaded && (
        <section className="push-devices" aria-labelledby="push-devices-title">
          <h4 id="push-devices-title">Devices with this site's notifications</h4>
          {vm.devices.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="push-device-list">
              {vm.devices.map((device) => (
                <li key={device.id} className="push-device">
                  <span className="notification-kind-text">
                    <span className="notification-kind-label">
                      {device.label}
                      {device.id === vm.thisDeviceId && <span className="chip push-device-here">This device</span>}
                    </span>
                    <span className="muted notification-kind-meta">
                      Added {formatDate(device.createdAt)}
                      {device.lastSentAt ? ` · last sent ${formatDateTime(device.lastSentAt)}` : ' · nothing sent yet'}
                    </span>
                  </span>
                  <span className="push-device-actions">
                    <button type="button" className="button button-secondary button-small" disabled={vm.testing === device.id} onClick={() => vm.test(device)}>
                      {vm.testing === device.id ? 'Sending…' : 'Send a test'}
                    </button>
                    <DeleteButton what={`notifications on ${device.label}`} action="Remove" detail="It stops getting them. Allow them on it again to have them back." onDelete={() => vm.remove(device)} />
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Here state={vm.hereState} busy={vm.busy} onAllow={vm.allowHere} />
        </section>
      )}

      {vm.outcome && (
        <p role={vm.outcome.ok ? 'status' : 'alert'} className={vm.outcome.ok ? 'settings-ok' : 'field-error'}>
          {vm.outcome.ok ? '✓ ' : ''}
          {vm.outcome.text}
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
