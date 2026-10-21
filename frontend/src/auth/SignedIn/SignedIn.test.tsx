import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { Provider } from 'react-redux'
import { render } from 'vitest-browser-react'
import { makeStore } from '../../store'
import { checkSession } from '../../store/authSlice'
import { ADMIN } from '../../test/render'
import { SignedIn, SignedOut } from './SignedIn'

/** Both, in a store whose session is loading, signed in or signed out. */
async function show(session: 'loading' | 'admin' | 'visitor') {
  const store = makeStore()
  if (session !== 'loading') store.dispatch(checkSession.fulfilled(session === 'admin' ? ADMIN : null, 'test'))
  await render(
    <Provider store={store}>
      <SignedIn>admin only</SignedIn>
      <SignedIn>{(user) => `hello ${user.email}`}</SignedIn>
      <SignedOut>visitors only</SignedOut>
    </Provider>,
  )
  return document.body.textContent ?? ''
}

describe('<SignedIn> and <SignedOut>', () => {
  it('show the admin their part, given the user if asked', async () => {
    const text = await show('admin')
    expect(text).toContain('admin only')
    expect(text).toContain('hello admin@example.com')
    expect(text).not.toContain('visitors only')
  })

  it("show visitors theirs", async () => {
    const text = await show('visitor')
    expect(text).toContain('visitors only')
    expect(text).not.toContain('admin only')
  })

  it("show neither while it isn't known yet, so nothing flashes", async () => {
    await show('loading')
    expect(page.getByText(/only|hello/).query()).toBeNull()
  })
})
