import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError, type AlertChannelState, type PushDevice } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { stubApi } from '@/test/api'
import { CHANNELS, HERE, PUSH } from '@/test/fixtures/notifications'
import { ADMIN, forever, renderView, shootWhole, textOf } from '@/test/render'
import { webPush } from '../../lib/webPush'
import { AlertChannelsCard } from './AlertChannelsCard'

// Where alerts go: the ntfy app and the site's own notifications, each on or off, and the devices that get the site's own.

const SUBSCRIPTION = { endpoint: HERE, keys: { p256dh: 'BKey', auth: 'secret' } }

let calls: {
  channels: MockInstance<typeof api.notifications.listChannels>
  save: MockInstance<typeof api.notifications.saveChannel>
  push: MockInstance<typeof api.notifications.getPush>
  add: MockInstance<typeof api.notifications.addPushDevice>
  remove: MockInstance<typeof api.notifications.removePushDevice>
  test: MockInstance<typeof api.notifications.testPushDevice>
}
let browser: {
  support: MockInstance<typeof webPush.support>
  permission: MockInstance<typeof webPush.permission>
  current: MockInstance<typeof webPush.currentEndpoint>
  subscribe: MockInstance<typeof webPush.subscribe>
  unsubscribe: MockInstance<typeof webPush.unsubscribe>
}

beforeEach(() => {
  stubApi({ user: ADMIN })
  let channels: AlertChannelState[] = structuredClone(CHANNELS)
  let devices: PushDevice[] = structuredClone(PUSH.devices).filter((d) => d.endpoint !== HERE)
  calls = {
    channels: vi.spyOn(api.notifications, 'listChannels').mockImplementation(async () => structuredClone(channels)),
    save: vi.spyOn(api.notifications, 'saveChannel').mockImplementation(async (channel, enabled) => {
      channels = channels.map((c) => (c.channel === channel ? { ...c, enabled } : c))
      return structuredClone(channels)
    }),
    push: vi.spyOn(api.notifications, 'getPush').mockImplementation(async () => ({ publicKey: PUSH.publicKey, devices: structuredClone(devices) })),
    add: vi.spyOn(api.notifications, 'addPushDevice').mockImplementation(async (subscription, label) => {
      devices = [{ id: 7, label, endpoint: subscription.endpoint, createdAt: '2026-10-24T18:00:00Z', lastSentAt: null }, ...devices]
      return structuredClone(devices)
    }),
    remove: vi.spyOn(api.notifications, 'removePushDevice').mockImplementation(async (id) => {
      devices = devices.filter((d) => d.id !== id)
      return structuredClone(devices)
    }),
    test: vi.spyOn(api.notifications, 'testPushDevice').mockResolvedValue(),
  }
  browser = {
    support: vi.spyOn(webPush, 'support').mockReturnValue('supported'),
    permission: vi.spyOn(webPush, 'permission').mockReturnValue('default'),
    current: vi.spyOn(webPush, 'currentEndpoint').mockResolvedValue(null),
    subscribe: vi.spyOn(webPush, 'subscribe').mockResolvedValue(SUBSCRIPTION),
    unsubscribe: vi.spyOn(webPush, 'unsubscribe').mockResolvedValue(),
  }
  vi.spyOn(webPush, 'deviceLabel').mockReturnValue('iPhone · Home Screen app')
})

const show = (theme?: 'dark' | 'light' | 'vice') => renderView(<AlertChannelsCard />, { user: ADMIN, theme })
const card = () => page.getByRole('region', { name: 'Where they go' })
const channel = (name: string) => card().getByRole('group', { name, exact: true })
const radio = (name: string, value: 'On' | 'Off') => channel(name).getByRole('radio', { name: value })
const devices = () => page.getByRole('region', { name: "Devices with this site's notifications" })
const device = (label: string) => devices().getByRole('listitem').filter({ hasText: label })
/** The card's message, said as a status (it went) or an alert (it didn't). */
async function said(role: 'status' | 'alert', text: string) {
  const line = card().getByText(text, { exact: false })
  await expect.element(line).toBeVisible()
  expect(line.element().closest(`[role="${role}"]`)).not.toBeNull()
}

