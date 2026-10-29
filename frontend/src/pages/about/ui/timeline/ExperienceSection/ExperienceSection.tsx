import type { ExperienceItem } from '@/shared/api'
import { ExperienceEditor } from '../ExperienceEditor/ExperienceEditor'
import { EXPERIENCE } from '../../../lib/timeline'
import { TimelineSection } from '../TimelineSection/TimelineSection'

/** Work experience on a timeline. */
export function ExperienceSection(props: { value: ExperienceItem[]; canEdit: boolean; onSave: (value: ExperienceItem[]) => Promise<void> }) {
  return <TimelineSection config={EXPERIENCE} editor={ExperienceEditor} {...props} />
}
