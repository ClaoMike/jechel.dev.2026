import { useEffect, useState } from 'react'
import { SignedIn, useAuth } from '../auth'
import { api } from '../services/api'

type State =
  | { status: 'loading' }
  | { status: 'success'; firstName: string }
  | { status: 'error' }

export function HomePage() {
  const { signOut } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    api.profile
      .getFirstName(controller.signal)
      .then((firstName) => setState({ status: 'success', firstName }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [])

  return (
    <>
      <SignedIn>
        {(user) => (
          <div className="session-bar">
            <span>Signed in as {user.email}</span>
            <button type="button" onClick={() => void signOut()}>
              Sign out
            </button>
          </div>
        )}
      </SignedIn>
      <main>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'error' && <p role="alert">Something went wrong. Please try again later.</p>}
        {state.status === 'success' && <h1>Hi, I'm {state.firstName}</h1>}
      </main>
    </>
  )
}
