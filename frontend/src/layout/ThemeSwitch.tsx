import { useId, type CSSProperties, type ReactNode } from 'react'
import { MoonIcon, SunIcon } from '../components/icons'
import { ViceMark } from '../components/ViceMark'
import { THEMES, setTheme, useTheme, type Theme } from './theme'

const LABELS: Record<Theme, string> = { dark: 'Dark mode', light: 'Light mode', vice: 'Vice mode' }

const ICONS: Record<Theme, ReactNode> = {
  dark: <MoonIcon size={16} />,
  light: <SunIcon size={16} />,
  vice: <ViceMark />,
}

/**
 * A three-way slider for the colour theme: dark, light and Vice. Radio buttons underneath, so the
 * arrow keys move between them; the glass thumb slides to the chosen one.
 */
export function ThemeSwitch() {
  const name = useId()
  const theme = useTheme()

  return (
    <fieldset className="theme-switch" style={{ '--theme-index': THEMES.indexOf(theme) } as CSSProperties}>
      <legend className="visually-hidden">Theme</legend>
      <span className="theme-switch-thumb" aria-hidden="true" />
      {THEMES.map((option) => (
        <label key={option} className="theme-switch-option" title={LABELS[option]}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={theme === option}
            onChange={() => setTheme(option)}
            className="visually-hidden"
          />
          {ICONS[option]}
          <span className="visually-hidden">{LABELS[option]}</span>
        </label>
      ))}
    </fieldset>
  )
}
