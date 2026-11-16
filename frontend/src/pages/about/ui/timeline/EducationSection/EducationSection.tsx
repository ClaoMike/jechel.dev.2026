import type { EducationItem } from '@/shared/api'
import { EducationEditor } from '../EducationEditor/EducationEditor'
import { EDUCATION } from '../../../lib/timeline'
import { TimelineSection } from '../TimelineSection/TimelineSection'

/** Education on a timeline. */
export function EducationSection(props: { value: EducationItem[]; canEdit: boolean; onSave: (value: EducationItem[]) => Promise<void> }) {
  return <TimelineSection config={EDUCATION} editor={EducationEditor} {...props} />
}
