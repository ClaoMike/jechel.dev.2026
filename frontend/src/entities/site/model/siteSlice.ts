import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api, ApiError, type SaveSiteRequest, type SiteStatus } from '@/shared/api'

/**
 * What visitors may see (pages, features) and whether the site is under maintenance, from /api/site.
 * "unreachable" when the API can't be asked (down, or answering with errors): visitors then get the
 * maintenance screen too, and it's tried again every so often.
 */
export type SiteState = { status: 'loading' } | { status: 'loaded'; site: SiteStatus } | { status: 'unreachable' }

export const fetchSite = createAsyncThunk('site/fetch', async (_: void, { signal, rejectWithValue }) => {
  try {
    return await api.site.status(signal)
  } catch (error) {
    // 4xx would be a bug, not an outage: still treated as unreachable, so visitors aren't shown a broken site.
    return rejectWithValue(error instanceof ApiError ? error.status : 0)
  }
})

/** Admin only: saves changes and shows what the API stored. */
export const saveSite = createAsyncThunk('site/save', (changes: SaveSiteRequest) => api.site.save(changes))

const initialState = { status: 'loading' } as SiteState

export const siteSlice = createSlice({
  name: 'site',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchSite.fulfilled, (_, action) => ({ status: 'loaded', site: action.payload }))
      .addCase(fetchSite.rejected, (state, action) =>
        // A cancelled request (leaving, StrictMode's second run) changes nothing.
        action.meta.aborted ? state : { status: 'unreachable' },
      )
      .addCase(saveSite.fulfilled, (_, action) => ({ status: 'loaded', site: action.payload }))
  },
})
