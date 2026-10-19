import { ColorField } from '../../../../components/fields'

export interface ColorChoice {
  key: string
  label: string
  value: string
  onChange: (color: string) => void
  error?: string
}

/** "Colours": a colour picker for each thing a section colours (skill uses, kinds of visit). */
export function ColorsFieldset({ colors }: { colors: ColorChoice[] }) {
  return (
    <fieldset className="editor-item">
      <legend>Colours</legend>
      <div className="color-row">
        {colors.map(({ key, ...color }) => (
          <ColorField key={key} {...color} />
        ))}
      </div>
    </fieldset>
  )
}
