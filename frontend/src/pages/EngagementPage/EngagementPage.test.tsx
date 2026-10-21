import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, type AnalyticsRange } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi } from '../../test/api'
import { EMPTY_SUMMARY, pageOfVisits, SUMMARY, VISIT, VISIT_ID, VISIT_SUMMARY } from '../../test/fixtures/analytics'
import { ADMIN, forever, renderApp, renderView, textOf } from '../../test/render'
import { EngagementPage } from './EngagementPage'

// The admin's Engagement tab over the real store, its API calls stubbed.

let calls: {
  summary: MockInstance<typeof api.analytics.summary>
  list: MockInstance<typeof api.analytics.listSessions>
  visit: MockInstance<typeof api.analytics.getSession>
  remove: MockInstance<typeof api.analytics.deleteSession>
}

beforeEach(() => {
  stubApi({ user: ADMIN })
  calls = {
    summary: vi.spyOn(api.analytics, 'summary').mockImplementation(async (range) => ({ ...structuredClone(SUMMARY), range })),
    list: vi.spyOn(api.analytics, 'listSessions').mockResolvedValue(pageOfVisits()),
    visit: vi.spyOn(api.analytics, 'getSession').mockResolvedValue(structuredClone(VISIT)),
    remove: vi.spyOn(api.analytics, 'deleteSession').mockResolvedValue(),
  }
})

const renderEngagement = () => renderView(<EngagementPage />, { path: '/engagement', user: ADMIN })
const list = (title: string) => page.getByRole('region', { name: title })
const rows = (title: string) =>
  list(title)
    .getByRole('listitem')
    .elements()
    .map((li) => `${li.querySelector('.ranked-name')!.textContent} ${li.querySelector('.ranked-count')!.textContent}`)
const tile = (label: string) => [...document.querySelectorAll('.stat-tile')].find((t) => t.querySelector('dt')?.textContent === label)?.querySelector('dd')?.textContent
const dialog = () => page.getByRole('dialog', { name: /^Visit on/ })
const timeline = () => dialog().getByRole('list', { name: 'What happened' })

describe('who sees it', () => {
  it('sends visitors who open the address home', async () => {
    stubApi()
    await renderApp({ path: '/engagement' })
    await expect.element(page.getByRole('heading', { name: 'Engagement' })).not.toBeInTheDocument()
    expect(location.pathname).not.toBe('/engagement')
    expect(calls.summary).not.toHaveBeenCalled()
  })
})

