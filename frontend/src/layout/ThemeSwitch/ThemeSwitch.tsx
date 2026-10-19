import type { ReactNode } from 'react'
import { MoonIcon, SunIcon } from '../../components/icons/icons'
import { ViceMark } from '../../components/ViceMark'
import type { Theme } from '../theme'
import { useThemeSwitchViewModel } from './ThemeSwitch.viewModel'

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
  const vm = useThemeSwitchViewModel()

  return (
    <fieldset className="theme-switch" style={vm.style}>
      <legend className="visually-hidden">Theme</legend>
      <span className="theme-switch-thumb" aria-hidden="true" />
      {vm.options.map((option) => (
        <label key={option.value} className="theme-switch-option" title={option.label}>
          <input type="radio" name={vm.name} value={option.value} checked={option.checked} onChange={option.choose} className="visually-hidden" />
          {ICONS[option.value]}
          <span className="visually-hidden">{option.label}</span>
        </label>
      ))}
    </fieldset>
  )
}
