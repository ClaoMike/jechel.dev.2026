import type { ProblemSolving } from '../../../../services/api'
import { NEETCODE_LIST_LABELS } from '../problemSolving'

export interface ProblemSolvingSectionProps {
  value: ProblemSolving
  canEdit: boolean
  onSave: (value: ProblemSolving) => Promise<void>
}

/** Whether there's anything to show: the LeetCode card (by username) and the NeetCode lists, by name. */
export function useProblemSolvingSectionViewModel({ value }: ProblemSolvingSectionProps) {
  return {
    empty: !value.leetCodeUsername && value.neetCodeLists.length === 0,
    leetCodeUsername: value.leetCodeUsername || null,
    neetCodeLists: value.neetCodeLists.map((list) => NEETCODE_LIST_LABELS[list]),
  }
}