describe('the ways alerts go', () => {
  it('lists the ntfy app and the site’s own notifications, each on or off', async () => {
    await show()
    await expect.element(radio('The ntfy app', 'On')).toBeChecked()
    await expect.element(radio("This site's notifications", 'On')).toBeChecked()
    expect(textOf(card())).toContain("Each alert goes every way that's on.")
  })

  it('switches one off, and back on', async () => {
    await show()
    await channel('The ntfy app').getByText('Off').click()
    await expect.element(radio('The ntfy app', 'Off')).toBeChecked()
    expect(calls.save).toHaveBeenCalledWith('ntfy', false)
    await channel('The ntfy app').getByText('On').click()
    await expect.poll(() => calls.save.mock.calls.at(-1)).toEqual(['ntfy', true])
  })

  it('puts a switch back and says so when it couldn’t be saved', async () => {
    calls.save.mockRejectedValueOnce(new ApiError('/api/notifications/channels/push', 500))
    await show()
    await channel("This site's notifications").getByText('Off').click()
    await said('alert', "That couldn't be saved. Please try again.")
    await expect.element(radio("This site's notifications", 'On')).toBeChecked()
  })

  it('says what a way that’s on still needs: an ntfy topic, a device', async () => {
    calls.channels.mockResolvedValue([
      { channel: 'ntfy', enabled: true, ready: false },
      { channel: 'push', enabled: true, ready: false },
    ])
    await show()
    await expect.element(card().getByText('Not set up: add a topic in Settings → ntfy.')).toBeVisible()
    await expect.element(card().getByText('No device yet: allow them on one below.')).toBeVisible()
  })

  it('says nothing is missing for a way switched off', async () => {
    calls.channels.mockResolvedValue([
      { channel: 'ntfy', enabled: false, ready: false },
      { channel: 'push', enabled: true, ready: true },
    ])
    await show()
    await expect.element(radio('The ntfy app', 'Off')).toBeChecked()
    expect(
      card()
        .getByText(/Not set up/)
        .query(),
    ).toBeNull()
  })

  it('shows the switches’ shape while loading, and a retry when they can’t be loaded', async () => {
    calls.channels.mockImplementation(forever)
    const loading = await show()
    await said('status', 'Loading where they go…')
    await loading.unmount()

    calls.channels.mockRejectedValueOnce(new ApiError('/api/notifications/channels', 500))
    await show()
    await expect.element(page.getByText("Where they go couldn't be loaded.")).toBeVisible()
    calls.channels.mockResolvedValue(structuredClone(CHANNELS))
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(radio('The ntfy app', 'On')).toBeVisible()
  })
})

