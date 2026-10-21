import { EditableSection } from '../../section/EditableSection/EditableSection'
import { LeetCodeCard } from '../LeetCodeCard/LeetCodeCard'
import { NeetCodeLists } from '../NeetCodeLists/NeetCodeLists'
import { ProblemSolvingEditor } from '../ProblemSolvingEditor/ProblemSolvingEditor'
import { useProblemSolvingSectionViewModel, type ProblemSolvingSectionProps } from './ProblemSolvingSection.viewModel'

/** LeetCode stats, fetched through the API, and the NeetCode lists completed. */
export function ProblemSolvingSection(props: ProblemSolvingSectionProps) {
  const vm = useProblemSolvingSectionViewModel(props)
  return (
    <EditableSection title="Problem solving" errorKeys={['problemSolving']} value={props.value} canEdit={props.canEdit} onSave={props.onSave} editor={ProblemSolvingEditor}>
      {vm.empty ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <div className="problem-solving">
          {vm.leetCodeUsername && <LeetCodeCard key={vm.leetCodeUsername} username={vm.leetCodeUsername} canEdit={props.canEdit} />}
          {vm.neetCodeLists.length > 0 && <NeetCodeLists lists={vm.neetCodeLists} />}
        </div>
      )}
    </EditableSection>
  )
}
