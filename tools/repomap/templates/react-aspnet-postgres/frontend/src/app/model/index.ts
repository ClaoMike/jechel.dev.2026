import { configureStore, type ThunkAction, type UnknownAction } from '@reduxjs/toolkit'
import { baseApi } from '@/shared/api'

/** The app's Redux store: what the server holds is in `serverData` (RTK Query, each slice's api/ segment). */
export function makeStore() {
  return configureStore({
    reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: (getDefault) => getDefault().concat(baseApi.middleware),
  })
}

export type AppStore = ReturnType<typeof makeStore>

// The store's types, for every layer below (slices, selectors and the typed hooks in shared/lib/store) without
// importing the app: they only describe it.
declare global {
  type RootState = ReturnType<AppStore['getState']>
  type AppDispatch = AppStore['dispatch']
  type AppThunk<Result = void> = ThunkAction<Result, RootState, unknown, UnknownAction>
}
