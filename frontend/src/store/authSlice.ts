import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { api, type CurrentUser } from '../services/api'

export type AuthStatus = 'loading' | 'anonymous' | 'authenticated'

export type AuthState = { status: 'loading' } | { status: 'anonymous' } | { status: 'authenticated'; user: CurrentUser }

/**
 * When the first check fails without an answer (the API down, restarting, a network error), how long
 * to wait before each new try: the session is still there, so this isn't "signed out".
 */
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000] as const

/** When the session was last asked about (ms): each ask counts as activity and extends it. Outside the store, it's no one's to show. */
let lastCheckedAt = 0
export const sessionCheckedAt = () => lastCheckedAt

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      window.clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

/**
 * The first check, when the page opens. Only the API's answer decides: signed in, or not (401).
 * Without one it stays "loading" and asks again, so a restart of the API (or a moment offline)
 * doesn't sign the admin out of the page.
 */
export const checkSession = createAsyncThunk('auth/check', async (_: void, { signal }) => {
  for (let attempt = 0; ; attempt++) {
    lastCheckedAt = Date.now()
    try {
      return await api.auth.me(signal)
    } catch (error) {
      if (signal.aborted) throw error
      await wait(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)], signal)
    }
  }
})

/** Asks again (activity, or when the session should have ended). A network hiccup keeps the current state. */
export const refreshSession = createAsyncThunk('auth/refresh', () => {
  lastCheckedAt = Date.now()
  return api.auth.me()
})

/** Signs out this device (others stay signed in; Settings → Signed-in devices ends them). */
export const signOut = createAsyncThunk('auth/signOut', () => api.auth.logout())

const toState = (user: CurrentUser | null): AuthState => (user ? { status: 'authenticated', user } : { status: 'anonymous' })

export const authSlice = createSlice({
  name: 'auth',
  initialState: { status: 'loading' } as AuthState,
  reducers: {
    /** Another tab of this browser signed out: the session it shared with this one is over. */
    signedOutElsewhere: (): AuthState => ({ status: 'anonymous' }),
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkSession.fulfilled, (_, action) => toState(action.payload))
      .addCase(refreshSession.fulfilled, (_, action) => toState(action.payload))
      .addCase(signOut.fulfilled, () => ({ status: 'anonymous' }))
  },
})

export const { signedOutElsewhere } = authSlice.actions
