import type { Qualification } from '../../../../services/api'
import { EditableSection } from '../../section/EditableSection/EditableSection'
import { formatMonth } from '../../format'
import { QualificationItem, type QualificationView } from '../QualificationItem/QualificationItem'
import { QualificationsEditor } from '../QualificationsEditor/QualificationsEditor'
import { strings } from '../../../../strings'

/** Certifications and the like: what, who issued it, when, and the grade if there was one. */
export function QualificationsSection({ value, canEdit, onSave }: { value: Qualification[]; canEdit: boolean; onSave: (value: Qualification[]) => Promise<void> }) {
  const items = value.map((item): QualificationView => ({
    title: item.title,
    issuer: item.issuer,
    obtained: item.obtained ? { text: formatMonth(item.obtained), dateTime: item.obtained.slice(0, 7) } : null,
    grade: item.grade ? strings.qualificationsSection.grade(item.grade) : '',
  }))
  return (
    <EditableSection title={strings.common.qualifications} errorKeys={['qualifications']} value={value} canEdit={canEdit} onSave={onSave} editor={QualificationsEditor}>
      {items.length === 0 ? (
        <p className="muted">{strings.common.nothingHereYet}</p>
      ) : (
        <ul className="qualifications">
          {items.map((item, i) => (
            <QualificationItem key={i} item={item} />
          ))}
        </ul>
      )}
    </EditableSection>
  )
}
