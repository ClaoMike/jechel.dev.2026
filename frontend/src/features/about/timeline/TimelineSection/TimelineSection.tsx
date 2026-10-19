import { EditableSection } from '../../section/EditableSection/EditableSection'
import { TimelineItem } from '../TimelineItem/TimelineItem'
import { useTimelineSectionViewModel, type TimelineSectionProps } from './TimelineSection.viewModel'

/** Work experience or education (the config says which): entries on a timeline, newest first. */
export function TimelineSection<T>(props: TimelineSectionProps<T>) {
  const { config, editor, value, canEdit, onSave } = props
  const vm = useTimelineSectionViewModel(props)
  return (
    <EditableSection title={config.title} errorKeys={[config.key]} value={value} canEdit={canEdit} onSave={onSave} editor={editor}>
      {vm.items.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ol className="timeline">
          {vm.items.map((item, i) => (
            <TimelineItem key={i} item={item} />
          ))}
        </ol>
      )}
    </EditableSection>
  )
}
