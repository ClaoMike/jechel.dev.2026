import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { chosenTheme, rememberSlowDevice, storedTheme, type Theme } from '@/shared/lib/theme'
import { systemTheme } from '@/shared/lib/browser'

export interface ThemeState {
  /** The theme on show (<html data-theme>, set by the store's listener; app/styles/glass.css keys off it). */
  theme: Theme
  /** Set when Vice was too slow here and the site switched to this theme by itself: the notice says so. */
  slowSwitchedTo: Theme | null
}

export const themeSlice = createSlice({
  name: 'theme',
  initialState: (): ThemeState => ({ theme: storedTheme(), slowSwitchedTo: null }),
  reducers: {
    /** The visitor picked one with the switch (remembered as their choice). */
    themeChosen(state, action: PayloadAction<Theme>) {
      state.theme = action.payload
      state.slowSwitchedTo = null
    },
    /** Vice was too slow: shows the visitor's light or dark, without making it their choice. */
    slowSceneSwitched(state, action: PayloadAction<Theme>) {
      state.theme = action.payload
      state.slowSwitchedTo = action.payload
    },
    slowNoticeDismissed(state) {
      state.slowSwitchedTo = null
    },
  },
})

export const { themeChosen, slowSceneSwitched, slowNoticeDismissed } = themeSlice.actions

/**
 * Vice is drawing too slowly here. Unless the visitor chose Vice themselves, switches to their light
 * or dark and remembers it for next time (later visits start there straight away).
 */
export const reportSlowScene = (): AppThunk => (dispatch) => {
  if (chosenTheme() !== null) return
  rememberSlowDevice()
  dispatch(slowSceneSwitched(systemTheme()))
}
