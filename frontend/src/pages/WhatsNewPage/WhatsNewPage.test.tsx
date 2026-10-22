import { afterEach, describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { ApiError } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi, type ApiStubs } from '../../test/api'
import { APPS, makeApp, pageOf } from '../../test/fixtures/apps'
import { makeVideo, pageOfVideos, SITE, VIDEOS } from '../../test/fixtures/site'
import { ADMIN, forever, renderView, shootWhole, textOf, type RenderViewOptions } from '../../test/render'
import { RefreshVideosButton } from '../../features/youtube/RefreshVideosButton/RefreshVideosButton'
import { saveSite } from '../../store/siteSlice'
import { WhatsNewPage } from './WhatsNewPage'

let api: ApiStubs
// Every section visible to visitors, unless a test says otherwise.
const renderWhatsNew = (options: RenderViewOptions = {}) => renderView(<WhatsNewPage />, { site: SITE, ...options })
const siteWith = (pages: Partial<typeof SITE.pages>) => ({ ...SITE, pages: { ...SITE.pages, ...pages } })
const NEWER_APP = () => pageOf([makeApp(1, { ...APPS[0], createdAt: '2026-10-15T09:00:00Z' })])
const card = () => page.getByRole('article')

describe("What's new?", () => {
  afterEach(() => {
    api = undefined!
  })

  it('shows the newest app in full when it came after the newest video', async () => {
    api = stubApi()
    api.apps.list.mockResolvedValue(pageOf([makeApp(1, { ...APPS[0], createdAt: '2026-10-15T09:00:00Z' })]))
    await renderWhatsNew()
    await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')
    await expect.poll(() => document.querySelector('.whats-new-kind')?.textContent).toBe('New app · 15 Oct 2026')
    expect(document.querySelector('.whats-new-kind time')?.getAttribute('datetime')).toBe('2026-10-15T09:00:00Z')
    await expect.poll(() => document.querySelector('.whats-new-header .app-categories')?.textContent).toBe('Video game')
    await expect.element(card().getByRole('region', { name: 'LIGHTHOUSE: images and videos' })).toBeVisible()
    await expect.element(card().getByRole('link', { name: 'lighthouse beam' })).toBeVisible()
    await expect.element(card().getByRole('list', { name: 'Runs on' })).toBeVisible()
    await expect.element(card().getByRole('link', { name: 'Check it on App Store' })).toHaveAttribute('target', '_blank')
    // Only the first item of each list is asked for.
    expect(api.apps.list).toHaveBeenCalledWith(1, 1, expect.anything())
    expect(api.youtube.listVideos).toHaveBeenCalledWith(1, 1, expect.anything())
  })

  it('shows the newest video, to watch here, when it came last', async () => {
    api = stubApi()
    api.apps.list.mockResolvedValue(pageOf([makeApp(1, { createdAt: '2026-01-01T00:00:00Z' })]))
    await renderWhatsNew()
    await expect.element(card()).toHaveAccessibleName(VIDEOS[0].title)
    await expect.poll(() => document.querySelector('.whats-new-kind')?.textContent).toBe('New video · 12 Oct 2026')
    const player = card().element().querySelector('iframe')!
    expect(player.src).toBe(`https://www.youtube-nocookie.com/embed/${VIDEOS[0].id}`)
    expect(player.title).toBe(VIDEOS[0].title)
    expect(player.getAttribute('loading')).toBe('lazy')
    await expect.element(card().getByRole('link', { name: 'https://example.com/1' })).toBeVisible()
    await expect.element(card().getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', VIDEOS[0].url)
  })

  it('leaves out the description of a video without one', async () => {
    api = stubApi()
    api.apps.list.mockResolvedValue(pageOf([]))
    api.youtube.listVideos.mockResolvedValue(pageOfVideos([makeVideo(5, { description: '' })]))
    await renderWhatsNew()
    await expect.element(card().getByRole('link', { name: 'Watch on YouTube' })).toBeVisible()
    expect(card().element().querySelector('.app-description')).toBeNull()
  })

  it('shows the other when one list fails (e.g. YouTube is not set up)', async () => {
    api = stubApi()
    api.youtube.listVideos.mockRejectedValue(new ApiError('/api/youtube', 503))
    await renderWhatsNew()
    await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')
  })

  it('says so when there is nothing yet', async () => {
    api = stubApi()
    api.apps.list.mockResolvedValue(pageOf([]))
    api.youtube.listVideos.mockResolvedValue(pageOfVideos([]))
    await renderWhatsNew()
    await expect.element(page.getByText('Nothing here yet. New apps and videos will show up here.')).toBeVisible()
  })

  it('says it failed when both lists fail, or one fails and the other is empty, and retries', async () => {
    api = stubApi()
    api.apps.list.mockResolvedValue(pageOf([]))
    api.youtube.listVideos.mockRejectedValue(new ApiError('/api/youtube', 503))
    await renderWhatsNew()
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The newest app and video can't be loaded right now.")
    api.youtube.listVideos.mockResolvedValue(pageOfVideos())
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(card()).toBeVisible()
  })

  describe('only from the sections visitors may see', () => {
    it('shows the newest video when Apps is hidden, though an app came later, and never asks for apps', async () => {
      api = stubApi()
      api.apps.list.mockResolvedValue(NEWER_APP())
      await renderWhatsNew({ site: siteWith({ apps: false }) })
      await expect.element(card()).toHaveAccessibleName(VIDEOS[0].title)
      expect(api.apps.list).not.toHaveBeenCalled()
    })

    it('shows the newest app when YouTube is hidden, though a video came later, and never asks for videos', async () => {
      api = stubApi()
      api.apps.list.mockResolvedValue(pageOf([makeApp(1, { ...APPS[0], createdAt: '2026-01-01T00:00:00Z' })]))
      await renderWhatsNew({ site: siteWith({ youtube: false }) })
      await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')
      expect(api.youtube.listVideos).not.toHaveBeenCalled()
    })

    it('has nothing to show when both are hidden, and asks for neither', async () => {
      api = stubApi()
      await renderWhatsNew({ site: siteWith({ apps: false, youtube: false }) })
      await expect.element(page.getByText('Nothing here yet. New apps and videos will show up here.')).toBeVisible()
      expect(api.apps.list).not.toHaveBeenCalled()
      expect(api.youtube.listVideos).not.toHaveBeenCalled()
    })

    it('says it failed, naming only what it shows, when the only section visitors may see fails', async () => {
      api = stubApi()
      api.youtube.listVideos.mockRejectedValue(new ApiError('/api/youtube', 503))
      await renderWhatsNew({ site: siteWith({ apps: false }) })
      await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The newest video can't be loaded right now.")
    })

    it('names only apps when YouTube is hidden: empty, and failed', async () => {
      api = stubApi()
      api.apps.list.mockResolvedValue(pageOf([]))
      const empty = await renderWhatsNew({ site: siteWith({ youtube: false }) })
      await expect.element(page.getByText('Nothing here yet. New apps will show up here.')).toBeVisible()
      await empty.unmount()

      api.apps.list.mockRejectedValue(new ApiError('/api/apps', 500))
      await renderWhatsNew({ site: siteWith({ youtube: false }) })
      await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The newest app can't be loaded right now.")
    })

    it('names only videos when Apps is hidden and there are none yet', async () => {
      api = stubApi()
      api.youtube.listVideos.mockResolvedValue(pageOfVideos([]))
      await renderWhatsNew({ site: siteWith({ apps: false }) })
      await expect.element(page.getByText('Nothing here yet. New videos will show up here.')).toBeVisible()
    })

    describe('for the admin: what visitors see, and what is left out', () => {
      const note = () => document.querySelector('.whats-new-admin-note')?.textContent ?? null

      it('shows the newest video when Apps is hidden, though an app came later, and says why', async () => {
        api = stubApi({ user: ADMIN })
        api.apps.list.mockResolvedValue(NEWER_APP())
        await renderWhatsNew({ user: ADMIN, site: siteWith({ apps: false }) })
        await expect.element(card()).toHaveAccessibleName(VIDEOS[0].title)
        expect(note()).toBe('As visitors see it: Apps is hidden from them (Settings → Visitor pages), so only videos count.')
        expect(api.apps.list).not.toHaveBeenCalled()
      })

      it('shows the newest app when YouTube is hidden, and says why', async () => {
        api = stubApi({ user: ADMIN })
        api.apps.list.mockResolvedValue(pageOf([makeApp(1, { ...APPS[0], createdAt: '2026-01-01T00:00:00Z' })]))
        await renderWhatsNew({ user: ADMIN, site: siteWith({ youtube: false }) })
        await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')
        expect(note()).toBe('As visitors see it: YouTube is hidden from them (Settings → Visitor pages), so only apps count.')
      })

      it('has nothing to show when both are hidden, and says so', async () => {
        api = stubApi({ user: ADMIN })
        await renderWhatsNew({ user: ADMIN, site: siteWith({ apps: false, youtube: false }) })
        await expect.element(page.getByText('Nothing here yet. New apps and videos will show up here.')).toBeVisible()
        expect(note()).toBe("Apps and YouTube are hidden from visitors (Settings → Visitor pages), so What's new? has nothing to show them.")
      })

      it('says nothing when both are visible: the newest of the two shows', async () => {
        api = stubApi({ user: ADMIN })
        api.apps.list.mockResolvedValue(NEWER_APP())
        await renderWhatsNew({ user: ADMIN })
        await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')
        expect(note()).toBeNull()
      })

      it('never shows the note to visitors', async () => {
        api = stubApi()
        await renderWhatsNew({ site: siteWith({ apps: false }) })
        await expect.element(card()).toBeVisible()
        expect(note()).toBeNull()
      })

      it('follows a switch flipped in Settings at once', async () => {
        api = stubApi({ user: ADMIN })
        api.apps.list.mockResolvedValue(NEWER_APP())
        const view = await renderWhatsNew({ user: ADMIN })
        await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')

        view.store.dispatch(saveSite.fulfilled(siteWith({ apps: false }), 'test', { pages: { apps: false } }))

        await expect.element(card()).toHaveAccessibleName(VIDEOS[0].title)
        expect(note()).toContain('Apps is hidden')
      })
    })

    it('shows the app when an app and a video came at the same moment', async () => {
      api = stubApi()
      api.apps.list.mockResolvedValue(pageOf([makeApp(1, { ...APPS[0], createdAt: VIDEOS[0].publishedAt })]))
      await renderWhatsNew()
      await expect.element(card()).toHaveAccessibleName('LIGHTHOUSE')
    })

    it("shows a video the admin just refreshed from YouTube", async () => {
      api = stubApi({ user: ADMIN })
      api.apps.list.mockResolvedValue(pageOf([makeApp(1, { ...APPS[0], createdAt: '2026-01-01T00:00:00Z' })]))
      await renderView(
        <>
          <RefreshVideosButton />
          <WhatsNewPage />
        </>,
        { user: ADMIN, site: SITE },
      )
      await expect.element(card()).toHaveAccessibleName(VIDEOS[0].title)
      api.youtube.listVideos.mockResolvedValue(pageOfVideos([makeVideo(99, { title: 'Just uploaded', publishedAt: '2026-10-20T18:00:00Z' })]))
      await page.getByRole('button', { name: 'Refresh from YouTube' }).click()
      await expect.element(card()).toHaveAccessibleName('Just uploaded')
    })

    it('waits (placeholders) until it knows what visitors may see, asking for nothing meanwhile', async () => {
      api = stubApi()
      await renderView(<WhatsNewPage />)
      await expect.poll(() => textOf(page.getByRole('status'))).toBe("Loading what's new…")
      expect(api.apps.list).not.toHaveBeenCalled()
      expect(api.youtube.listVideos).not.toHaveBeenCalled()
    })
  })

  it("shows the newest item's shape while loading", async () => {
    api = stubApi()
    api.apps.list.mockReturnValue(forever())
    await renderWhatsNew()
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("Loading what's new…")
    await expect.element(page.getByRole('region', { name: "What's new?" })).toBeVisible()
  })
})

describe("What's new?, screenshots and accessibility", () => {
  for (const theme of THEMES) {
    it(`${theme}: an app, a video, loading and failed`, async () => {
      api = stubApi()
      api.apps.list.mockResolvedValue(pageOf([makeApp(1, { ...APPS[0], createdAt: '2026-10-15T09:00:00Z' })]))
      const app = await renderWhatsNew({ theme })
      await expect.element(card()).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-app`)
      await app.unmount()

      // The player itself comes from YouTube: the screenshot is of everything else.
      api.apps.list.mockResolvedValue(pageOf([]))
      const video = await renderWhatsNew({ theme })
      await expect.element(card()).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      for (const iframe of document.querySelectorAll('iframe')) iframe.removeAttribute('src')
      await shootWhole(page.getByRole('main'), `${theme}-video`)
      await video.unmount()

      api.apps.list.mockReturnValue(forever())
      const loading = await renderWhatsNew({ theme })
      await expect.element(page.getByRole('status')).toBeInTheDocument()
      await shootWhole(page.getByRole('main'), `${theme}-loading`)
      await loading.unmount()

      api.apps.list.mockRejectedValue(new ApiError('/api/apps', 500))
      api.youtube.listVideos.mockRejectedValue(new ApiError('/api/youtube', 500))
      await renderWhatsNew({ theme })
      await expect.element(page.getByRole('alert')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await shootWhole(page.getByRole('main'), `${theme}-error`)
    })
  }
})
