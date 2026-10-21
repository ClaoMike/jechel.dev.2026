import { AddButton, ItemControls, TextField } from '../../../../components/fields'
import { ArrowDownIcon } from '../../../../components/icons/icons'
import { PeriodEditor } from '../PeriodEditor/PeriodEditor'
import { useSkillEditorViewModel, type SkillEditorProps } from './SkillEditor.viewModel'

/** One skill, folded to a row (its name, how long, move and remove) until clicked open. A skill with an error is always open. */
export function SkillEditor(props: SkillEditorProps) {
  const { index, count, skill, onToggle, onMove, onRemove } = props
  const vm = useSkillEditorViewModel(props)

  return (
    <fieldset className="editor-item accordion-item">
      <legend className="visually-hidden">{vm.legend}</legend>
      <div className="accordion-header">
        <button type="button" className="accordion-toggle" aria-expanded={vm.expanded} aria-controls={vm.bodyId} onClick={onToggle} disabled={vm.locked}>
          <ArrowDownIcon size={16} />
          <span className="accordion-title">{vm.title}</span>
          <span className="muted accordion-meta">{vm.meta}</span>
        </button>
        <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div id={vm.bodyId} className="accordion-body" hidden={!vm.expanded}>
        <TextField label="Skill" value={skill.name} required onChange={vm.setName} error={vm.nameError} />
        <div className="editor-subitems">
          {vm.periods.length === 0 && <p className="muted editor-note">No dates yet. Add when you used it to show it on the timeline.</p>}
          {vm.periods.map(({ key, ...period }) => (
            <PeriodEditor key={key} {...period} />
          ))}
          {vm.periodsError && <p className="field-error">{vm.periodsError}</p>}
          <AddButton onClick={vm.addPeriod}>
            Add period <span className="visually-hidden">{vm.addPeriodContext}</span>
          </AddButton>
        </div>
      </div>
    </fieldset>
  )
}
