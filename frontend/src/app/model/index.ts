import { configureStore, type ThunkAction, type UnknownAction } from '@reduxjs/toolkit'
import { authSlice } from '@/entities/session'
import { baseApi } from '@/shared/api'
import { listeners } from './listeners'
import { previewSlice } from '@/features/preview'
import { siteSlice } from '@/entities/site'
import { termsSlice } from '@/entities/terms-of-use'
import { themeSlice } from '@/features/theme'

/**
 * The app's Redux store (Redux Toolkit): what the server holds is in
 * `serverData` (RTK Query: each slice's api/ segment); the rest are slices of the app's own state: the session,
 * what visitors may see, the terms, the theme, the admin's preview switch. Side effects of changes
 * (storage, the page's theme, requests) are in listeners.ts.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      [baseApi.reducerPath]: baseApi.reducer,
      auth: authSlice.reducer,
      site: siteSlice.reducer,
      terms: termsSlice.reducer,
      theme: themeSlice.reducer,
      preview: previewSlice.reducer,
    },
    middleware: (getDefault) => getDefault().prepend(listeners.middleware).concat(baseApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>

// The store's types, for every layer below (slices, selectors, thunks and the typed hooks in shared/lib/store) without
// importing the app: they only describe it.
declare global {
  type RootState = ReturnType<AppStore['getState']>
  type AppDispatch = AppStore['dispatch']
  type AppThunk<Result = void> = ThunkAction<Result, RootState, unknown, UnknownAction>
}
