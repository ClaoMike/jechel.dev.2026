import { useId, useState } from 'react'
import { ErrorState } from '../../../components/ErrorState/ErrorState'
import { Loading, Skeleton, SkeletonList } from '../../../components/Skeleton'
import { failureOf, type AdminSession } from '../../../services/api'
import { useEndOtherSessionsMutation, useEndSessionMutation, useListSessionsQuery } from '../../../store/api/sessionsApi'
import { toLoadable } from '../../../store/loadable'
import { formatDateTime } from '../../../utils/formatDate'

/** A device as the list shows it. */
export interface DeviceRow {
  id: string
  name: string
  current: boolean
  /** "203.0.113.7 (GB)", or "Unknown address". */
  where: string
  signedIn: string
  lastActive: string
  ends: string
  /** ISO, for <time>. */
  lastSeenAt: string
  busy: boolean
  signOut: () => void
}

/**
 * Settings → Signed-in devices: each device signed in as the admin (its browser, address, when it signed
 * in, was last active and ends at the latest), and signing one, or all the others, out.
 */
export function SignedInDevices() {
  const id = useId()
  const query = useListSessionsQuery()
  const [endSession] = useEndSessionMutation()
  const [endOthers, others] = useEndOtherSessionsMutation()
  const [ending, setEnding] = useState<string | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const state = toLoadable(query)

  async function signOutDevice(session: AdminSession) {
    setEnding(session.id)
    setMessage(null)
    try {
      await endSession(session.id).unwrap()
      setMessage({ ok: true, text: `Signed out ${session.device}.` })
    } catch (error) {
      // Already gone (it ended, or another tab signed it out): the list is simply out of date.
      if (failureOf(error).status === 404) void query.refetch()
      else setMessage({ ok: false, text: "That device couldn't be signed out. Please try again." })
    } finally {
      setEnding(null)
    }
  }

  async function signOutOthers() {
    setMessage(null)
    try {
      const count = await endOthers().unwrap()
      setMessage({ ok: true, text: count === 0 ? 'No other device was signed in.' : `Signed out ${count} other ${count === 1 ? 'device' : 'devices'}.` })
    } catch {
      setMessage({ ok: false, text: "The other devices couldn't be signed out. Please try again." })
    }
  }

  const sessions = state.status === 'loaded' ? state.data : []
  const devices: DeviceRow[] = sessions.map((session) => ({
    id: session.id,
    name: session.device,
    current: session.current,
    where: session.ipAddress ? `${session.ipAddress}${session.country ? ` (${session.country})` : ''}` : 'Unknown address',
    signedIn: formatDateTime(session.createdAt),
    lastActive: formatDateTime(session.lastSeenAt),
    ends: formatDateTime(session.endsAt),
    lastSeenAt: session.lastSeenAt,
    busy: ending === session.id,
    signOut: () => void signOutDevice(session),
  }))
  const status = state.status
  const retry = () => void query.refetch()
  const hasOthers = sessions.some((session) => !session.current)
  const signingOutOthers = others.isLoading
  const titleId = `${id}-title`

  if (status === 'loading')
    return (
      <section className="card signed-in-devices">
        <Loading label="Loading the signed-in devices…">
          <Skeleton width="35%" height={20} />
          <SkeletonList rows={2} />
        </Loading>
      </section>
    )
  if (status === 'error') return <ErrorState message="The signed-in devices couldn't be loaded." onRetry={retry} />

  return (
    <section className="card signed-in-devices" aria-labelledby={titleId}>
      <h3 id={titleId}>Signed-in devices</h3>
      <ul className="device-list" aria-labelledby={titleId}>
        {devices.map((device) => (
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
      {message && (
        <p role="status" className={message.ok ? 'settings-ok' : 'field-error'}>
          {message.ok ? '✓ ' : ''}
          {message.text}
        </p>
      )}
      {hasOthers && (
        <button type="button" className="button button-secondary" disabled={signingOutOthers} onClick={() => void signOutOthers()}>
          {signingOutOthers ? 'Signing out…' : 'Sign out all other devices'}
        </button>
      )}
    </section>
  )
}
