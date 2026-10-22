import { useId, useState } from 'react'
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

/** Settings → Signed-in devices: every device signed in as the admin, signing one or all the others out. */
export function useSignedInDevicesViewModel() {
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

  return {
    id,
    status: state.status,
    retry: () => void query.refetch(),
    devices,
    hasOthers: sessions.some((session) => !session.current),
    signingOutOthers: others.isLoading,
    signOutOthers: () => void signOutOthers(),
    message,
  }
}
