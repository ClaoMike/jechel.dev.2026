import type { EditorProps } from '../../../../components/fields'
import type { Licence } from '../../../../services/api'
import { isOffered, LICENCE_CATEGORY_LABELS, OFFERED_LICENCES, sameLicence } from '../licences'
import { removeAt } from '../../list'

const OFFERED_CATEGORIES = ['driving', 'flying', 'boating'] as const

/** The offered licences as toggles per kind, the admin's own (with their errors), and adding one. */
export function useLicencesEditorViewModel({ value, onChange, errors }: EditorProps<Licence[]>) {
  const has = (licence: Licence) => value.some((l) => sameLicence(l, licence))
  const toggle = (licence: Licence) => onChange(has(licence) ? value.filter((l) => !sameLicence(l, licence)) : [...value, licence])

  return {
    offered: OFFERED_CATEGORIES.map((category) => ({
      category,
      label: LICENCE_CATEGORY_LABELS[category],
      licences: OFFERED_LICENCES[category].map((offered) => {
        const licence = { ...offered, category }
        return { key: `${offered.code}-${offered.name}`, code: offered.code, name: offered.name, on: has(licence), toggle: () => toggle(licence) }
      }),
    })),
    own: value.flatMap((licence, i) =>
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
    ),
    // The same licence twice is added once.
    addOwn: (licence: Licence) => (has(licence) ? undefined : onChange([...value, licence])),
    listError: errors.licences,
  }
}
