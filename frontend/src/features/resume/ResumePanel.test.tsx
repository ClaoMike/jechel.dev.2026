import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'
import type { ResumeChoices } from '../../services/api'
import { renderApp } from '../../test/render'
import { aboutApi, API, resumeSettings, server, signedIn } from '../../test/server'

async function openPanel() {
  const user = userEvent.setup()
  renderApp('/about')
  await user.click(await screen.findByText('Résumé generator'))
  const panel = within(screen.getByText('Résumé generator').closest('details')!)
  await panel.findByRole('group', { name: 'Sections to include' })
  return { user, panel }
}

function generating() {
  const sent: ResumeChoices[] = []
  const handler = http.post(`${API}/api/resume/generate`, async ({ request }) => {
    const body = (await request.json()) as ResumeChoices
    sent.push(body)
    return HttpResponse.json({ ...resumeSettings(), ...body, generatedAt: '2026-10-18T12:00:00Z' })
  })
  return { sent, handler }
}

describe('Résumé generator', () => {
  it("isn't there for visitors", async () => {
    renderApp('/about')

    await screen.findByRole('region', { name: 'Skills' })
    expect(screen.queryByText('Résumé generator')).not.toBeInTheDocument()
  })

  it('generates with the chosen sections, then offers the private and public copies', async () => {
    const { sent, handler } = generating()
    server.use(signedIn(), ...aboutApi().handlers, handler)
    const { user, panel } = await openPanel()

    expect(panel.queryByLabelText(/Phone/)).not.toBeInTheDocument()
    await user.click(panel.getByLabelText('Languages'))
    await user.click(panel.getByLabelText("Where I've been (as a list)"))
    await user.click(panel.getByRole('button', { name: 'Generate résumés' }))

    expect(await panel.findByRole('status')).toHaveTextContent('Both résumés are ready')
    expect(sent[0].sections).not.toContain('languages')
    expect(sent[0].sections).toContain('places')
    const version = `?v=${Date.parse('2026-10-18T12:00:00Z')}`
    expect(panel.getByRole('link', { name: 'Download private copy' })).toHaveAttribute('href', `${API}/api/resume/private${version}`)
    expect(panel.getByRole('link', { name: 'Download public copy' })).toHaveAttribute('href', `${API}/api/resume${version}`)
    expect(panel.queryByRole('link', { name: /Preview/ })).not.toBeInTheDocument()
  })

  it('leaves out the skills that are unticked', async () => {
    const { sent, handler } = generating()
    server.use(signedIn(), handler)
    const { user, panel } = await openPanel()

    const skills = within(panel.getByRole('group', { name: 'Skills to show' }))
    expect(skills.getByLabelText('C#')).toBeChecked()
    await user.click(skills.getByLabelText('Python'))
    await user.click(panel.getByRole('button', { name: 'Generate résumés' }))

    await panel.findByText(/Both résumés are ready/)
    expect(sent[0].excludedSkills).toEqual(['Python'])
  })

  it('says when generating failed', async () => {
    server.use(signedIn(), http.post(`${API}/api/resume/generate`, () => new HttpResponse(null, { status: 500 })))
    const { user, panel } = await openPanel()

    await user.click(panel.getByRole('button', { name: 'Generate résumés' }))

    expect(await panel.findByRole('status')).toHaveTextContent("couldn't be generated")
  })
})
