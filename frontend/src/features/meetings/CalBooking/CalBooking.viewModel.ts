import { useEffect, useId, useRef } from 'react'
import { useAppSelector } from '../../../store'

type CalApi = ((...args: unknown[]) => void) & { ns: Record<string, (...args: unknown[]) => void>; loaded?: boolean; q?: unknown[] }

declare global {
  interface Window {
    Cal?: CalApi
  }
}

const EMBED_SCRIPT = 'https://app.cal.com/embed/embed.js'
const NAMESPACE = 'jechel'

/** Cal.com's own loader (from its embed snippet): queues calls until embed.js has loaded. */
function loadCal(): CalApi {
  if (!window.Cal) {
    const push = (target: { q: unknown[] }, args: unknown) => target.q.push(args)
    const cal = function (...args: unknown[]) {
      const self = window.Cal as CalApi & { q: unknown[] }
      if (!self.loaded) {
        self.ns = {}
        self.q = self.q || []
        document.head.appendChild(document.createElement('script')).src = EMBED_SCRIPT
        self.loaded = true
      }
      if (args[0] === 'init') {
        const api = function (...inner: unknown[]) {
          push(api as unknown as { q: unknown[] }, inner)
        } as unknown as ((...a: unknown[]) => void) & { q: unknown[] }
        api.q = api.q || []
        const namespace = args[1]
        if (typeof namespace === 'string') {
          self.ns[namespace] = self.ns[namespace] || api
          push(self.ns[namespace] as unknown as { q: unknown[] }, args)
          push(self, ['initNamespace', namespace])
        } else push(self, args)
        return
      }
      push(self, args)
    } as CalApi
    window.Cal = cal
  }
  return window.Cal
}

export interface CalBookingProps {
  calLink: string
  name?: string
  email?: string
  onBooked?: () => void
}

/** Loads Cal.com's calendar into the element (again when the link or the theme changes). */
export function useCalBookingViewModel({ calLink, name, email, onBooked }: CalBookingProps) {
  const id = `cal-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const theme = useAppSelector((state) => (state.theme.theme === 'light' ? 'light' : 'dark'))
  // The latest prefill and callback, read when the calendar loads: typing in the form doesn't reload it.
  const latest = useRef({ name, email, onBooked })
  useEffect(() => {
    latest.current = { name, email, onBooked }
  })

  useEffect(() => {
    const element = document.getElementById(id)
    if (!element) return
    element.replaceChildren()
    const cal = loadCal()
    cal('init', NAMESPACE, { origin: 'https://cal.com' })
    const ns = cal.ns[NAMESPACE]
    const { name: prefillName, email: prefillEmail } = latest.current
    ns('inline', { elementOrSelector: `#${id}`, calLink, layout: 'month_view', config: { name: prefillName ?? '', email: prefillEmail ?? '', theme } })
    ns('ui', { theme, hideEventTypeDetails: false, layout: 'month_view' })
    ns('on', { action: 'bookingSuccessful', callback: () => latest.current.onBooked?.() })
  }, [id, calLink, theme])

  return { id }
}
