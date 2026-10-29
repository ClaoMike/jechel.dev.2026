import { useId, type CSSProperties } from 'react'
import { strings } from '../../i18n'

/**
 * On or Off, as the theme switcher looks: two stops with a app/styles/glass thumb that slides to the chosen one.
 * Radio buttons underneath, so the arrow keys move between them, named after what they switch.
 */
export function OnOffSwitch({ label, on, onChange, disabled = false }: { label: string; on: boolean; onChange: (on: boolean) => void; disabled?: boolean }) {
  const name = useId()
  return (
    <fieldset className="theme-switch on-off-switch" style={{ '--theme-index': on ? 0 : 1 } as CSSProperties} disabled={disabled} data-on={on}>
      <legend className="visually-hidden">{label}</legend>
      <span className="theme-switch-thumb" aria-hidden="true" />
      {([true, false] as const).map((value) => (
        <label key={String(value)} className="theme-switch-option">
          <input type="radio" name={name} checked={on === value} onChange={() => onChange(value)} className="visually-hidden" />
          {value ? strings.onOffSwitch.on : strings.onOffSwitch.off}
        </label>
      ))}
    </fieldset>
  )
}
