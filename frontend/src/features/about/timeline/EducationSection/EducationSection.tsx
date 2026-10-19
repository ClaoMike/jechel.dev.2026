import type { EducationItem } from '../../../../services/api'
import { EducationEditor } from '../EducationEditor/EducationEditor'
import { EDUCATION } from '../timeline'
import { TimelineSection } from '../TimelineSection/TimelineSection'

/** Education on a timeline. */
export function EducationSection(props: { value: EducationItem[]; canEdit: boolean; onSave: (value: EducationItem[]) => Promise<void> }) {
  return <TimelineSection config={EDUCATION} editor={EducationEditor} {...props} />
}