describe('the numbers', () => {
  it('shows the last 30 days first, with the headline numbers', async () => {
    await renderEngagement()
    await expect.poll(() => tile('Visitors')).toBe('42Unique per day')
    expect(calls.summary).toHaveBeenCalledWith('30d', expect.anything())
    expect(tile('Visits')).toBe('57A tab, from opening to closing')
    expect(tile('Page views')).toBe('1713.0 per visit')
    expect(tile('Average visit')).toBe('1m 35sFirst to last action')
    expect(tile('Bounce rate')).toBe('35%One page, then gone')
    expect(tile('Errors')).toBe('3See the visits below')
    expect(document.querySelector('.stat-tile-alert dt')?.textContent).toBe('Errors')
  })

  it('switches the period, every one of them', async () => {
    await renderEngagement()
    const ranges: [string, AnalyticsRange][] = [
      ['1 hour', '1h'],
      ['1 day', '24h'],
      ['7 days', '7d'],
      ['90 days', '90d'],
      ['1 year', '1y'],
      ['5 years', '5y'],
      ['All time', 'all'],
    ]
    for (const [label, range] of ranges) {
      await page.getByRole('group', { name: 'Period' }).getByRole('button', { name: label }).click()
      await expect.element(page.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true')
      expect(calls.summary).toHaveBeenLastCalledWith(range, expect.anything())
    }
    // A period seen a moment ago shows at once, from the store.
    const asked = calls.summary.mock.calls.length
    await page.getByRole('button', { name: '30 days' }).click()
    await expect.element(page.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')
    expect(calls.summary.mock.calls.length).toBe(asked)
  })

  it('lists where visits come from, what they did, and where they are (countries by name)', async () => {
    await renderEngagement()
    await expect.element(list('Top pages')).toBeVisible()
    expect(rows('Top pages')).toEqual(['/ 60', '/apps 41', '/about 30'])
    expect(rows('Where visitors come from')).toEqual(['Direct 30', 'github.com 12'])
    expect(rows('Most clicked')).toEqual(['Apps 25'])
    expect(rows('What visitors did')).toEqual(['Message sent 4', 'Subscribed 2'])
    expect(rows('Errors')).toEqual(['GET /api/youtube/videos failed (503) 3'])
    expect(rows('Preferred theme')).toEqual(['vice 40', 'dark 17'])
    expect(rows('Theme switches')).toEqual(['vice → dark 9'])
    expect(rows('Devices')).toEqual(['desktop 40', 'mobile 17'])
    expect(rows('Browsers')).toEqual(['Chrome 35', 'Safari 22'])
    expect(rows('Countries')).toEqual(['United Kingdom 30', 'Romania 20', 'Unknown 7'])
    expect(rows('Time zones')).toEqual(['Europe/London 30'])
  })

  it('says so when there is nothing yet', async () => {
    calls.summary.mockResolvedValue(structuredClone(EMPTY_SUMMARY))
    await renderEngagement()
    await expect.element(list('Errors').getByText('No errors. 🎉')).toBeVisible()
    await expect.element(list('Theme switches').getByText('Nobody has switched yet.')).toBeVisible()
    await expect.element(list('What visitors did').getByText('Nothing reported yet.')).toBeVisible()
    await expect.element(list('Countries').getByText('Nothing yet.')).toBeVisible()
    expect(tile('Errors')).toBe('0None')
    expect(tile('Page views')).toBe('0')
  })

  it('shows placeholders while loading, and a retry when the numbers fail', async () => {
    calls.summary.mockReturnValueOnce(forever())
    await renderEngagement()
    await expect.poll(() => textOf(page.getByRole('status').first())).toContain('Loading the numbers…')

    calls.summary.mockRejectedValueOnce(new ApiError('/api/analytics/summary', 500))
    await page.getByRole('button', { name: '7 days' }).click()
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The numbers couldn't be loaded.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => tile('Visitors')).toBe('42Unique per day')
  })

  it('charts visitors, page views or errors per column', async () => {
    await renderEngagement()
    const chart = page.getByRole('region', { name: /per day/ })
    await expect.element(chart.getByRole('img')).toHaveAccessibleName('Visitors per day: 42 in total')
    await chart.getByRole('button', { name: 'Page views' }).click()
    await expect.element(chart.getByRole('img')).toHaveAccessibleName('Page views per day: 112 in total')
    await chart.getByRole('button', { name: 'Errors' }).click()
    await expect.element(chart.getByRole('img')).toHaveAccessibleName('Errors per day: 3 in total')
  })

  it("keeps the chart's numbers for screen readers out of sight: no stray title under the chart", async () => {
    await renderEngagement()
    const chart = page.getByRole('region', { name: /per day/ })
    // Still there for screen readers, named by its caption…
    await expect.element(chart.getByRole('table', { name: 'Visitors per day' })).toBeInTheDocument()
    const caption = chart.element().querySelector('caption')!
    // …but hidden around the table: a caption sits outside the table's own box, so hiding the table itself let it show.
    expect(caption.closest('.visually-hidden')).not.toBe(caption.closest('table'))
    expect(caption.closest('table')!.classList.contains('visually-hidden')).toBe(false)
    const hidden = caption.closest<HTMLElement>('.visually-hidden')!
    expect(hidden.getBoundingClientRect().width).toBeLessThanOrEqual(1)
    expect(getComputedStyle(hidden).overflow).toBe('hidden')
    // Nothing of it is drawn: the caption's text is nowhere a pointer can land on it.
    const box = caption.getBoundingClientRect()
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
    expect(hit === caption || caption.contains(hit)).toBe(false)

    await chart.getByRole('button', { name: 'Errors' }).click()
    await expect.element(chart.getByRole('table', { name: 'Errors per day' })).toBeInTheDocument()
  })

  it('has no note under the lists', async () => {
    await renderEngagement()
    await expect.poll(() => rows('Countries').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/Preferred theme is the one|Visitors are counted once a day|is a bounce/)
    expect(document.querySelector('.engagement-note')).toBeNull()
  })

  it('loads the numbers and the visits again with Refresh, and a visit seen before when it opens again', async () => {
    await renderEngagement()
    await expect.element(page.getByRole('region', { name: 'Visits table' })).toBeVisible()
    const openFirst = () => (document.querySelector('tbody tr button') as HTMLElement).click()
    openFirst()
    await expect.element(timeline()).toBeVisible()
    await dialog().getByRole('button', { name: 'Close' }).click()
    const [summaries, lists, visits] = [calls.summary.mock.calls.length, calls.list.mock.calls.length, calls.visit.mock.calls.length]

    // Reopened at once, a visit comes from the store; after Refresh it's asked for again (it may still be going on).
    openFirst()
    await expect.element(timeline()).toBeVisible()
    expect(calls.visit.mock.calls.length).toBe(visits)
    await dialog().getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'Refresh', exact: true }).click()
    await expect.poll(() => calls.summary.mock.calls.length).toBe(summaries + 1)
    await expect.poll(() => calls.list.mock.calls.length).toBe(lists + 1)
    openFirst()
    await expect.element(timeline()).toBeVisible()
    await expect.poll(() => calls.visit.mock.calls.length).toBe(visits + 1)
  })
})

