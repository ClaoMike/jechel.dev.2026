import { useId, useState } from 'react'
import { AddButton, TextField } from '@/shared/ui/fields'
import { LICENCE_CATEGORIES, type Licence, type LicenceCategory } from '@/shared/api'
import { LICENCE_CATEGORY_LABELS } from '../../../lib/licences'
import { strings } from '@/shared/i18n'

/** A licence that isn't offered: kind, optional code, and what it's for. */
export function OwnLicenceForm({ onAdd }: { onAdd: (licence: Licence) => void }) {
  const categoryId = useId()
  const [draft, setDraft] = useState<Licence>({ category: 'driving', code: '', name: '' })
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!draft.name.trim()) {
      setError(strings.ownLicenceForm.enterWhatLicence)
      return
    }
    onAdd({ category: draft.category, code: draft.code.trim(), name: draft.name.trim() })
    setDraft({ ...draft, code: '', name: '' })
    setError(null)
  }

  return (
    <div
      className="licence-own-form"
      // Enter adds it instead of submitting the section's form.
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          add()
        }
      }}
    >
      <div className="field">
        <label htmlFor={categoryId}>{strings.ownLicenceForm.kind}</label>
        <select id={categoryId} className="select" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as LicenceCategory })}>
          {LICENCE_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {LICENCE_CATEGORY_LABELS[category]}
            </option>
          ))}
        </select>
      </div>
      <TextField label={strings.ownLicenceForm.codeOptional} value={draft.code} onChange={(code) => setDraft({ ...draft, code })} placeholder="e.g. T" />
      <TextField
        label={strings.ownLicenceForm.for}
        value={draft.name}
        onChange={(name) => {
          setDraft({ ...draft, name })
          setError(null)
        }}
        placeholder={strings.ownLicenceForm.eGTractor}
        error={error ?? undefined}
      />
      <AddButton onClick={add}>{strings.ownLicenceForm.addLicence}</AddButton>
    </div>
  )
}
