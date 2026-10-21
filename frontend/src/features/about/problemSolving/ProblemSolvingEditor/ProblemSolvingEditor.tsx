import { TextField, type EditorProps } from '../../../../components/fields'
import type { ProblemSolving } from '../../../../services/api'
import { useProblemSolvingEditorViewModel } from './ProblemSolvingEditor.viewModel'

/** The LeetCode username, and which NeetCode lists are done. */
export function ProblemSolvingEditor(props: EditorProps<ProblemSolving>) {
  const vm = useProblemSolvingEditorViewModel(props)
  return (
    <div className="editor-list">
      <TextField
        label="LeetCode username"
        value={vm.username}
        onChange={vm.setUsername}
        error={vm.usernameError}
        hint="As in leetcode.com/u/username (pasting the profile link works too). Leave empty to hide the stats."
        placeholder="e.g. neetcode"
      />
      <fieldset className="editor-item">
        <legend>NeetCode lists completed</legend>
        <p className="muted editor-note">Click the ones you've completed.</p>
        <div className="licence-toggles">
          {vm.lists.map((list) => (
            <button key={list.key} type="button" className="licence-toggle" aria-pressed={list.done} onClick={list.toggle}>
              {list.label}
            </button>
          ))}
        </div>
        {vm.listsError && <p className="field-error">{vm.listsError}</p>}
      </fieldset>
      {vm.sectionError && <p className="field-error">{vm.sectionError}</p>}
    </div>
  )
}
