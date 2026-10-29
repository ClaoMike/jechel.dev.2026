import { EditableSection } from '../../section/EditableSection/EditableSection'
import { LeetCodeCard } from '../LeetCodeCard/LeetCodeCard'
import { NeetCodeLists } from '../NeetCodeLists/NeetCodeLists'
import { ProblemSolvingEditor } from '../ProblemSolvingEditor/ProblemSolvingEditor'
import type { ProblemSolving } from '@/shared/api'
import { NEETCODE_LIST_LABELS } from '../../../lib/problemSolving'
import { strings } from '@/shared/i18n'

export interface ProblemSolvingSectionProps {
  value: ProblemSolving
  canEdit: boolean
  onSave: (value: ProblemSolving) => Promise<void>
}

/** LeetCode stats, fetched through the API, and the NeetCode lists completed. */
export function ProblemSolvingSection({ value, canEdit, onSave }: ProblemSolvingSectionProps) {
  return (
    <EditableSection
      title={strings.problemSolvingSection.problemSolving}
      errorKeys={['problemSolving']}
      value={value}
      canEdit={canEdit}
      onSave={onSave}
      editor={ProblemSolvingEditor}
    >
      {!value.leetCodeUsername && value.neetCodeLists.length === 0 ? (
        <p className="muted">{strings.common.nothingHereYet}</p>
      ) : (
        <div className="problem-solving">
          {value.leetCodeUsername && <LeetCodeCard key={value.leetCodeUsername} username={value.leetCodeUsername} canEdit={canEdit} />}
          {value.neetCodeLists.length > 0 && <NeetCodeLists lists={value.neetCodeLists.map((list) => NEETCODE_LIST_LABELS[list])} />}
        </div>
      )}
    </EditableSection>
  )
}
