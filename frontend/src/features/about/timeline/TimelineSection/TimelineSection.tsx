import { EditableSection } from '../../section/EditableSection/EditableSection'
import { TimelineItem } from '../TimelineItem/TimelineItem'
import type { ComponentType } from 'react'
import type { EditorProps } from '../../../../components/fields'
import { toItemView, type TimelineConfig } from '../timeline'
import { strings } from '../../../../strings'

export interface TimelineSectionProps<T> {
  config: TimelineConfig<T>
  /** The section's editor, bound to the same config. */
  editor: ComponentType<EditorProps<T[]>>
  value: T[]
  canEdit: boolean
  onSave: (value: T[]) => Promise<void>
}

/** Work experience or education (the config says which): entries on a timeline, newest first. */
export function TimelineSection<T>({ config, editor, value, canEdit, onSave }: TimelineSectionProps<T>) {
  const items = value.map((item) => toItemView(config.toEntry(item)))
  return (
    <EditableSection title={config.title} errorKeys={[config.key]} value={value} canEdit={canEdit} onSave={onSave} editor={editor}>
      {items.length === 0 ? (
        <p className="muted">{strings.common.nothingHereYet}</p>
      ) : (
        <ol className="timeline">
          {items.map((item, i) => (
            <TimelineItem key={i} item={item} />
          ))}
        </ol>
      )}
    </EditableSection>
  )
}