describe('the visits', () => {
  const table = () => page.getByRole('region', { name: 'Visits table' })

  it('lists every visit, newest first, with its length, pages, device, entry page, source and errors', async () => {
    await renderEngagement()
    await expect.element(table()).toBeVisible()
    const cells = [...table().element().querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].slice(1).map((td) => td.textContent))
    expect(cells).toEqual([
      ['2m 05s', '2', 'mobile · Safari · iOS', '/apps', 'github.com', '1'],
      ['2m 05s', '2', 'mobile · Safari · iOS', '/', 'Direct', '0'],
    ])
    expect(calls.list).toHaveBeenCalledWith(1, 20, false, expect.anything())
  })

  it('keeps only the visits with errors, from the first page', async () => {
    calls.list.mockImplementation(async (pageNumber = 1, _size, errorsOnly) => ({
      ...pageOfVisits(errorsOnly ? [VISIT_SUMMARY] : undefined, errorsOnly ? 1 : 45),
      page: pageNumber,
    }))
    await renderEngagement()
    await page.getByRole('button', { name: 'Next' }).click()
    expect(calls.list).toHaveBeenLastCalledWith(2, 20, false, expect.anything())
    await page.getByRole('checkbox', { name: 'Only visits with errors' }).click()
    await expect.poll(() => calls.list.mock.calls.at(-1)?.slice(0, 3)).toEqual([1, 20, true])
    await expect.poll(() => table().element().querySelectorAll('tbody tr').length).toBe(1)
  })

  it('pages through many visits, 20 at a time, and back, and says where it is', async () => {
    calls.list.mockImplementation(async (pageNumber = 1) => ({
      ...pageOfVisits(
        Array.from({ length: pageNumber === 3 ? 5 : 20 }, (_, i) => ({ ...VISIT_SUMMARY, id: `${pageNumber}-${i}`, entryPath: `/page-${pageNumber}` })),
        45,
      ),
      page: pageNumber,
    }))
    await renderEngagement()
    const visits = page.getByRole('region', { name: 'Visits' })
    const pager = visits.getByRole('navigation', { name: 'Pagination' })
    await expect.poll(() => textOf(pager)).toContain('Page 1 of 3')
    await expect.element(pager.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(table().element().querySelectorAll('tbody tr')).toHaveLength(20)

    await pager.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => textOf(pager)).toContain('Page 2 of 3')
    await pager.getByRole('button', { name: 'Next' }).click()
    await expect.poll(() => textOf(pager)).toContain('Page 3 of 3')
    await expect.element(pager.getByRole('button', { name: 'Next' })).toBeDisabled()
    await expect.poll(() => table().element().querySelectorAll('tbody tr').length).toBe(5)
    expect(table().element().querySelector('.visits-path')!.textContent).toBe('/page-3')

    await pager.getByRole('button', { name: 'Previous' }).click()
    await expect.poll(() => textOf(pager)).toContain('Page 2 of 3')
    expect(calls.list.mock.calls.map((c) => c[0])).toEqual(expect.arrayContaining([1, 2, 3]))
  })

  it('shows no pager while every visit fits on one page', async () => {
    calls.list.mockResolvedValue(pageOfVisits(undefined, 20))
    await renderEngagement()
    await expect.element(table()).toBeVisible()
    expect(page.getByRole('region', { name: 'Visits' }).getByRole('navigation', { name: 'Pagination' }).query()).toBeNull()
  })

  it('says so when there are none, or none with errors', async () => {
    calls.list.mockResolvedValue(pageOfVisits([], 0))
    await renderEngagement()
    await expect.element(page.getByText('No visits yet.')).toBeVisible()
    await page.getByRole('checkbox', { name: 'Only visits with errors' }).click()
    await expect.element(page.getByText('No visit has hit an error.')).toBeVisible()
  })

  it("says when the visits can't be loaded, and loads them on retry", async () => {
    calls.list.mockRejectedValueOnce(new ApiError('/api/analytics/sessions', 500))
    await renderEngagement()
    const visits = page.getByRole('region', { name: 'Visits' })
    await expect.poll(() => textOf(visits.getByRole('alert'))).toContain("Visits couldn't be loaded.")
    await visits.getByRole('button', { name: 'Try again' }).click()
    await expect.element(table()).toBeVisible()
  })

  it('opens a visit from anywhere on its row', async () => {
    await renderEngagement()
    await expect.element(table()).toBeVisible()
    ;(table().element().querySelector('tbody tr td:nth-child(4)') as HTMLElement).click()
    await expect.element(timeline()).toBeVisible()
    expect(calls.visit).toHaveBeenCalledWith(VISIT_ID, expect.anything())
  })
})

