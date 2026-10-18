import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { renderApp } from '../test/render'
import { analyticsApi, server, signedIn } from '../test/server'

const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }))
const visitsTable = () => within(screen.getByRole('region', { name: 'Visits table' })).getByRole('table')

async function renderAsAdmin() {
  const api = analyticsApi()
  server.use(signedIn(), ...api.handlers)
  const user = userEvent.setup()
  renderApp('/engagement')
  await screen.findByRole('region', { name: 'Visits table' })
  return { user, ...api }
}

describe('EngagementPage', () => {
  it('is not a tab for visitors, and its URL sends them home', async () => {
    renderApp('/engagement')

    await screen.findByText(/Nothing here yet/)
    expect(tabs().queryByRole('link', { name: 'Engagement' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Engagement' })).not.toBeInTheDocument()
  })

  it('is a tab for the admin, before Community and Terms', async () => {
    await renderAsAdmin()

    expect(screen.getByRole('heading', { level: 2, name: 'Engagement' })).toBeInTheDocument()
    expect(tabs().getByRole('link', { name: 'Engagement' })).toHaveAttribute('aria-current', 'page')
    expect(tabs().getAllByRole('link').map((link) => link.textContent).slice(-3)).toEqual(['Engagement', 'Community', 'Terms'])
  })

  it('shows the headline numbers for the last 30 days', async () => {
    await renderAsAdmin()

    const tile = (label: string) => screen.getByText(label, { selector: 'dt' }).parentElement!
    expect(within(tile('Visitors')).getByText('12')).toBeInTheDocument()
    expect(within(tile('Visits')).getByText('15')).toBeInTheDocument()
    expect(within(tile('Average visit')).getByText('1m 35s')).toBeInTheDocument()
    expect(within(tile('Bounce rate')).getByText('40%')).toBeInTheDocument()
    expect(within(tile('Errors')).getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(screen.getByRole('group', { name: 'Period' })).getAllByRole('button').map((b) => b.textContent)).toEqual([
      '1 hour',
      '1 day',
      '7 days',
      '30 days',
      '90 days',
      '1 year',
      '5 years',
      'All time',
      'Refresh',
    ])
  })

  it('charts a measure per column, switchable, with the numbers in a table', async () => {
    const { user } = await renderAsAdmin()

    const chart = screen.getByRole('region', { name: 'Visitors per day' })
    expect(within(chart).getByRole('img', { name: /^Visitors per day/ })).toBeInTheDocument()
    expect(within(chart).getAllByRole('row')).toHaveLength(31)

    await user.click(within(chart).getByRole('button', { name: 'Errors' }))

    expect(screen.getByRole('heading', { name: 'Errors per day' })).toBeInTheDocument()
    expect(within(chart).getByRole('img', { name: 'Errors per day: 1 in total' })).toBeInTheDocument()
  })

  it('lists the top pages, sources, clicks and errors', async () => {
    await renderAsAdmin()

    expect(within(screen.getByRole('region', { name: 'Top pages' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['/20', '/apps12'])
    expect(within(screen.getByRole('region', { name: 'Where visitors come from' })).getByText('linkedin.com')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Most clicked' })).getByText('Check it on App Store')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Errors' })).getByText('TypeError: boom')).toBeInTheDocument()
  })

  it('shows the theme visits end in, and the switches', async () => {
    await renderAsAdmin()

    expect(within(screen.getByRole('region', { name: 'Preferred theme' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['vice8', 'dark5'])
    expect(within(screen.getByRole('region', { name: 'Theme switches' })).getByText('vice → dark')).toBeInTheDocument()
  })

  it.each([
    ['1 hour', 'Visitors per 5 minutes', 12],
    ['1 day', 'Visitors per hour', 24],
    ['7 days', 'Visitors per day', 7],
    ['1 year', 'Visitors per month', 12],
    ['5 years', 'Visitors per month', 60],
  ])('for %s, charts %s', async (period, heading, columns) => {
    const { user } = await renderAsAdmin()

    await user.click(screen.getByRole('button', { name: period }))

    const chart = await screen.findByRole('region', { name: heading })
    expect(screen.getByRole('button', { name: period })).toHaveAttribute('aria-pressed', 'true')
    expect(within(chart).getAllByRole('row')).toHaveLength(columns + 1)
  })

  it('lists the visits and can keep only those with errors', async () => {
    const { user, requests } = await renderAsAdmin()

    const table = visitsTable()
    expect(within(table).getAllByRole('row')).toHaveLength(3)
    expect(within(table).getByText('mobile · Safari · iOS')).toBeInTheDocument()

    await user.click(screen.getByRole('checkbox', { name: 'Only visits with errors' }))

    await waitFor(() => expect(within(visitsTable()).getAllByRole('row')).toHaveLength(2))
    expect(requests.at(-1)?.get('errorsOnly')).toBe('true')
  })

  it('replays a visit step by step, with the error and steps to copy', async () => {
    const { user } = await renderAsAdmin()

    await user.click(within(visitsTable()).getAllByRole('button')[0])

    const dialog = await screen.findByRole('dialog', { name: /^Visit on/ })
    const steps = within(await within(dialog).findByRole('list', { name: 'What happened' })).getAllByRole('listitem')
    expect(steps.map((step) => step.querySelector('.visit-step-text')?.textContent)).toEqual(['Opened /', 'Clicked “Apps” (/apps)', 'Opened /apps', 'ERROR: TypeError: boom'])
    expect(steps[3]).toHaveTextContent('+0:09')
    expect(within(dialog).getByText('mobile · Safari · iOS')).toBeInTheDocument()
    expect(within(dialog).getByText('vice → dark')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Copy steps to reproduce' })).toBeInTheDocument()
  })

  it('deletes a visit after asking', async () => {
    const { user, deleted } = await renderAsAdmin()
    await user.click(within(visitsTable()).getAllByRole('button')[0])
    const dialog = await screen.findByRole('dialog', { name: /^Visit on/ })

    await user.click(await within(dialog).findByRole('button', { name: 'Delete visit' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Delete this visit?' })).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleted).toEqual(['visit-error'])
    await waitFor(() => expect(within(visitsTable()).getAllByRole('row')).toHaveLength(2))
  })
})
