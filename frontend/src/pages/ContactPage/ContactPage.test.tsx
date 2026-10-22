import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api } from '../../services/api'
import { stubApi } from '../../test/api'
import { pageOfMessages } from '../../test/fixtures/contact'
import { todaysMeetings } from '../../test/fixtures/meetings'
import { renderApp, ADMIN } from '../../test/render'

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
})
