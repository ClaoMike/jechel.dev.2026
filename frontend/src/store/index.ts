import { configureStore } from '@reduxjs/toolkit'
import { useDispatch, useSelector } from 'react-redux'
import { siteSlice } from './siteSlice'

/**
 * The app's Redux store (Redux Toolkit). One slice so far, `site`; more state moves here as the app
 * is refactored. `makeStore` gives tests a fresh one each time.
 */
export function makeStore() {
  return configureStore({
    reducer: {
      site: siteSlice.reducer,
    },
  })
}

export type AppStore = ReturnType<typeof makeStore>
export type RootState = ReturnType<AppStore['getState']>
export type AppDispatch = AppStore['dispatch']

/** Typed versions of react-redux's hooks: use these, not the plain ones. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>()
export const useAppSelector = useSelector.withTypes<RootState>()
