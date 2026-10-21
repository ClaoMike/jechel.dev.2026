import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, type SiteStatus } from '../../services/api'
import { stubApi } from '../../test/api'
import { SITE, SUPPORT_URL } from '../../test/fixtures/site'
import { settings } from '../../test/fixtures/settings'
import { ADMIN, renderApp, renderView } from '../../test/render'
import { makeStore } from '../../store'
import { communityApi } from '../../store/api/communityApi'
import { meetingsApi } from '../../store/api/meetingsApi'
import { settingsApi } from '../../store/api/settingsApi'
import { saveSite } from '../../store/siteSlice'
import { useVisitorContactViewModel } from '../meetings/VisitorContact/VisitorContact.viewModel'

// Switching Buy me a coffee or Book a meeting in Settings shows on the site at once: no reload. (They
// ask the API where they lead, and that answer was kept until the page was loaded again.)

const coffee = () => page.getByRole('link', { name: 'Buy me a coffee (opens in a new tab)' })
const toggle = (name: string) => page.getByRole('switch', { name })

/** The admin, on Settings, with the API saving each switch as asked. */
function stub(features: Partial<SiteStatus['features']> = {}) {
  const stubs = stubApi({ user: ADMIN })
  let site: SiteStatus = { ...structuredClone(SITE), features: { ...SITE.features, ...features } }
  stubs.site.status.mockImplementation(async () => structuredClone(site))
  const save = vi.spyOn(api.site, 'save').mockImplementation(async (changes) => {
    site = { ...site, features: { ...site.features, ...changes.features } }
    return structuredClone(site)
  })
  // What the API answers depends on the switch, as it does for real.
  stubs.support.get.mockImplementation(async () => ({ url: site.features.coffee ? SUPPORT_URL : '' }))
  // Loaded, not pending: RTK Query asks again for what a save made stale only once nothing else is in flight.
  vi.spyOn(api.settings, 'get').mockResolvedValue(settings({ 'Support:Url': SUPPORT_URL, 'Cal:Link': 'claudiu/30min' }))
  vi.spyOn(api.auth, 'listSessions').mockResolvedValue([])
  return { ...stubs, save }
}

describe('Settings → Visitor pages, applied at once', () => {
  it('takes Buy me a coffee out of the header when switched off, and puts it back when switched on', async () => {
    const stubs = stub()
    await renderApp({ path: '/settings' })
    await expect.element(coffee()).toBeVisible()

    await toggle('Buy me a coffee').click()
    await expect.element(toggle('Buy me a coffee')).toHaveAttribute('aria-checked', 'false')
    await expect.element(coffee()).not.toBeInTheDocument()

    const asked = stubs.support.get.mock.calls.length
    await toggle('Buy me a coffee').click()
    await expect.element(toggle('Buy me a coffee')).toHaveAttribute('aria-checked', 'true')
    await expect.element(coffee()).toBeVisible()
    expect(coffee().element().getAttribute('href')).toBe(SUPPORT_URL)
    await expect.poll(() => stubs.support.get.mock.calls.length).toBeGreaterThan(asked)
  })

  it('puts it in the header when switched on for the first time', async () => {
    stub({ coffee: false })
    await renderApp({ path: '/settings' })
    await expect.element(toggle('Buy me a coffee')).toHaveAttribute('aria-checked', 'false')
    expect(coffee().query()).toBeNull()

    await toggle('Buy me a coffee').click()
    await expect.element(coffee()).toBeVisible()
  })

  it("doesn't ask again for anything a switch didn't change when the save fails", async () => {
    const stubs = stub()
    stubs.save.mockRejectedValueOnce(new Error('offline'))
    await renderApp({ path: '/settings' })
    await expect.element(coffee()).toBeVisible()
    const asked = stubs.support.get.mock.calls.length

    await toggle('Buy me a coffee').click()
    await expect.element(page.getByRole('alert').first()).toBeVisible()
    await expect.element(coffee()).toBeVisible()
    expect(stubs.support.get.mock.calls.length).toBe(asked)
  })
})

describe('what asks the API again, in the store', () => {
  const watch = (store: ReturnType<typeof makeStore>) => {
    const coffee = store.dispatch(communityApi.endpoints.getSupport.initiate())
    const meetings = store.dispatch(meetingsApi.endpoints.getMeetingsLink.initiate())
    return () => {
      coffee.unsubscribe()
      meetings.unsubscribe()
    }
  }

  it('asks again where Buy me a coffee and Book a meeting lead after any switch is saved', async () => {
    const stubs = stubApi()
    const meetings = vi.spyOn(api.meetings, 'info').mockResolvedValue('claudiu/30min')
    vi.spyOn(api.site, 'save').mockResolvedValue(structuredClone(SITE))
    const store = makeStore()
    const stop = watch(store)
    await expect.poll(() => [stubs.support.get.mock.calls.length, meetings.mock.calls.length]).toEqual([1, 1])

    await store.dispatch(saveSite({ features: { meetings: false } }))
    await expect.poll(() => [stubs.support.get.mock.calls.length, meetings.mock.calls.length]).toEqual([2, 2])
    stop()
  })

  it('asks again for the one whose link was saved in Settings, and for neither after another setting', async () => {
    const stubs = stubApi()
    const meetings = vi.spyOn(api.meetings, 'info').mockResolvedValue('claudiu/30min')
    vi.spyOn(api.settings, 'save').mockResolvedValue(settings())
    const store = makeStore()
    const stop = watch(store)
    await expect.poll(() => [stubs.support.get.mock.calls.length, meetings.mock.calls.length]).toEqual([1, 1])

    await store.dispatch(settingsApi.endpoints.saveSetting.initiate({ key: 'Support:Url', value: SUPPORT_URL }))
    await expect.poll(() => [stubs.support.get.mock.calls.length, meetings.mock.calls.length]).toEqual([2, 1])
    await store.dispatch(settingsApi.endpoints.saveSetting.initiate({ key: 'Cal:Link', value: 'claudiu/15min' }))
    await expect.poll(() => [stubs.support.get.mock.calls.length, meetings.mock.calls.length]).toEqual([2, 2])
    await store.dispatch(settingsApi.endpoints.saveSetting.initiate({ key: 'Alerts:NtfyTopic', value: 'jechel-abc' }))
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect([stubs.support.get.mock.calls.length, meetings.mock.calls.length]).toEqual([2, 2])
    stop()
  })
})

describe('Book a meeting on the Contact page', () => {
  function Booking() {
    const vm = useVisitorContactViewModel()
    return <p>{vm.calLink ? `Booking: ${vm.calLink}` : 'Message only'}</p>
  }

  it('goes the moment the switch is off, without waiting for the API', async () => {
    stubApi()
    vi.spyOn(api.meetings, 'info').mockResolvedValue('claudiu/30min')
    const save = vi.spyOn(api.site, 'save').mockResolvedValue({ ...structuredClone(SITE), features: { ...SITE.features, meetings: false } })
    const { store } = await renderView(<Booking />, { site: structuredClone(SITE) })
    await expect.element(page.getByText('Booking: claudiu/30min')).toBeVisible()

    await store.dispatch(saveSite({ features: { meetings: false } }))
    await expect.element(page.getByText('Message only')).toBeVisible()
    expect(save).toHaveBeenCalledOnce()
  })
})
