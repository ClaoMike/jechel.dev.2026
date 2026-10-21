import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../../components/Skeleton'
import { useSignedInDevicesViewModel } from './SignedInDevices.viewModel'

/**
 * Settings → Signed-in devices: each device signed in as the admin (its browser, address, when it signed
 * in, was last active and ends at the latest), and signing one, or all the others, out.
 */
export function SignedInDevices() {
  const vm = useSignedInDevicesViewModel()
  const titleId = `${vm.id}-title`

  if (vm.status === 'loading')
    return (
      <section className="card signed-in-devices">
        <Loading label="Loading the signed-in devices…">
          <Skeleton width="35%" height={20} />
          <SkeletonList rows={2} />
        </Loading>
      </section>
    )
  if (vm.status === 'error') return <ErrorState message="The signed-in devices couldn't be loaded." onRetry={vm.retry} />

  return (
    <section className="card signed-in-devices" aria-labelledby={titleId}>
      <h3 id={titleId}>Signed-in devices</h3>
      <ul className="device-list" aria-labelledby={titleId}>
        {vm.devices.map((device) => (
          <li key={device.id} className="device-row">
            <div className="device-what">
              <span className="device-name">
                {device.name}
                {device.current && <span className="chip chip-muted">This device</span>}
              </span>
              <span className="muted">
                {device.where} · signed in {device.signedIn} · active <time dateTime={device.lastSeenAt}>{device.lastActive}</time> · ends by {device.ends}
              </span>
            </div>
            {!device.current && (
              <button type="button" className="button button-secondary button-small" disabled={device.busy} onClick={device.signOut} aria-label={`Sign out ${device.name}`}>
                {device.busy ? 'Signing out…' : 'Sign out'}
              </button>
            )}
          </li>
        ))}
      </ul>
      {vm.message && (
        <p role="status" className={vm.message.ok ? 'settings-ok' : 'field-error'}>
          {vm.message.ok ? '✓ ' : ''}
          {vm.message.text}
        </p>
      )}
      {vm.hasOthers && (
        <button type="button" className="button button-secondary" disabled={vm.signingOutOthers} onClick={vm.signOutOthers}>
          {vm.signingOutOthers ? 'Signing out…' : 'Sign out all other devices'}
        </button>
      )}
    </section>
  )
}
