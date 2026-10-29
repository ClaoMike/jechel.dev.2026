import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, setRequestPreview } from '@/shared/api'
import { signedOutElsewhere } from '@/entities/session'
import { PREVIEW_STORAGE_KEY } from '../../model/previewSlice'
import { fakeHttp } from '@/test/http'
import { ADMIN, renderView } from '@/test/render'
import { PreviewSwitch } from './PreviewSwitch'

// The admin's preview switch (development only): content requests held ("Loading") or failed ("Error"),
// only while signed in, never sign-in itself. Checked with real requests over a fake network.

const option = (label: string) => page.getByRole('radio', { name: label })
/** Clicks the option's label, as people do (the radio itself is visually hidden behind the slider). */
const choose = (label: string) => page.getByText(label, { exact: true }).click()
const answered = () => fakeHttp(() => ({ status: 200, body: { items: [], page: 1, pageSize: 9, totalCount: 0 } }))

/** What a content request does now: "answered", "failed 500", or "held" (still waiting after a moment). */
async function contentRequest(): Promise<string> {
  const outcome = api.youtube.listVideos().then(
    () => 'answered',
    (error: unknown) => (error instanceof ApiError ? `failed ${error.status}` : 'cancelled'),
  )
  return Promise.race([outcome, new Promise<string>((r) => setTimeout(() => r('held'), 300))])
}

describe("the admin's preview switch", () => {
  afterEach(() => setRequestPreview('normal'))

  it('starts on Normal: requests are answered', async () => {
    answered()
    await renderView(<PreviewSwitch />, { user: ADMIN })
    await expect.element(option('Normal')).toBeChecked()
    expect(await contentRequest()).toBe('answered')
  })

  it('holds content requests on Loading, and lets them go when switched back', async () => {
    const { requests } = answered()
    await renderView(<PreviewSwitch />, { user: ADMIN })

    await choose('Loading')
    expect(sessionStorage.getItem(PREVIEW_STORAGE_KEY)).toBe('loading')
    const held = api.youtube.listVideos().catch((e: unknown) => (e as Error).name)
    expect(await contentRequest()).toBe('held')

    await choose('Normal')
    expect(await held).toBe('CanceledError')
    expect(sessionStorage.getItem(PREVIEW_STORAGE_KEY)).toBeNull()
    expect(await contentRequest()).toBe('answered')
    expect(requests).toHaveLength(1)
  })

  it('fails content requests with a 500 on Error, without sending them', async () => {
    const { requests } = answered()
    await renderView(<PreviewSwitch />, { user: ADMIN })

    await choose('Error')

    expect(await contentRequest()).toBe('failed 500')
    expect(requests).toHaveLength(0)
  })

  it('never touches signing in: the session check still goes through', async () => {
    const { requests } = fakeHttp(() => ({ status: 200, body: ADMIN }))
    await renderView(<PreviewSwitch />, { user: ADMIN })

    await choose('Error')

    expect(await api.auth.me()).toEqual(ADMIN)
    expect(requests.map((r) => r.url)).toEqual(['/api/auth/me'])
  })

  it('stops applying once the admin is signed out', async () => {
    answered()
    const view = await renderView(<PreviewSwitch />, { user: ADMIN })
    await choose('Error')
    expect(await contentRequest()).toBe('failed 500')

    view.store.dispatch(signedOutElsewhere())

    await expect.poll(contentRequest).toBe('answered')
  })

  it("is remembered for this tab, and applied again once it's known the admin is signed in", async () => {
    answered()
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, 'error')

    await renderView(<PreviewSwitch />, { user: ADMIN })

    await expect.element(option('Error')).toBeChecked()
    expect(await contentRequest()).toBe('failed 500')
  })

  it('never applies for a visitor, even if this tab remembers it', async () => {
    answered()
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, 'error')

    await renderView(<PreviewSwitch />)

    expect(await contentRequest()).toBe('answered')
  })

  it('ignores a remembered value it does not know', async () => {
    answered()
    sessionStorage.setItem(PREVIEW_STORAGE_KEY, 'chaos')
    await renderView(<PreviewSwitch />, { user: ADMIN })
    await expect.element(option('Normal')).toBeChecked()
  })
})
