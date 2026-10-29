import type { EditorProps } from '@/shared/ui/fields'
import type { ExperienceItem } from '@/shared/api'
import { EXPERIENCE } from '../../../lib/timeline'
import { TimelineEditor } from '../TimelineEditor/TimelineEditor'

/** The experience entries' editor. */
export function ExperienceEditor(props: EditorProps<ExperienceItem[]>) {
  return <TimelineEditor config={EXPERIENCE} {...props} />
}
