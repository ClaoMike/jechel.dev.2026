import { useId, useState, type CSSProperties } from 'react'
import { useAppDispatch, useAppSelector } from '../../store'
import { themeChosen } from '../../store/themeSlice'
import { THEMES, type Theme } from '../theme'

const LABELS: Record<Theme, string> = { dark: 'Dark mode', light: 'Light mode', vice: 'Vice mode' }

export function useThemeSwitchViewModel() {
  const dispatch = useAppDispatch()
  const theme = useAppSelector((state) => state.theme.theme)
  // The one just picked here: its icon plays its little turn (not on load, nor when the theme changes by itself).
  const [picked, setPicked] = useState<Theme | null>(null)
  return {
    name: useId(),
    style: { '--theme-index': THEMES.indexOf(theme) } as CSSProperties,
    options: THEMES.map((option) => ({
      value: option,
      label: LABELS[option],
      checked: theme === option,
      picked: picked === option && theme === option,
      choose: () => {
        setPicked(option)
        dispatch(themeChosen(option))
      },
    })),
  }
}
