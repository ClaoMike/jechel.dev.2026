import { TextField, type EditorProps } from '@/shared/ui/fields'
import { NEETCODE_LISTS, type ProblemSolving } from '@/shared/api'
import { leetCodeUsernameFrom, NEETCODE_LIST_LABELS, toggleList } from '../../../lib/problemSolving'
import { strings } from '@/shared/i18n'

/** The LeetCode username, and which NeetCode lists are done. */
export function ProblemSolvingEditor({ value, onChange, errors }: EditorProps<ProblemSolving>) {
  return (
    <div className="editor-list">
      <TextField
        label={strings.problemSolvingEditor.leetcodeUsername}
        value={value.leetCodeUsername}
        // A pasted profile link becomes the name.
        onChange={(input) => onChange({ ...value, leetCodeUsername: leetCodeUsernameFrom(input) })}
        error={errors['problemSolving.leetCodeUsername']}
        hint={strings.problemSolvingEditor.leetcodeComUUsername}
        placeholder={strings.problemSolvingEditor.eGNeetcode}
      />
      <fieldset className="editor-item">
        <legend>{strings.problemSolvingEditor.neetcodeListsCompleted}</legend>
        <p className="muted editor-note">{strings.problemSolvingEditor.clickOnesYouveCompleted}</p>
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
