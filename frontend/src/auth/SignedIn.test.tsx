import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { server, signedIn } from '../test/server'
import { AuthProvider, SignedIn, SignedOut, useAuth } from '.'

function Probe() {
  const { status, isLoading, isAuthenticated, user } = useAuth()
  return <p data-testid="probe">{JSON.stringify({ status, isLoading, isAuthenticated, email: user?.email ?? null })}</p>
}

function renderWithAuth() {
  return render(
    <AuthProvider>
      <Probe />
      <SignedIn>
        <p>members only</p>
      </SignedIn>
      <SignedIn>{(user) => <p>hello {user.email}</p>}</SignedIn>
      <SignedOut>
        <p>visitors only</p>
      </SignedOut>
    </AuthProvider>,
  )
}

const probe = () => JSON.parse(screen.getByTestId('probe').textContent!)

describe('auth state', () => {
  it('shows neither while the session check is loading', () => {
    renderWithAuth()

    expect(probe()).toEqual({ status: 'loading', isLoading: true, isAuthenticated: false, email: null })
    expect(screen.queryByText('members only')).not.toBeInTheDocument()
    expect(screen.queryByText('visitors only')).not.toBeInTheDocument()
  })

  it('shows <SignedOut> content to anonymous visitors', async () => {
    renderWithAuth()

    expect(await screen.findByText('visitors only')).toBeInTheDocument()
    expect(screen.queryByText('members only')).not.toBeInTheDocument()
    expect(probe()).toEqual({ status: 'anonymous', isLoading: false, isAuthenticated: false, email: null })
  })

  it('shows <SignedIn> content, with the user, to the signed-in admin', async () => {
    server.use(signedIn())
    renderWithAuth()

    expect(await screen.findByText('members only')).toBeInTheDocument()
    expect(screen.getByText('hello admin@example.com')).toBeInTheDocument()
    expect(screen.queryByText('visitors only')).not.toBeInTheDocument()
    expect(probe()).toEqual({
      status: 'authenticated',
      isLoading: false,
      isAuthenticated: true,
      email: 'admin@example.com',
    })
  })

  it('useAuth throws outside <AuthProvider>', () => {
    expect(() => render(<Probe />)).toThrow('useAuth must be used inside <AuthProvider>')
  })
})
