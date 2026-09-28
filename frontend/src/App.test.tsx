import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import App from './App'
import { API, server } from './test/server'

describe('App', () => {
  it('shows a loading state, then greets with the first name', async () => {
    render(<App />)

    expect(screen.getByText(/loading/i)).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: "Hi, I'm Claudiu" })).toBeInTheDocument()
  })

  it('shows an error message when the API fails', async () => {
    server.use(http.get(`${API}/firstname`, () => new HttpResponse(null, { status: 500 })))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/something went wrong/i)
  })
})
