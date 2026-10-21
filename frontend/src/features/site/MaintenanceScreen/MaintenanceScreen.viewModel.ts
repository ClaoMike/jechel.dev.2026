import { useAppDispatch } from '../../../store'
import { fetchSite } from '../../../store/siteSlice'

export function useMaintenanceScreenViewModel({ reason, message }: { reason: 'maintenance' | 'unreachable'; message?: string }) {
  const dispatch = useAppDispatch()
  return {
    title: reason === 'maintenance' ? "We'll be right back" : "Can't reach the site right now",
    text:
      reason === 'maintenance'
        ? message || 'The site is having some work done. Please check back soon.'
        : 'It may be down for a moment. This page checks again every half a minute and comes back by itself.',
    retry: () => void dispatch(fetchSite()),
  }
}