describe('a visit, replayed', () => {
  const open = async () => {
    await renderEngagement()
    await expect.element(table()).toBeVisible()
    ;(table().element().querySelector('tbody tr button') as HTMLElement).click()
    await expect.element(timeline()).toBeVisible()
  }
  const table = () => page.getByRole('region', { name: 'Visits table' })
  const facts = () =>
    Object.fromEntries([...dialog().element().querySelectorAll('.visit-facts > div')].map((d) => [d.querySelector('dt')!.textContent, d.querySelector('dd')!.textContent]))

  afterEach(() => vi.restoreAllMocks())

  it('says what it ran on, where from, and how long it lasted', async () => {
    await open()
    expect(facts()).toEqual({
      Device: 'mobile · Safari · iOS',
      Window: '390×664 (screen 390×844)',
      Theme: 'vice → dark',
      Length: '2m 05s',
      'Came from': 'github.com/jechel',
      Where: 'GB · Europe/London · en-GB',
    })
    await expect.element(dialog().getByText(VISIT.userAgent)).toBeVisible()
  })

  it('tells every step in words, with its time and page', async () => {
    await open()
    const steps = [...timeline().element().querySelectorAll('li')].map((li) => `${li.querySelector('time')!.textContent} ${li.querySelector('.visit-step-text')!.textContent}`)
    expect(steps).toEqual([
      '+0:00 Opened /apps',
      '+0:03 Terms accepted',
      '+0:08 Clicked “Space Game”',
      '+0:12 Swiped to another slide (app: Space Game, slide: 2 of 4)',
      '+0:20 Clicked “Building a game” (https://www.youtube-nocookie.com/embed/abc)',
      '+0:31 Pressed Escape',
      '+0:33 Scrolled 75% down the page',
      '+0:34 Clicked “Contact” (/contact)',
      '+0:34 Opened /contact',
      '+0:50 Changed “Message”',
      '+0:52 Changed “Flag” → Romania',
      '+1:00 Sent the form “Contact” (pressed Enter)',
      '+1:01 ERROR: POST /api/contact failed (503)',
      '+1:10 Switched away (hid the tab)',
      '+2:00 Came back to the tab',
      '+2:05 Left the site (closed the tab or went elsewhere)',
    ])
    // Each kind of step has its own look.
    expect(timeline().element().querySelector('li.visit-step-error')).not.toBeNull()
  })

  it("opens an error's details", async () => {
    await open()
    const error = timeline().element().querySelector('li.visit-step-error')!
    const details = error.querySelector('details')!
    expect(details.open).toBe(false)
    ;(details.querySelector('summary') as HTMLElement).click()
    await expect.poll(() => details.open).toBe(true)
    expect(details.textContent).toContain('request')
    expect(details.textContent).toContain('503')
  })

  it('copies the steps to reproduce it, setup first', async () => {
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    await open()
    await dialog().getByRole('button', { name: 'Copy steps to reproduce' }).click()
    const text = writeText.mock.calls[0][0]
    expect(text).toContain('- Device: mobile · Safari · iOS')
    expect(text).toContain('- Started on: /apps (from github.com/jechel)')
    expect(text).toContain('12. [+1:00] Sent the form “Contact” (pressed Enter)  (on /contact)')
    expect(text).toContain('13. [+1:01] ERROR: POST /api/contact failed (503)  (on /contact)')
    expect(text).toContain('     kind: request')
  })

  it('deletes the visit after asking, then the numbers and the list load again', async () => {
    await open()
    const [summaries, lists] = [calls.summary.mock.calls.length, calls.list.mock.calls.length]
    await dialog().getByRole('button', { name: 'Delete visit' }).click()
    await page.getByRole('dialog', { name: 'Delete this visit?' }).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.element(dialog()).not.toBeInTheDocument()
    expect(calls.remove).toHaveBeenCalledWith(VISIT_ID)
    await expect.poll(() => calls.summary.mock.calls.length).toBe(summaries + 1)
    expect(calls.list.mock.calls.length).toBe(lists + 1)
  })

  it("says when a visit can't be loaded, with a retry, and closes", async () => {
    calls.visit.mockRejectedValueOnce(new ApiError('/api/analytics/sessions/x', 500))
    await renderEngagement()
    await expect.element(table()).toBeVisible()
    ;(table().element().querySelector('tbody tr button') as HTMLElement).click()
    const visitDialog = page.getByRole('dialog', { name: 'Visit' })
    await expect.poll(() => textOf(visitDialog.getByRole('alert'))).toContain("This visit couldn't be loaded.")
    await visitDialog.getByRole('button', { name: 'Try again' }).click()
    await expect.element(timeline()).toBeVisible()
    await dialog().getByRole('button', { name: 'Close' }).click()
    await expect.element(dialog()).not.toBeInTheDocument()
  })
})

describe('accessibility', () => {
  it('has no violations, with a visit open too', async () => {
    await renderEngagement()
    await expect.element(page.getByRole('region', { name: 'Visits table' })).toBeVisible()
    expect(await a11yViolations()).toEqual([])
    ;(document.querySelector('tbody tr button') as HTMLElement).click()
    await expect.element(timeline()).toBeVisible()
    expect(await a11yViolations()).toEqual([])
  })
})
