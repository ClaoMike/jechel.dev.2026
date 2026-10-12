import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { server, signedIn, termsApi } from '../test/server'

const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }))

async function renderAsAdmin() {
  const api = termsApi()
  server.use(signedIn(), ...api.handlers)
  const user = userEvent.setup()
  renderApp('/terms')
  await screen.findByRole('button', { name: 'Edit the terms' })
  return { user, saved: api.saved }
}

describe('The footer', () => {
  it('opens the terms in a popup', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(within(screen.getByRole('contentinfo')).getByRole('button', { name: 'Terms and Conditions' }))

    const dialog = screen.getByRole('dialog', { name: 'Terms and Conditions' })
    expect(within(dialog).getByText('Please read these terms.')).toBeInTheDocument()
    await user.click(within(dialog).getAllByRole('button', { name: 'Close' })[0])
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('TermsPage', () => {
  it('is not a tab for visitors', async () => {
    renderApp('/')

    await screen.findByText(/Nothing here yet/)
    expect(tabs().queryByRole('link', { name: 'Terms' })).not.toBeInTheDocument()
  })

  it('is the last tab for the admin', async () => {
    server.use(signedIn())
    renderApp('/')

    await tabs().findByRole('link', { name: 'Terms' })
    expect(tabs().getAllByRole('link').at(-1)).toHaveTextContent('Terms')
  })

  it('shows the terms as a document with numbered sections, paragraphs and bullet points', async () => {
    await renderAsAdmin()

    expect(screen.getByRole('heading', { level: 2, name: 'Terms and Conditions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '1. Using the website' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3, name: '2. Changes' })).toBeInTheDocument()
    expect(screen.getByText('You may browse the website.')).toBeInTheDocument()
    expect(within(screen.getByRole('list')).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Be kind', 'No spam'])
  })

  it('lets the admin add a section with a paragraph and a bullet list, and saves it', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit the terms' }))
    await user.click(screen.getByRole('button', { name: 'Add section' }))
    const section = within(screen.getByRole('group', { name: 'Section 3' }))
    await user.type(section.getByLabelText(/Heading/), 'Contact')
    await user.type(section.getByLabelText('Text of paragraph 1'), 'Write to me.')
    await user.click(section.getByRole('button', { name: 'Add bullet list' }))
    await user.type(section.getByLabelText('Bullet point 1'), 'By email')
    await user.click(section.getByRole('button', { name: 'Add bullet point' }))
    await user.type(section.getByLabelText('Bullet point 2'), 'By the contact form')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 3, name: '3. Contact' })).toBeInTheDocument()
    expect(screen.getByText('By the contact form')).toBeInTheDocument()
    expect(screen.getByText(/Last updated/)).toBeInTheDocument()
    expect(saved[0].sections[2]).toEqual({
      heading: 'Contact',
      blocks: [
        { kind: 'paragraph', text: 'Write to me.', items: [] },
        { kind: 'bullets', text: '', items: ['By email', 'By the contact form'] },
      ],
    })
  })

  it('moves and removes sections', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit the terms' }))
    await user.click(screen.getByRole('button', { name: 'Move section 2 up' }))
    await user.click(screen.getByRole('button', { name: 'Remove section 2' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Remove' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('heading', { level: 3, name: '1. Changes' })).toBeInTheDocument()
    expect(saved[0].sections.map((s) => s.heading)).toEqual(['Changes'])
  })

  it('shows field errors from the API and keeps the form open', async () => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit the terms' }))
    await user.clear(screen.getByLabelText(/^Title/))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Required.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Some fields need fixing')
  })

  it('cancel leaves the terms as they were', async () => {
    const { user, saved } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: 'Edit the terms' }))
    await user.click(screen.getByRole('button', { name: 'Add section' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByRole('heading', { level: 3, name: /^3\./ })).not.toBeInTheDocument()
    expect(saved).toEqual([])
  })
})
