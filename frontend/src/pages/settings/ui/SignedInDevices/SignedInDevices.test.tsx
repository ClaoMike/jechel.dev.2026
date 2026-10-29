import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError, type AdminSession } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
import { formatDateTime } from '@/shared/lib/format'
import { SignedInDevices } from './SignedInDevices'

const LAPTOP: AdminSession = {
  id: 'laptop',
  device: 'Chrome on macOS',
  deviceType: 'desktop',
  ipAddress: '203.0.113.7',
  country: 'GB',
  createdAt: '2026-10-21T09:00:00Z',
  lastSeenAt: '2026-10-21T09:05:00Z',
  endsAt: '2026-10-21T21:00:00Z',
  current: true,
}
const PHONE: AdminSession = { ...LAPTOP, id: 'phone', device: 'Safari on iOS', deviceType: 'mobile', ipAddress: '198.51.100.4', country: null, current: false }
const UNKNOWN: AdminSession = { ...LAPTOP, id: 'unknown', device: 'A browser', ipAddress: null, country: null, current: false }

function stub(sessions: AdminSession[] = [LAPTOP, PHONE]) {
  return {
    list: vi.spyOn(api.auth, 'listSessions').mockResolvedValue(sessions),
    end: vi.spyOn(api.auth, 'endSession').mockResolvedValue(),
    endOthers: vi.spyOn(api.auth, 'endOtherSessions').mockResolvedValue(1),
  }
}

const show = () => renderView(<SignedInDevices />, { user: ADMIN })
const rows = () => page.getByRole('list', { name: 'Signed-in devices' }).getByRole('listitem')
const row = (device: string) => rows().filter({ hasText: device })
const message = () => textOf(page.getByRole('status'))

describe('Settings → Signed-in devices', () => {
  it('lists each device: what it is, where, when it signed in, was active and ends, this one marked', async () => {
    stub([LAPTOP, PHONE, UNKNOWN])
    await show()
    await expect.poll(() => rows().all().length).toBe(3)
    const laptop = row('Chrome on macOS').element().textContent
    expect(laptop).toContain('This device')
    expect(laptop).toContain('203.0.113.7 (GB)')
    expect(laptop).toContain(`signed in ${formatDateTime(LAPTOP.createdAt)}`)
    expect(laptop).toContain(`active ${formatDateTime(LAPTOP.lastSeenAt)}`)
    expect(laptop).toContain(`ends by ${formatDateTime(LAPTOP.endsAt)}`)
    expect(row('Chrome on macOS').element().querySelector('time')?.getAttribute('datetime')).toBe(LAPTOP.lastSeenAt)
    expect(row('Safari on iOS').element().textContent).toContain('198.51.100.4 ·')
    expect(row('A browser').element().textContent).toContain('Unknown address')
  })

  it("has no Sign out for this device (that's the header's), and one for every other", async () => {
    stub()
    await show()
    await expect.element(page.getByRole('button', { name: 'Sign out Safari on iOS' })).toBeVisible()
    expect(page.getByRole('button', { name: 'Sign out Chrome on macOS' }).query()).toBeNull()
  })

  it('signs one device out, says so, and lists the devices again', async () => {
    const api = stub()
    await show()
    api.list.mockResolvedValue([LAPTOP])

    await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click()

    expect(api.end).toHaveBeenCalledWith('phone')
    await expect.poll(message).toBe('✓ Signed out Safari on iOS.')
    await expect.poll(() => rows().all().length).toBe(1)
    expect(page.getByRole('button', { name: 'Sign out all other devices' }).query()).toBeNull()
  })

  it('says "Signing out…" on that device meanwhile', async () => {
    const api = stub()
    api.end.mockReturnValue(forever())
    await show()
    await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click()
    await expect.element(page.getByRole('button', { name: 'Sign out Safari on iOS' })).toHaveTextContent('Signing out…')
    await expect.element(page.getByRole('button', { name: 'Sign out Safari on iOS' })).toBeDisabled()
  })

  it('just lists the devices again when that one had already ended (404)', async () => {
    const api = stub()
    await show()
    api.end.mockRejectedValue(new ApiError('/api/auth/sessions/phone', 404))
    api.list.mockResolvedValue([LAPTOP])

    await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click()

    await expect.poll(() => rows().all().length).toBe(1)
    expect(page.getByRole('status').query()).toBeNull()
  })

  it('says when a device could not be signed out', async () => {
    const api = stub()
    api.end.mockRejectedValue(new ApiError('/api/auth/sessions/phone', 500))
    await show()
    await page.getByRole('button', { name: 'Sign out Safari on iOS' }).click()
    await expect.poll(message).toBe("That device couldn't be signed out. Please try again.")
    expect(page.getByRole('status').element().className).toBe('field-error')
  })

  for (const [count, text] of [
    [2, '✓ Signed out 2 other devices.'],
    [1, '✓ Signed out 1 other device.'],
    [0, '✓ No other device was signed in.'],
  ] as const) {
    it(`signs out every other device: "${text}"`, async () => {
      const api = stub()
      api.endOthers.mockResolvedValue(count)
      await show()
      await page.getByRole('button', { name: 'Sign out all other devices' }).click()
      await expect.poll(message).toBe(text)
      expect(api.list).toHaveBeenCalledTimes(2)
    })
  }

  it('says when the other devices could not be signed out', async () => {
    const api = stub()
    api.endOthers.mockRejectedValue(new ApiError('/api/auth/sessions/end-others', 500))
    await show()
    await page.getByRole('button', { name: 'Sign out all other devices' }).click()
    await expect.poll(message).toBe("The other devices couldn't be signed out. Please try again.")
  })

  it('says "Signing out…" while signing the others out', async () => {
    const api = stub()
    api.endOthers.mockReturnValue(forever())
    await show()
    await page.getByRole('button', { name: 'Sign out all other devices' }).click()
    await expect.element(page.getByRole('button', { name: 'Signing out…' })).toBeDisabled()
  })

  it('shows placeholders while loading, and a retry when the list fails', async () => {
    const api = stub()
    api.list.mockReturnValueOnce(forever())
    const loading = await show()
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading the signed-in devices…')
    await loading.unmount()

    api.list.mockRejectedValueOnce(new ApiError('/api/auth/sessions', 500))
    await show()
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The signed-in devices couldn't be loaded.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => rows().all().length).toBe(2)
  })

  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems, with a message`, async () => {
      stub()
      await renderView(<SignedInDevices />, { user: ADMIN, theme })
      await page.getByRole('button', { name: 'Sign out all other devices' }).click()
      await expect.poll(message).not.toBe('')
      expect(await a11yViolations()).toEqual([])
    })
  }
})
