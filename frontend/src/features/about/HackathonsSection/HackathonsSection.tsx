import { SortIcon } from '../../../components/icons/icons'
import type { Hackathon } from '../../../services/api'
import { BulletsEditor } from '../BulletsSection'
import { EditableSection } from '../EditableSection/EditableSection'
import { useHackathonYearViewModel } from './HackathonsSection.viewModel'
import { AddButton, ItemControls, TextField, type EditorProps, type FieldErrors } from '../fields/fields'
import { move, removeAt, replaceAt, sortByYear } from '../list'
import { useSortableListViewModel } from '../list.viewModel'
import { RichText } from '../RichText'

/** Hackathons: name, year, and what happened, on the same timeline as work experience. */
export function HackathonsSection({ value, canEdit, onSave }: { value: Hackathon[]; canEdit: boolean; onSave: (value: Hackathon[]) => Promise<void> }) {
  return (
    <EditableSection title="Hackathons" errorKeys={['hackathons']} value={value} canEdit={canEdit} onSave={onSave} editor={(props) => <HackathonsEditor {...props} />}>
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <ol className="timeline">
          {value.map((hackathon, i) => (
            <li key={i} className="timeline-item">
              <div className="timeline-heading">
                <h3>
                  <RichText text={hackathon.name} />
                </h3>
              </div>
              <p className="timeline-period">
                <time dateTime={String(hackathon.year)}>{hackathon.year}</time>
              </p>
              {hackathon.bullets.length > 0 && (
                <ul className="bullets">
                  {hackathon.bullets.map((bullet, b) => (
                    <li key={b}>
                      <RichText text={bullet} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </EditableSection>
  )
}

function HackathonsEditor({ value, onChange, errors }: EditorProps<Hackathon[]>) {
  const vm = useSortableListViewModel(value, onChange, sortByYear)
  const { change } = vm

  return (
    <div className="editor-list">
      <div className="editor-list-header">
        <p className="muted editor-note">Shown in this order. Move entries with the arrows, or sort them by year.</p>
        <button
          type="button"
          className="button button-secondary button-small"
          disabled={!vm.canSort}
          onClick={vm.sort}
        >
          <SortIcon size={16} />
          Sort by year
        </button>
      </div>
      <p role="status" className={vm.sorted ? 'editor-status' : 'visually-hidden'}>
        {vm.sorted ? 'Sorted by year, newest first. Save to keep this order, or Cancel to undo.' : ''}
      </p>
      {value.map((hackathon, i) => (
        <HackathonEditor
          key={i}
          index={i}
          count={value.length}
          hackathon={hackathon}
          errors={errors}
          onChange={(next) => change(replaceAt(value, i, next))}
          onMove={(from, to) => change(move(value, from, to))}
          onRemove={() => change(removeAt(value, i))}
        />
      ))}
      {errors.hackathons && <p className="field-error">{errors.hackathons}</p>}
      <AddButton onClick={() => change([{ name: '', year: new Date().getFullYear(), bullets: [''] }, ...value])}>Add hackathon</AddButton>
    </div>
  )
}

interface HackathonEditorProps {
  index: number
  count: number
  hackathon: Hackathon
  errors: FieldErrors
  onChange: (hackathon: Hackathon) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

function HackathonEditor({ index, count, hackathon, errors, onChange, onMove, onRemove }: HackathonEditorProps) {
  const key = `hackathons[${index}]`
  const vm = useHackathonYearViewModel(hackathon, onChange)
  const { yearId } = vm
  const yearError = errors[`${key}.year`]

  return (
    <fieldset className="editor-item">
      <legend>Hackathon {index + 1}</legend>
      <div className="editor-item-toolbar">
        <ItemControls name={`hackathon ${index + 1}`} index={index} count={count} onMove={onMove} onRemove={onRemove} />
      </div>
      <div className="editor-grid">
        <TextField label="Name" value={hackathon.name} required onChange={(name) => onChange({ ...hackathon, name })} error={errors[`${key}.name`]} allowLinks />
        <div className="field">
          <label htmlFor={yearId}>Year</label>
          <input
            id={yearId}
            className="year-input"
            inputMode="numeric"
            maxLength={4}
            value={vm.year}
            aria-invalid={yearError || !vm.yearValid ? true : undefined}
            aria-describedby={yearError ? `${yearId}-error` : undefined}
            onChange={(e) => vm.setYear(e.target.value)}
          />
          {yearError && (
            <p className="field-error" id={`${yearId}-error`}>
              {yearError}
            </p>
          )}
        </div>
      </div>
      <div className="editor-bullets">
        <span className="field-label">What happened</span>
        <BulletsEditor itemName="bullet point" value={hackathon.bullets} onChange={(bullets) => onChange({ ...hackathon, bullets })} errorFor={(b) => errors[`${key}.bullets[${b}]`]} listError={errors[`${key}.bullets`]} />
      </div>
    </fieldset>
  )
}
