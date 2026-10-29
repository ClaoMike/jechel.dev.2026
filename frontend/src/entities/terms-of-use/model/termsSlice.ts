import { createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { acceptedVersion } from '../lib/acceptance'

/** The terms themselves are server data (entities/terms-of-use/api/termsApi); this is what this browser did with them. */
export interface TermsState {
  /** The terms are open in a popup, on top of anything else that's open. */
  dialogOpen: boolean
  /** The version this browser accepted (remembered by the store's listener), or null. */
  accepted: string | null
}

export const termsSlice = createSlice({
  name: 'terms',
  initialState: (): TermsState => ({ dialogOpen: false, accepted: acceptedVersion() }),
  reducers: {
    termsOpened(state) {
      state.dialogOpen = true
    },
    termsClosed(state) {
      state.dialogOpen = false
    },
    termsAccepted(state, action: PayloadAction<string>) {
      state.accepted = action.payload
    },
  },
})

export const { termsOpened, termsClosed, termsAccepted } = termsSlice.actions
