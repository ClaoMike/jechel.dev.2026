import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError } from '../../../services/api'
import { stubApi } from '../../../test/api'
import { SITE, SUPPORT_URL } from '../../../test/fixtures/site'
import { forever, renderView } from '../../../test/render'
import { tracker } from '../../analytics/tracker'
import { SupportButton } from './SupportButton'

// "Buy me a coffee" in the header: where it leads comes from the API, and it shows only when switched on.

const link = () => page.getByRole('link', { name: 'Buy me a coffee (opens in a new tab)' })
const show = (coffee = true) => renderView(<SupportButton />, { site: { ...structuredClone(SITE), features: { ...SITE.features, coffee } } })

describe('Buy me a coffee', () => {
  it('holds its place while it asks the API, then links to the page in a new tab', async () => {
    const stubs = stubApi()
    let answer!: (info: { url: string }) => void
    stubs.support.get.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)))
    await show()
    await expect.element(page.getByRole('link')).not.toBeInTheDocument()
    expect(document.querySelector('.header-button-skeleton')).not.toBeNull()

    answer({ url: SUPPORT_URL })
    await expect.element(link()).toHaveAttribute('href', SUPPORT_URL)
    await expect.element(link()).toHaveAttribute('target', '_blank')
    await expect.element(link()).toHaveAttribute('rel', 'noopener noreferrer')
    expect(document.querySelector('.header-button-skeleton')).toBeNull()
  })

  it('records a click for the Engagement tab', async () => {
    stubApi()
    const reported = vi.spyOn(tracker, 'event')
    await show()
    // Not followed: the test stays on its page.
    link()
      .element()
      .addEventListener('click', (e) => e.preventDefault())
    await link().click()
    expect(reported).toHaveBeenCalledWith('Support clicked', undefined)
  })

  it('is gone when there is no page, when the API cannot say, and when switched off', async () => {
    const stubs = stubApi()
    stubs.support.get.mockResolvedValueOnce({ url: '' })
    const none = await show()
    await expect.poll(() => stubs.support.get.mock.calls.length).toBe(1)
    await expect.element(link()).not.toBeInTheDocument()
    expect(document.querySelector('.header-button-skeleton')).toBeNull()
    await none.unmount()

    stubs.support.get.mockRejectedValueOnce(new ApiError('/api/support', 500))
    const failed = await show()
    await expect.poll(() => document.querySelector('.header-button-skeleton')).toBeNull()
    expect(link().query()).toBeNull()
    await failed.unmount()

    // Off, even while the API still had a link (it's asked again after the switch: no wait for that).
    stubs.support.get.mockReturnValue(forever())
    await show(false)
    expect(link().query()).toBeNull()
    expect(document.querySelector('.header-button-skeleton')).toBeNull()
  })
})
