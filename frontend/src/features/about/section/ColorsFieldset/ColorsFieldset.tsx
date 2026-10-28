import { ColorField } from '../../../../components/fields'
import { strings } from '../../../../strings'

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
      <legend>{strings.colorsFieldset.colours}</legend>
      <div className="color-row">
        {colors.map(({ key, ...color }) => (
          <ColorField key={key} {...color} />
        ))}
      </div>
    </fieldset>
  )
}
