import { configureStore, type ThunkAction, type UnknownAction } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { authSlice } from './authSlice'
import { baseApi } from './baseApi'
import { listeners } from './listeners'
import { previewSlice } from './previewSlice'
import { siteSlice } from './siteSlice'
import { termsSlice } from './termsSlice'
import { themeSlice } from './themeSlice'

/**
 * The app's Redux store (Redux Toolkit): the Model of the views' MVVM. What the server holds is in
 * `serverData` (RTK Query, store/api/); the rest are slices of the app's own state: the session,
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
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']
export type AppThunk<Result = void> = ThunkAction<Result, RootState, unknown, UnknownAction>

/** Typed versions of react-redux's hooks: use these, not the plain ones. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
