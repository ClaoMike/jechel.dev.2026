import { ItemControls, MonthField, TextField } from '../../../../components/fields'
import { useQualificationEditorViewModel, type QualificationEditorProps } from './QualificationEditor.viewModel'

/** One qualification: what, issued by whom, when, and the grade. */
export function QualificationEditor(props: QualificationEditorProps) {
  const { index, count, item, errors, onMove, onRemove } = props
  const vm = useQualificationEditorViewModel(props)
  return (
    <fieldset className="editor-item">
      <legend>{vm.legend}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={vm.name} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label="Qualification" value={item.title} required onChange={vm.setTitle} error={errors.title} allowLinks />
        <TextField label="Issued by (optional)" value={item.issuer} onChange={vm.setIssuer} error={errors.issuer} allowLinks />
      </div>
      <div className="editor-period">
        <MonthField label="Obtained" value={vm.obtained} onChange={vm.setObtained} error={errors.obtained} />
        <TextField label="Grade (optional)" value={item.grade} onChange={vm.setGrade} error={errors.grade} placeholder="e.g. First Class, 870/1000" />
      </div>
    </fieldset>
  )
}
