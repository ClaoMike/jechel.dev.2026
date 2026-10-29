import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api } from '@/shared/api'
import { stubApi } from '@/test/api'
import { pageOfMessages } from '@/test/fixtures/contact'
import { todaysMeetings } from '@/test/fixtures/meetings'
import { renderApp, ADMIN } from '@/test/render'

// Meetings are by invitation: visitors get the form alone, and the admin the calendar above the messages.

describe('the Contact page', () => {
  it('gives visitors the form alone: no booking, and nothing asked about it', async () => {
    const stubs = stubApi()
    await renderApp({ path: '/contact' })

    await expect.element(page.getByRole('heading', { name: 'Contact me' })).toBeVisible()
    expect(page.getByText(/Book a meeting/).query()).toBeNull()
    expect(page.getByRole('radio', { name: 'Send a message' }).query()).toBeNull()
    expect(document.querySelector('script[src*="cal.com"]')).toBeNull()
    expect(stubs.meetings.info).not.toHaveBeenCalled()
    expect(stubs.meetings.list).not.toHaveBeenCalled()
  })

  it('gives the admin the meetings calendar above the messages', async () => {
    const stubs = stubApi({ user: ADMIN })
    stubs.meetings.list.mockResolvedValue(todaysMeetings())
    vi.spyOn(api.contact, 'listMessages').mockResolvedValue(pageOfMessages())
    await renderApp({ path: '/contact' })

    const meetings = page.getByRole('region', { name: 'Meetings' })
    await expect.element(meetings).toBeVisible()
    await expect.element(page.getByRole('region', { name: 'Messages table' })).toBeVisible()
    expect(meetings.element().compareDocumentPosition(page.getByRole('region', { name: 'Messages table' }).element()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(page.getByRole('heading', { name: 'Contact me' }).query()).toBeNull()
  })

  it("keeps the admin's calendar and messages on a phone's screen: the table scrolls sideways inside its card", async () => {
    const stubs = stubApi({ user: ADMIN })
    stubs.meetings.list.mockResolvedValue(todaysMeetings())
    vi.spyOn(api.contact, 'listMessages').mockResolvedValue(pageOfMessages())
    await page.viewport(360, 800)
    try {
      await renderApp({ path: '/contact' })
      const table = page.getByRole('region', { name: 'Messages table' })
      await expect.element(table).toBeVisible()

      for (const card of [page.getByRole('region', { name: 'Meetings' }), page.getByRole('region', { name: 'Messages' })]) {
        expect(card.element().getBoundingClientRect().right).toBeLessThanOrEqual(360)
      }
      const scroller = table.element()
      expect(scroller.scrollWidth).toBeGreaterThan(scroller.clientWidth)
    } finally {
      await page.viewport(1280, 900)
    }
  })
})
