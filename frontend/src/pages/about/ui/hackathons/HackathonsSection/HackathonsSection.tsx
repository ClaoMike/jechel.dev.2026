import type { Hackathon } from '@/shared/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { TimelineItem } from '../../timeline/TimelineItem/TimelineItem'
import { HackathonsEditor } from '../HackathonsEditor/HackathonsEditor'
import type { TimelineItemView } from '../../../lib/timeline'
import { strings } from '@/shared/i18n'

/** Hackathons: name, year, and what happened, on the same timeline as work experience. */
export function HackathonsSection({ value, canEdit, onSave }: { value: Hackathon[]; canEdit: boolean; onSave: (value: Hackathon[]) => Promise<void> }) {
  const items = value.map((hackathon): TimelineItemView => ({
    title: hackathon.name,
    meta: [],
    upcoming: false,
    period: String(hackathon.year),
    dateTime: String(hackathon.year),
    bullets: hackathon.bullets,
  }))
  return (
    <EditableSection title={strings.common.hackathons} errorKeys={['hackathons']} value={value} canEdit={canEdit} onSave={onSave} editor={HackathonsEditor}>
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
