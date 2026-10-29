import { useId, useState, type CSSProperties, type ReactNode } from 'react'
import { MoonIcon, SunIcon } from '@/shared/ui/icons'
import { ViceMark } from '@/shared/ui/ViceMark'
import { useAppDispatch, useAppSelector } from '@/shared/lib/store'
import { themeChosen } from '../../model/themeSlice'
import { THEMES, type Theme } from '@/shared/lib/theme'
import { strings } from '@/shared/i18n'

const LABELS: Record<Theme, string> = { dark: strings.themeSwitch.darkMode, light: strings.themeSwitch.lightMode, vice: strings.themeSwitch.viceMode }

const ICONS: Record<Theme, ReactNode> = {
  dark: <MoonIcon size={16} />,
  light: <SunIcon size={16} />,
  vice: <ViceMark />,
}

/**
 * A three-way slider for the colour theme: dark, light and Vice. Radio buttons underneath, so the
 * arrow keys move between them; the app/styles/glass thumb slides to the chosen one, and its icon turns once.
 */
export function ThemeSwitch() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((state) => state.theme.theme)
  // The one just picked here: its icon plays its little turn (not on load, nor when the theme changes by itself).
  const [picked, setPicked] = useState<Theme | null>(null)
  const name = useId()

  return (
    <fieldset className="theme-switch" style={{ '--theme-index': THEMES.indexOf(theme) } as CSSProperties}>
      <legend className="visually-hidden">{strings.themeSwitch.theme}</legend>
      <span className="theme-switch-thumb" aria-hidden="true" />
      {THEMES.map((option) => (
        <label key={option} className="theme-switch-option" title={LABELS[option]} data-theme-option={option} data-picked={(picked === option && theme === option) || undefined}>
          <input
            type="radio"
            name={name}
            value={option}
            checked={theme === option}
            onChange={() => {
              setPicked(option)
              dispatch(themeChosen(option))
            }}
            className="visually-hidden"
          />
          {ICONS[option]}
          <span className="visually-hidden">{LABELS[option]}</span>
        </label>
      ))}
    </fieldset>
  )
}
