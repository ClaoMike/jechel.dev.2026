import type { EditorProps } from '@/shared/ui/fields'
import type { EducationItem } from '@/shared/api'
import { EDUCATION } from '../../../lib/timeline'
import { TimelineEditor } from '../TimelineEditor/TimelineEditor'

/** The education entries' editor. */
export function EducationEditor(props: EditorProps<EducationItem[]>) {
  return <TimelineEditor config={EDUCATION} {...props} />
}
