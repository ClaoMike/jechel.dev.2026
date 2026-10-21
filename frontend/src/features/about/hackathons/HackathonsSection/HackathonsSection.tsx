import type { Hackathon } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { TimelineItem } from '../../timeline/TimelineItem/TimelineItem'
import { HackathonsEditor } from '../HackathonsEditor/HackathonsEditor'
import { useHackathonsSectionViewModel } from './HackathonsSection.viewModel'

/** Hackathons: name, year, and what happened, on the same timeline as work experience. */
export function HackathonsSection({ value, canEdit, onSave }: { value: Hackathon[]; canEdit: boolean; onSave: (value: Hackathon[]) => Promise<void> }) {
  const vm = useHackathonsSectionViewModel(value)
  return (
    <EditableSection title="Hackathons" errorKeys={['hackathons']} value={value} canEdit={canEdit} onSave={onSave} editor={HackathonsEditor}>
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
