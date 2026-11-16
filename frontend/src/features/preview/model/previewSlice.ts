import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import type { RequestPreview } from '@/shared/api'

/**
 * The admin's preview switch: see the whole site as it looks while loading, or when loading fails.
 * It works where every request goes through (shared/api/api.ts): "loading" holds content requests
 * until the switch changes, "error" fails them with a 500. Sign-in and saving are never touched.
 * Remembered for this tab (the store's listener), and only applied while signed in.
 * Development only (`npm run dev`): a production build never shows the switch or applies a mode.
 */
export type PreviewMode = RequestPreview

export const PREVIEW_MODES: readonly PreviewMode[] = ['normal', 'loading', 'error']

export const PREVIEW_STORAGE_KEY = 'preview.mode'

/** True in development (Vite's dev server), false in a production build. */
export const PREVIEW_AVAILABLE = import.meta.env.DEV

function storedMode(): PreviewMode {
  try {
    const stored = sessionStorage.getItem(PREVIEW_STORAGE_KEY)
    return PREVIEW_MODES.includes(stored as PreviewMode) ? (stored as PreviewMode) : 'normal'
  } catch {
    return 'normal'
  }
}

export const previewSlice = createSlice({
  name: 'preview',
  initialState: () => ({ mode: storedMode() }),
  reducers: {
    previewModeChanged(state, action: PayloadAction<PreviewMode>) {
      state.mode = action.payload
    },
  },
})

export const { previewModeChanged } = previewSlice.actions

/** The preview that applies: the admin's switch, only while signed in, and only in development. */
export const activePreview = (state: { auth: { status: string }; preview: { mode: PreviewMode } }): PreviewMode =>
  PREVIEW_AVAILABLE && state.auth.status === 'authenticated' ? state.preview.mode : 'normal'
