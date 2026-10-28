import type { EditorProps } from '../../../../components/fields'
import type { Licence } from '../../../../services/api'
import { removeAt } from '../../list'
import { isOffered, LICENCE_CATEGORY_LABELS, OFFERED_LICENCES, sameLicence } from '../licences'
import { OfferedLicences } from '../OfferedLicences/OfferedLicences'
import { OwnLicenceForm } from '../OwnLicenceForm/OwnLicenceForm'
import { OwnLicences } from '../OwnLicences/OwnLicences'
import { strings } from '../../../../strings'

const OFFERED_CATEGORIES = ['driving', 'flying', 'boating'] as const

/** Click the licences you have (driving, flying, boating), or add your own. */
export function LicencesEditor({ value, onChange, errors }: EditorProps<Licence[]>) {
  const has = (licence: Licence) => value.some((l) => sameLicence(l, licence))
  const toggle = (licence: Licence) => onChange(has(licence) ? value.filter((l) => !sameLicence(l, licence)) : [...value, licence])

  const own = value.flatMap((licence, i) =>
    isOffered(licence)
      ? []
      : [
          {
            key: i,
            licence,
            kind: LICENCE_CATEGORY_LABELS[licence.category],
            error: errors[`licences[${i}].name`] ?? errors[`licences[${i}].code`],
            remove: () => onChange(removeAt(value, i)),
          },
        ],
  )

  return (
    <div className="editor-list">
      {OFFERED_CATEGORIES.map((category) => (
        <OfferedLicences
          key={category}
          category={category}
          label={LICENCE_CATEGORY_LABELS[category]}
          licences={OFFERED_LICENCES[category].map((offered) => {
            const licence = { ...offered, category }
            return { key: `${offered.code}-${offered.name}`, code: offered.code, name: offered.name, on: has(licence), toggle: () => toggle(licence) }
          })}
        />
      ))}
      <fieldset className="editor-item">
        <legend>{strings.licencesEditor.others}</legend>
        <OwnLicences licences={own} />
        {/* The same licence twice is added once. */}
        <OwnLicenceForm onAdd={(licence) => !has(licence) && onChange([...value, licence])} />
      </fieldset>
      {errors.licences && <p className="field-error">{errors.licences}</p>}
    </div>
  )
}
