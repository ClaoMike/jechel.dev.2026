import { EditableSection } from '../../section/EditableSection/EditableSection'
import { SkillsChart } from '../SkillsChart/SkillsChart'
import { SkillsEditor } from '../SkillsEditor/SkillsEditor'
import type { SkillsValue } from '../../../lib/skills'
import { strings } from '@/shared/i18n'

export type { SkillsValue }

/** Skills on a timeline: when and how each was used. */
export function SkillsSection({ value, canEdit, onSave }: { value: SkillsValue; canEdit: boolean; onSave: (value: SkillsValue) => Promise<void> }) {
  return (
    <EditableSection title={strings.common.skills} errorKeys={['skills', 'colors.skills']} value={value} canEdit={canEdit} onSave={onSave} editor={SkillsEditor}>
      {value.skills.length === 0 ? <p className="muted">{strings.skillsSection.noSkillsYet}</p> : <SkillsChart skills={value.skills} colors={value.colors} />}
    </EditableSection>
  )
}
