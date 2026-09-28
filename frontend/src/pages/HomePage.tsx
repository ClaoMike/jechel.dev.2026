import { useEffect, useState } from 'react'
import { getFirstName } from '../api/profile'
import { useAuth } from '../auth/useAuth'

type State =
  | { status: 'loading' }
  | { status: 'success'; firstName: string }
  | { status: 'error' }

export function HomePage() {
  const { state: auth, signOut } = useAuth()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    const controller = new AbortController()

    getFirstName(controller.signal)
      .then((firstName) => setState({ status: 'success', firstName }))
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'error' })
      })

    return () => controller.abort()
  }, [])

  return (
    <>
      {auth.status === 'authenticated' && (
        <div className="session-bar">
          <span>Signed in as {auth.user.email}</span>
          <button type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      )}
      <main>
        {state.status === 'loading' && <p>Loading…</p>}
        {state.status === 'error' && <p role="alert">Something went wrong. Please try again later.</p>}
        {state.status === 'success' && <h1>Hi, I'm {state.firstName}</h1>}
      </main>
    </>
  )
}
