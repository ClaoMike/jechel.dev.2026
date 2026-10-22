import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit'
import { tellOtherTabs } from '../auth/authChannel'
import { rememberAcceptance } from '../features/terms/acceptance'
import { rememberTheme, showTheme } from '../layout/theme'
import { setRequestPreview } from '../services/api'
import { checkSession, refreshSession, signOut } from './authSlice'
import { baseApi } from './baseApi'
import type { AppDispatch, RootState } from './index'
import { activePreview, PREVIEW_STORAGE_KEY, previewModeChanged } from './previewSlice'
import { termsAccepted } from './termsSlice'
import { settingsApi } from './api/settingsApi'
import { saveSite } from './siteSlice'
import { slowSceneSwitched, themeChosen } from './themeSlice'

/**
 * What the store does outside itself when its state changes: storage, <html data-theme>, the
 * admin's preview switch on requests. Reducers stay pure; this is the one place for side effects.
 */
export const listeners = createListenerMiddleware()
const startListening = listeners.startListening.withTypes<RootState, AppDispatch>()

startListening({
  actionCreator: themeChosen,
  effect: ({ payload }) => {
    rememberTheme(payload)
    showTheme(payload)
  },
})

startListening({ actionCreator: slowSceneSwitched, effect: ({ payload }) => showTheme(payload) })

// The header's Buy me a coffee asks the API whether it's offered (and where it leads): switching it in Settings, or
// saving its link there, asks again at once, no reload. Saving the Cal.com page asks again for the admin's booking link.
startListening({ actionCreator: saveSite.fulfilled, effect: (_, { dispatch }) => void dispatch(baseApi.util.invalidateTags(['Support'])) })

startListening({
  matcher: settingsApi.endpoints.saveSetting.matchFulfilled,
  effect: ({ meta }, { dispatch }) => {
    const { key } = meta.arg.originalArgs
    if (key.startsWith('Support:')) dispatch(baseApi.util.invalidateTags(['Support']))
    if (key.startsWith('Cal:')) dispatch(baseApi.util.invalidateTags(['MeetingsLink']))
  },
})

startListening({
  actionCreator: termsAccepted,
  effect: ({ payload }) => {
    // The tracker records the acceptance itself, once it's allowed to (AnalyticsTracker).
    rememberAcceptance(payload)
  },
})

startListening({
  actionCreator: previewModeChanged,
  effect: ({ payload }) => {
    try {
      if (payload === 'normal') sessionStorage.removeItem(PREVIEW_STORAGE_KEY)
      else sessionStorage.setItem(PREVIEW_STORAGE_KEY, payload)
    } catch {
      // Not remembered, but still on for now.
    }
  },
})

// The preview applies to requests the moment it changes (before anything renders and loads), and
// everything on show loads again under it (dropping what was loaded clears it from every view).
startListening({
  predicate: (_, current, previous) => activePreview(current) !== activePreview(previous),
  effect: (_, api) => {
    setRequestPreview(activePreview(api.getState()))
    api.dispatch(baseApi.util.resetApiState())
  },
})

// Signed out (or the session ended): what only the admin may see goes.
startListening({
  predicate: (_, current, previous) => previous.auth.status === 'authenticated' && current.auth.status !== 'authenticated',
  effect: (_, api) => {
    api.dispatch(baseApi.util.resetApiState())
  },
})

// The admin's other tabs: signed out here, signed out there; signed in here (after Google), they check.
startListening({ actionCreator: signOut.fulfilled, effect: () => tellOtherTabs('signedOut') })

const sessionAnswered = isAnyOf(checkSession.fulfilled, refreshSession.fulfilled)
startListening({
  predicate: (action, state, before) => sessionAnswered(action) && state.auth.status === 'authenticated' && before.auth.status !== 'authenticated',
  effect: () => tellOtherTabs('signedIn'),
})
