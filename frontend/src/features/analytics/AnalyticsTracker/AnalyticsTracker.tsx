import { useAnalyticsTrackerViewModel } from './AnalyticsTracker.viewModel'
import type { Tracker } from '../tracker'

/** Feeds the tracker the pages opened, theme switches and who's browsing (the admin isn't recorded). Renders nothing. */
export function AnalyticsTracker({ instance }: { instance?: Tracker }) {
  useAnalyticsTrackerViewModel(instance)
  return null
}
