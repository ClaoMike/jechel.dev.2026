import { TextField, type EditorProps } from '../../../../components/fields'
import { NEETCODE_LISTS, type ProblemSolving } from '../../../../services/api'
import { leetCodeUsernameFrom, NEETCODE_LIST_LABELS, toggleList } from '../problemSolving'

/** The LeetCode username, and which NeetCode lists are done. */
export function ProblemSolvingEditor({ value, onChange, errors }: EditorProps<ProblemSolving>) {
  return (
    <div className="editor-list">
      <TextField
        label="LeetCode username"
        value={value.leetCodeUsername}
        // A pasted profile link becomes the name.
        onChange={(input) => onChange({ ...value, leetCodeUsername: leetCodeUsernameFrom(input) })}
        error={errors['problemSolving.leetCodeUsername']}
        hint="As in leetcode.com/u/username (pasting the profile link works too). Leave empty to hide the stats."
        placeholder="e.g. neetcode"
      />
      <fieldset className="editor-item">
        <legend>NeetCode lists completed</legend>
        <p className="muted editor-note">Click the ones you've completed.</p>
        <div className="licence-toggles">
          {NEETCODE_LISTS.map((list) => (
            <button
              key={list}
              type="button"
              className="licence-toggle"
              aria-pressed={value.neetCodeLists.includes(list)}
              onClick={() => onChange({ ...value, neetCodeLists: toggleList(value.neetCodeLists, list) })}
            >
              {NEETCODE_LIST_LABELS[list]}
            </button>
          ))}
        </div>
        {errors['problemSolving.neetCodeLists'] && <p className="field-error">{errors['problemSolving.neetCodeLists']}</p>}
      </fieldset>
      {errors.problemSolving && <p className="field-error">{errors.problemSolving}</p>}
    </div>
  )
}