describe('the devices', () => {
  it('lists them, with when each was added and last sent to', async () => {
    calls.push.mockResolvedValue(structuredClone(PUSH))
    await show()
    await expect.element(device('iPhone · Home Screen app')).toBeVisible()
    expect(textOf(device('iPhone · Home Screen app'))).toContain('Added 24 Oct 2026 · last sent')
    expect(textOf(device('Mac · Chrome'))).toContain('Added 23 Oct 2026 · nothing sent yet')
    expect(
      devices()
        .getByRole('listitem')
        .elements()
        .map((li) => li.querySelector('.notification-kind-label')!.firstChild!.textContent),
    ).toEqual(['iPhone · Home Screen app', 'Mac · Chrome'])
  })

  it('marks this device', async () => {
    calls.push.mockResolvedValue(structuredClone(PUSH))
    browser.current.mockResolvedValue(HERE)
    await show()
    await expect.element(device('iPhone · Home Screen app').getByText('This device')).toBeVisible()
    expect(device('Mac · Chrome').getByText('This device').query()).toBeNull()
    await expect.element(devices().getByText('This device gets them. Remove it above to stop.')).toBeVisible()
  })

  it('says when there are none', async () => {
    calls.push.mockResolvedValue({ publicKey: PUSH.publicKey, devices: [] })
    await show()
    await expect.element(devices().getByText('None yet.')).toBeVisible()
  })

  it('sends one a test, and says how it went', async () => {
    await show()
    await device('Mac · Chrome').getByRole('button', { name: 'Send a test' }).click()
    await said('status', 'Sent to Mac · Chrome: it should show in a moment.')
    expect(calls.test).toHaveBeenCalledWith(1)

    calls.test.mockRejectedValueOnce(new ApiError('/api/notifications/push/devices/1/test', 502))
    await device('Mac · Chrome').getByRole('button', { name: 'Send a test' }).click()
    await said('alert', "It couldn't be sent to Mac · Chrome.")
  })

  it('removes one after asking; this device stops listening too', async () => {
    calls.push.mockResolvedValue(structuredClone(PUSH))
    browser.current.mockResolvedValue(HERE)
    await show()
    await device('iPhone · Home Screen app').getByRole('button', { name: 'Remove notifications on iPhone · Home Screen app' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect.poll(() => calls.remove.mock.calls).toEqual([[2]])
    await expect.poll(() => browser.unsubscribe.mock.calls.length).toBe(1)
  })

  it("removing another device leaves this browser's own alone", async () => {
    calls.push.mockResolvedValue(structuredClone(PUSH))
    browser.current.mockResolvedValue(HERE)
    await show()
    await device('Mac · Chrome').getByRole('button', { name: 'Remove notifications on Mac · Chrome' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect.poll(() => calls.remove.mock.calls).toEqual([[1]])
    expect(browser.unsubscribe).not.toHaveBeenCalled()
  })
})

describe('this device', () => {
  it('gets them here: asks to allow, subscribes with the site’s key, and lists it as this device', async () => {
    await show()
    await devices().getByRole('button', { name: 'Get them on this device' }).click()
    await said('status', 'This device gets them now. Send it a test to check.')
    expect(browser.subscribe).toHaveBeenCalledWith(PUSH.publicKey)
    expect(calls.add).toHaveBeenCalledWith(SUBSCRIPTION, 'iPhone · Home Screen app')
    await expect.element(device('iPhone · Home Screen app').getByText('This device')).toBeVisible()
    expect(devices().getByRole('button', { name: 'Get them on this device' }).query()).toBeNull()
  })

  it('says when notifications were blocked, and how to allow them', async () => {
    browser.subscribe.mockRejectedValueOnce(new Error('Notifications denied'))
    await show()
    browser.permission.mockReturnValue('denied')
    await devices().getByRole('button', { name: 'Get them on this device' }).click()
    await said('alert', 'Notifications are blocked here: see below.')
    await expect.element(devices().getByText(/Notifications are blocked for this site here/)).toBeVisible()
    expect(calls.add).not.toHaveBeenCalled()
  })

  it('says when it didn’t work for another reason', async () => {
    calls.add.mockRejectedValueOnce(new ApiError('/api/notifications/push/devices', 500))
    await show()
    await devices().getByRole('button', { name: 'Get them on this device' }).click()
    await said('alert', "That didn't work. Please try again.")
    await expect.element(devices().getByRole('button', { name: 'Get them on this device' })).toBeEnabled()
  })

  it('waits while allowing: one press', async () => {
    browser.subscribe.mockImplementation(forever)
    await show()
    await devices().getByRole('button', { name: 'Get them on this device' }).click()
    await expect.element(devices().getByRole('button', { name: 'Allowing…' })).toBeDisabled()
  })

  it('on an iPhone in Safari, says to add the site to the Home Screen first', async () => {
    browser.support.mockReturnValue('needs-home-screen')
    await show()
    await expect.element(devices().getByText(/Share → Add to Home Screen, open it from there, and allow them here/)).toBeVisible()
    expect(devices().getByRole('button', { name: 'Get them on this device' }).query()).toBeNull()
  })

  it("says when the browser can't get them at all", async () => {
    browser.support.mockReturnValue('unsupported')
    await show()
    await expect.element(devices().getByText("This browser can't get notifications.")).toBeVisible()
  })

  it('blocked before: says how to allow them, with no button', async () => {
    browser.permission.mockReturnValue('denied')
    await show()
    await expect.element(devices().getByText(/Settings → Notifications → jechel.dev/)).toBeVisible()
    expect(devices().getByRole('button', { name: 'Get them on this device' }).query()).toBeNull()
  })
})

describe('screenshots and accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      calls.push.mockResolvedValue(structuredClone(PUSH))
      browser.current.mockResolvedValue(HERE)
      await show(theme)
      await expect.element(device('iPhone · Home Screen app').getByText('This device')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), theme)
    })
  }
})
