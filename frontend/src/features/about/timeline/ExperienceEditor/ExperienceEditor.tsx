import type { EditorProps } from '../../../../components/fields'
import type { ExperienceItem } from '../../../../services/api'
import { EXPERIENCE } from '../timeline'
import { TimelineEditor } from '../TimelineEditor/TimelineEditor'

/** The experience entries' editor. */
export function ExperienceEditor(props: EditorProps<ExperienceItem[]>) {
  return <TimelineEditor config={EXPERIENCE} {...props} />
}
