import type { EditorProps } from '../../../../components/fields'
import type { EducationItem } from '../../../../services/api'
import { EDUCATION } from '../timeline'
import { TimelineEditor } from '../TimelineEditor/TimelineEditor'

/** The education entries' editor. */
export function EducationEditor(props: EditorProps<EducationItem[]>) {
  return <TimelineEditor config={EDUCATION} {...props} />
}
