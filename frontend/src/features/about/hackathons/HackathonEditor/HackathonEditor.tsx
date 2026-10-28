import { useId, useState } from 'react'
import { ItemControls, TextField, type FieldErrors } from '../../../../components/fields'
import type { Hackathon } from '../../../../services/api'
import { BulletsEditor } from '../../section/BulletsEditor/BulletsEditor'

const YEAR = /^\d{4}$/

export interface HackathonEditorProps {
  index: number
  count: number
  hackathon: Hackathon
  errors: FieldErrors
  onChange: (hackathon: Hackathon) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One hackathon: name, year, and what happened. */
export function HackathonEditor({ index, count, hackathon, errors, onChange, onMove, onRemove }: HackathonEditorProps) {
  // The year box keeps what's typed ("20" on the way to "2024"); the value changes once it's a full year.
  const [year, setYear] = useState(String(hackathon.year))
  const [shownYear, setShownYear] = useState(hackathon.year)
  if (hackathon.year !== shownYear) {
    setShownYear(hackathon.year)
    setYear(String(hackathon.year))
  }
  const key = `hackathons[${index}]`
  const yearError = errors[`${key}.year`]
  const yearId = useId()
  const yearErrorId = yearError ? `${yearId}-error` : undefined

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
            value={year}
            aria-invalid={!!yearError || !YEAR.test(year) || undefined}
            aria-describedby={yearErrorId}
            onChange={(e) => {
              const next = e.target.value
              setYear(next)
              if (YEAR.test(next)) onChange({ ...hackathon, year: Number(next) })
            }}
          />
          {yearError && (
            <p className="field-error" id={yearErrorId}>
              {yearError}
            </p>
          )}
        </div>
      </div>
      <div className="editor-bullets">
        <span className="field-label">What happened</span>
        <BulletsEditor
          itemName="bullet point"
          value={hackathon.bullets}
          onChange={(bullets) => onChange({ ...hackathon, bullets })}
          errorFor={(b) => errors[`${key}.bullets[${b}]`]}
          listError={errors[`${key}.bullets`]}
        />
      </div>
    </fieldset>
  )
}
