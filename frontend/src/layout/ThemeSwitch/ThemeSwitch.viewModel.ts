import { useId, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { themeChosen } from '../../store/themeSlice'
import { THEMES, type Theme } from '../theme'

const LABELS: Record<Theme, string> = { dark: 'Dark mode', light: 'Light mode', vice: 'Vice mode' }

export function useThemeSwitchViewModel() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((state) => state.theme.theme)
  return {
    name: useId(),
    style: { '--theme-index': THEMES.indexOf(theme) } as CSSProperties,
    options: THEMES.map((option) => ({ value: option, label: LABELS[option], checked: theme === option, choose: () => dispatch(themeChosen(option)) })),
  }
}
