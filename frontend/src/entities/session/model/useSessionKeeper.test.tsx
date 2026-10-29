import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'
import { api, ApiError, type CurrentUser } from '@/shared/api'
import { makeStore, type AppStore } from '@/test/store'
import { signOut } from './authSlice'
import { forever } from '@/test/render'
import { AUTH_CHANNEL } from '../lib/authChannel'
import { ACTIVITY_REFRESH_MS } from './useSessionKeeper'
import { useAuth } from './useAuth'
import { useSessionKeeper } from './useSessionKeeper'

const ADMIN: CurrentUser = { email: 'admin@example.com', name: 'Admin', pictureUrl: null, sessionExpiresInSeconds: 600 }

/** What the app does (App keeps the session), showing the session's state. */
function Keeper() {
  useSessionKeeper()
  const { status } = useAuth()
  return <p data-testid="auth">{status}</p>
}

const status = () => page.getByTestId('auth').element().textContent

async function open(store: AppStore = makeStore()) {
  await render(
    <Provider store={store}>
      <Keeper />
    </Provider>,
  )
  return store
}

/** Another tab of this browser. */
function otherTab() {
  const channel = new BroadcastChannel(AUTH_CHANNEL)
  const heard: unknown[] = []
  channel.onmessage = (event) => heard.push(event.data)
  return { say: (message: string) => channel.postMessage(message), heard, close: () => channel.close() }
}

describe('keeping the session', () => {
  let me: MockInstance<typeof api.auth.me>

  beforeEach(() => {
    me = vi.spyOn(api.auth, 'me').mockResolvedValue(ADMIN)
  })

  afterEach(() => vi.useRealTimers())

  it('asks who is signed in when the page opens', async () => {
    await open()
    await expect.poll(status).toBe('authenticated')
    expect(me).toHaveBeenCalledTimes(1)
  })

  it('is signed out when the API says so', async () => {
    me.mockResolvedValue(null)
    await open()
    await expect.poll(status).toBe('anonymous')
  })

  it("keeps waiting, and asks again, when there's no answer (the API restarting): it isn't signed out", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    me.mockRejectedValueOnce(new ApiError('/api/auth/me', 0)).mockRejectedValueOnce(new ApiError('/api/auth/me', 503))
    await open()
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(1))
    expect(status()).toBe('loading')

    await vi.advanceTimersByTimeAsync(2_000)
    expect(me).toHaveBeenCalledTimes(2)
    expect(status()).toBe('loading')
    await vi.advanceTimersByTimeAsync(4_000)

    await vi.waitFor(() => expect(status()).toBe('authenticated'))
    expect(me).toHaveBeenCalledTimes(3)
  })

  it('stops asking when the page goes away while it waits to ask again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    me.mockRejectedValue(new ApiError('/api/auth/me', 0))
    const screen = await render(
      <Provider store={makeStore()}>
        <Keeper />
      </Provider>,
    )
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(1))

    await screen.unmount()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(me).toHaveBeenCalledTimes(1)
  })

  it('stops, without asking again, when the page goes away while the first check is under way', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    me.mockImplementation((signal) => new Promise((_, reject) => signal?.addEventListener('abort', () => reject(new Error('cancelled')))))
    const screen = await render(
      <Provider store={makeStore()}>
        <Keeper />
      </Provider>,
    )
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(1))

    await screen.unmount()
    await vi.advanceTimersByTimeAsync(60_000)

    expect(me).toHaveBeenCalledTimes(1)
  })

  it('turns activity into a check (which extends the session) at most once a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await open()
    await expect.poll(status).toBe('authenticated')

    await userEvent.keyboard('a')
    expect(me).toHaveBeenCalledTimes(1)

    vi.setSystemTime(Date.now() + ACTIVITY_REFRESH_MS)
    await userEvent.keyboard('a')
    await userEvent.keyboard('a')
    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(2))
  })

  it('shows the session over once it ends without activity', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    me.mockResolvedValueOnce({ ...ADMIN, sessionExpiresInSeconds: 30 }).mockResolvedValue(null)
    await open()
    await vi.waitFor(() => expect(status()).toBe('authenticated'))

    await vi.advanceTimersByTimeAsync(31_000)
    expect(status()).toBe('authenticated')
    await vi.advanceTimersByTimeAsync(1_000)

    await vi.waitFor(() => expect(status()).toBe('anonymous'))
  })

  it("keeps a session another tab's activity extended", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    me.mockResolvedValueOnce({ ...ADMIN, sessionExpiresInSeconds: 30 }).mockResolvedValue(ADMIN)
    await open()
    await vi.waitFor(() => expect(status()).toBe('authenticated'))

    await vi.advanceTimersByTimeAsync(32_000)

    await vi.waitFor(() => expect(me).toHaveBeenCalledTimes(2))
    expect(status()).toBe('authenticated')
  })

  describe("this browser's other tabs", () => {
    it('signs out here when another tab signs out, without asking the API', async () => {
      const tab = otherTab()
      try {
        await open()
        await expect.poll(status).toBe('authenticated')

        tab.say('signedOut')

        await expect.poll(status).toBe('anonymous')
        expect(me).toHaveBeenCalledTimes(1)
      } finally {
        tab.close()
      }
    })

    it('checks when another tab signs in, and shows it signed in', async () => {
      const tab = otherTab()
      try {
        me.mockResolvedValueOnce(null)
        await open()
        await expect.poll(status).toBe('anonymous')

        tab.say('signedIn')

        await expect.poll(status).toBe('authenticated')
        expect(me).toHaveBeenCalledTimes(2)
      } finally {
        tab.close()
      }
    })

    it("doesn't ask again when it's already signed in, or for messages it doesn't know", async () => {
      const tab = otherTab()
      try {
        await open()
        await expect.poll(status).toBe('authenticated')

        tab.say('signedIn')
        tab.say('something else')
        await new Promise((r) => setTimeout(r, 100))

        expect(me).toHaveBeenCalledTimes(1)
        expect(status()).toBe('authenticated')
      } finally {
        tab.close()
      }
    })

    it('tells the other tabs when this one signs in, and when it signs out', async () => {
      const tab = otherTab()
      try {
        vi.spyOn(api.auth, 'logout').mockResolvedValue()
        const store = await open()
        await expect.poll(status).toBe('authenticated')
        await expect.poll(() => tab.heard).toEqual(['signedIn'])

        await store.dispatch(signOut())

        await expect.poll(() => tab.heard).toEqual(['signedIn', 'signedOut'])
        expect(status()).toBe('anonymous')
      } finally {
        tab.close()
      }
    })

    it("doesn't tell them about a check that changes nothing", async () => {
      const tab = otherTab()
      try {
        me.mockReturnValueOnce(forever())
        await open()
        await new Promise((r) => setTimeout(r, 100))
        expect(tab.heard).toEqual([])
      } finally {
        tab.close()
      }
    })
  })
})
