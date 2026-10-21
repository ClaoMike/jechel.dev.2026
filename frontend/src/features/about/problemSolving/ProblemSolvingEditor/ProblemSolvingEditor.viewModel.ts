import type { EditorProps } from '../../../../components/fields'
import { NEETCODE_LISTS, type ProblemSolving } from '../../../../services/api'
import { leetCodeUsernameFrom, NEETCODE_LIST_LABELS, toggleList } from '../problemSolving'

/** The LeetCode username (a pasted profile link becomes the name) and the NeetCode lists as toggles. */
export function useProblemSolvingEditorViewModel({ value, onChange, errors }: EditorProps<ProblemSolving>) {
  return {
    username: value.leetCodeUsername,
    setUsername: (input: string) => onChange({ ...value, leetCodeUsername: leetCodeUsernameFrom(input) }),
    usernameError: errors['problemSolving.leetCodeUsername'],
    lists: NEETCODE_LISTS.map((list) => ({
      key: list,
      label: NEETCODE_LIST_LABELS[list],
      done: value.neetCodeLists.includes(list),
      toggle: () => onChange({ ...value, neetCodeLists: toggleList(value.neetCodeLists, list) }),
    })),
    listsError: errors['problemSolving.neetCodeLists'],
    sectionError: errors.problemSolving,
  }
}
