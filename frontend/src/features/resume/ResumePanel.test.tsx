import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ResumeSettings } from '../../services/api'
import { renderApp } from '../../test/render'
import { aboutApi, API, resumeSettings, server, signedIn } from '../../test/server'

async function openPanel() {
  const user = userEvent.setup()
  renderApp('/about')
  await user.click(await screen.findByText('Résumé generator'))
  const panel = within(screen.getByText('Résumé generator').closest('details')!)
  await panel.findByLabelText('Phone (private)')
  return { user, panel }
}

describe('Résumé generator', () => {
  it("isn't there for visitors", async () => {
    renderApp('/about')

    await screen.findByRole('region', { name: 'Skills' })
    expect(screen.queryByText('Résumé generator')).not.toBeInTheDocument()
  })

  it('generates with the chosen sections, then offers both copies', async () => {
    const sent: ResumeSettings[] = []
    const about = aboutApi()
    server.use(
      signedIn(),
      ...about.handlers,
      http.post(`${API}/api/resume/generate`, async ({ request }) => {
        const body = (await request.json()) as ResumeSettings
        sent.push(body)
        return HttpResponse.json({ ...body, generatedAt: '2026-10-18T12:00:00Z' })
      }),
    )
    const { user, panel } = await openPanel()

    await user.type(panel.getByLabelText('Phone (private)'), '+44 7700 900123')
    await user.click(panel.getByLabelText('Languages'))
    await user.click(panel.getByLabelText("Where I've been (as a list)"))
    await user.click(panel.getByRole('button', { name: 'Generate résumés' }))

    expect(await panel.findByRole('status')).toHaveTextContent('Both résumés are ready')
    expect(sent[0].phone).toBe('+44 7700 900123')
    expect(sent[0].sections).not.toContain('languages')
    expect(sent[0].sections).toContain('places')
    const version = `?v=${Date.parse('2026-10-18T12:00:00Z')}`
    expect(panel.getByRole('link', { name: 'Download with phone' })).toHaveAttribute('href', `${API}/api/resume/private${version}`)
    expect(panel.getByRole('link', { name: 'Download public copy' })).toHaveAttribute('href', `${API}/api/resume${version}`)
  })

  it('shows the API errors next to the fields', async () => {
    server.use(
      signedIn(),
      http.get(`${API}/api/resume/settings`, () => HttpResponse.json({ ...resumeSettings(), phone: '0123' })),
      http.post(`${API}/api/resume/generate`, () => HttpResponse.json({ status: 400, errors: { phone: ['Use digits.'] } }, { status: 400 })),
    )
    const { user, panel } = await openPanel()

    expect(panel.getByLabelText('Phone (private)')).toHaveValue('0123')
    await user.click(panel.getByRole('button', { name: 'Generate résumés' }))

    expect(await panel.findByText('Use digits.')).toBeInTheDocument()
    expect(panel.getByRole('status')).toHaveTextContent('Fix the fields marked below.')
  })
})
