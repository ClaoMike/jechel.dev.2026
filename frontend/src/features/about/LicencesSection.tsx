import { useId, useState, type ReactNode } from 'react'
import { BadgeIcon, BoatIcon, CarIcon, PlaneIcon } from '../../components/icons'
import { LICENCE_CATEGORIES, type Licence, type LicenceCategory } from '../../services/api'
import { EditableSection } from './EditableSection'
import { AddButton, ItemControls, TextField, type EditorProps } from './fields'
import { isOffered, LICENCE_CATEGORY_LABELS, OFFERED_LICENCES, sameLicence } from './licences'
import { removeAt } from './list'

const ICONS: Record<LicenceCategory, (p: { size?: number }) => ReactNode> = { driving: CarIcon, flying: PlaneIcon, boating: BoatIcon, other: BadgeIcon }

/** Driving, flying and boating licences, as labels grouped by kind. */
export function LicencesSection({ value, canEdit, onSave }: { value: Licence[]; canEdit: boolean; onSave: (value: Licence[]) => Promise<void> }) {
  return (
    <EditableSection title="Licences" errorKeys={['licences']} value={value} canEdit={canEdit} onSave={onSave} editor={(props) => <LicencesEditor {...props} />}>
      {value.length === 0 ? (
        <p className="muted">Nothing here yet.</p>
      ) : (
        <div className="licence-groups">
          {LICENCE_CATEGORIES.map((category) => {
            const licences = inDisplayOrder(value.filter((l) => l.category === category))
            if (licences.length === 0) return null
            const Icon = ICONS[category]
            return (
              <div key={category} className="licence-group">
                <h3 className="licence-group-title">
                  <Icon size={18} />
                  {LICENCE_CATEGORY_LABELS[category]}
                </h3>
                <ul className="chips" aria-label={`${LICENCE_CATEGORY_LABELS[category]} licences`}>
                  {licences.map((licence, i) => (
                    <li key={i} className="chip licence-chip">
                      {licence.code && <strong className="licence-code">{licence.code}</strong>}
                      {licence.name}
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      )}
    </EditableSection>
  )
}

/** Offered licences in the catalogue's order, then the admin's own in the order added. */
function inDisplayOrder(licences: Licence[]): Licence[] {
  const rank = (l: Licence) => (l.category === 'other' ? -1 : OFFERED_LICENCES[l.category].findIndex((o) => sameLicence(l, { ...o, category: l.category })))
  const offered = licences.filter(isOffered).sort((a, b) => rank(a) - rank(b))
  return [...offered, ...licences.filter((l) => !isOffered(l))]
}

function LicencesEditor({ value, onChange, errors }: EditorProps<Licence[]>) {
  const has = (licence: Licence) => value.some((l) => sameLicence(l, licence))
  const toggle = (licence: Licence) => onChange(has(licence) ? value.filter((l) => !sameLicence(l, licence)) : [...value, licence])
  const ownIndexes = value.map((l, i) => (isOffered(l) ? -1 : i)).filter((i) => i >= 0)

  return (
    <div className="editor-list">
      <p className="muted editor-note">Click the ones you have.</p>
      {(['driving', 'flying', 'boating'] as const).map((category) => {
        const Icon = ICONS[category]
        return (
          <fieldset key={category} className="editor-item">
            <legend>
              <span className="licence-legend">
                <Icon size={16} />
                {LICENCE_CATEGORY_LABELS[category]}
              </span>
            </legend>
            <div className="licence-toggles">
              {OFFERED_LICENCES[category].map((offered) => {
                const licence = { ...offered, category }
                return (
                  <button
                    key={`${offered.code}-${offered.name}`}
                    type="button"
                    className="licence-toggle"
                    aria-pressed={has(licence)}
                    onClick={() => toggle(licence)}
                  >
                    {/* Named by what it shows ("B Car"): the space keeps code and name apart for screen readers too. */}
                    {offered.code && <strong className="licence-code">{offered.code}</strong>}
                    {offered.code && ' '}
                    {offered.name}
                  </button>
                )
              })}
            </div>
          </fieldset>
        )
      })}
      <fieldset className="editor-item">
        <legend>Others</legend>
        {ownIndexes.length > 0 && (
          <ul className="licence-own">
            {ownIndexes.map((i) => (
              <li key={i}>
                <span className="chip licence-chip">
                  {value[i].code && <strong className="licence-code">{value[i].code}</strong>}
                  {value[i].name}
                </span>
                <span className="muted"> {LICENCE_CATEGORY_LABELS[value[i].category]}</span>
                {(errors[`licences[${i}].name`] || errors[`licences[${i}].code`]) && <span className="field-error"> {errors[`licences[${i}].name`] ?? errors[`licences[${i}].code`]}</span>}
                <ItemControls name={value[i].name} index={0} count={1} onRemove={() => onChange(removeAt(value, i))} />
              </li>
            ))}
          </ul>
        )}
        <OwnLicenceForm onAdd={(licence) => (has(licence) ? undefined : onChange([...value, licence]))} />
      </fieldset>
      {errors.licences && <p className="field-error">{errors.licences}</p>}
    </div>
  )
}

/** A licence that isn't offered: kind, optional code, and name. */
function OwnLicenceForm({ onAdd }: { onAdd: (licence: Licence) => void }) {
  const categoryId = useId()
  const [draft, setDraft] = useState<Licence>({ category: 'driving', code: '', name: '' })
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!draft.name.trim()) {
      setError('Enter what the licence is for.')
      return
    }
    onAdd({ category: draft.category, code: draft.code.trim(), name: draft.name.trim() })
    setDraft({ ...draft, code: '', name: '' })
    setError(null)
  }

  return (
    <div className="licence-own-form" onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())}>
      <div className="field">
        <label htmlFor={categoryId}>Kind</label>
        <select id={categoryId} className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as LicenceCategory })}>
          {LICENCE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {LICENCE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>
      <TextField label="Code (optional)" value={draft.code} onChange={(code) => setDraft({ ...draft, code })} placeholder="e.g. T" />
      <TextField label="For" value={draft.name} onChange={(name) => (setDraft({ ...draft, name }), setError(null))} placeholder="e.g. Tractor" error={error ?? undefined} />
      <AddButton onClick={add}>Add licence</AddButton>
    </div>
  )
}
