import { useId, useState } from 'react'
import { useGetMeetingsLinkQuery } from '../../../store/api/meetingsApi'
import { trackEvent } from '../../analytics'

type Mode = 'message' | 'meeting'

const MODES: [Mode, string][] = [
  ['message', 'Send a message'],
  ['meeting', 'Book a meeting'],
]

/** Whether meetings are offered (a Cal.com page is set), and which way the visitor chose to get in touch. */
export function useVisitorContactViewModel() {
  // No meetings offered (or it couldn't be asked): the form alone.
  const { data: calLink = '' } = useGetMeetingsLinkQuery()
  const [mode, setMode] = useState<Mode>('message')
  const [booked, setBooked] = useState(false)

  return {
    id: useId(),
    calLink,
    mode,
    modes: MODES.map(([value, label]) => ({ value, label, checked: mode === value, choose: () => setMode(value) })),
    booked,
    markBooked: () => {
      setBooked(true)
      trackEvent('Meeting booked')
    },
  }
}
