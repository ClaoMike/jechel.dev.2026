import type { Hackathon } from '../../../../services/api'
import type { TimelineItemView } from '../../timeline/timeline'

/** The hackathons as timeline items: name, year, what happened. */
export function useHackathonsSectionViewModel(value: Hackathon[]) {
  return {
    items: value.map((hackathon): TimelineItemView => ({ title: hackathon.name, meta: [], upcoming: false, period: String(hackathon.year), dateTime: String(hackathon.year), bullets: hackathon.bullets })),
  }
}
