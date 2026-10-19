import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { api, ApiError, type AppDetails, type Page } from '../../services/api'
import { signOut } from '../../store/authSlice'
import { a11yViolations } from '../../test/a11y'
import { APPS, CATEGORIES, makeApp, pageOf } from '../../test/fixtures/apps'
import { ADMIN, forever, imagesLoaded, renderView, restMouse, textOf, type RenderViewOptions } from '../../test/render'
import { AppsPage } from './AppsPage'

const renderApps = (options: RenderViewOptions = {}) => renderView(<AppsPage />, { path: '/apps', ...options })
const asAdmin = (options: RenderViewOptions = {}) => renderApps({ user: ADMIN, ...options })

const grid = () => page.getByRole('list', { name: 'Apps' })
const tile = (title: string) => page.getByRole('button', { name: title, exact: true })
const addTile = () => page.getByRole('button', { name: 'Add an app' })
const categoriesButton = () => page.getByRole('button', { name: 'Categories', exact: true })
const loading = () => page.getByRole('status')
const failure = () => page.getByRole('alert')

let list: MockInstance<typeof api.apps.list>
let listCategories: MockInstance<typeof api.apps.listCategories>

beforeEach(() => {
  list = vi.spyOn(api.apps, 'list').mockResolvedValue(pageOf(APPS))
  listCategories = vi.spyOn(api.apps, 'listCategories').mockResolvedValue(CATEGORIES)
})

describe('Apps page, for a visitor', () => {
  it('shows each app as a tile: picture, title, category labels and the description as plain text', async () => {
    await renderApps()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    const lighthouse = tile('LIGHTHOUSE').element().closest('.media-card')!
    expect(lighthouse.querySelector('.fitted-image-main')?.getAttribute('src')).toBe(APPS[0].media[0].url)
    expect(lighthouse.textContent).toContain('Video game')
    expect(lighthouse.textContent).toContain('shine the lighthouse beam and hold off the night')
    expect(lighthouse.textContent).not.toContain('](')
    expect(grid().element().querySelectorAll(':scope > li')).toHaveLength(3)
    // Without an image, a placeholder picture.
    expect(tile('No Picture').element().closest('.media-card')!.querySelector('.media-card-placeholder')).not.toBeNull()
  })

  it('asks for 9 apps a page (a full 3 × 3 grid) and never for the categories list', async () => {
    await renderApps()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    expect(list).toHaveBeenCalledWith(1, 9, expect.anything())
    expect(listCategories).not.toHaveBeenCalled()
  })

  it("has no admin controls: no Add tile, no Categories button, no Edit in an app's popup", async () => {
    await renderApps()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    await expect.element(addTile()).not.toBeInTheDocument()
    await expect.element(categoriesButton()).not.toBeInTheDocument()
    await tile('LIGHTHOUSE').click()
    await expect.element(page.getByRole('dialog', { name: 'LIGHTHOUSE' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Edit' })).not.toBeInTheDocument()
  })

  it("opens an app's details in a popup, and Escape closes it", async () => {
    await renderApps()
    await tile('Pocket Planner').click()
    const dialog = page.getByRole('dialog', { name: 'Pocket Planner' })
    await expect.element(dialog).toBeVisible()
    await expect.poll(() => textOf(dialog)).toContain('Plans your week on your phone.')
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog).not.toBeInTheDocument()
  })

  it('says so when there are no apps yet', async () => {
    list.mockResolvedValue(pageOf<AppDetails>([]))
    await renderApps()
    await expect.element(page.getByText('No apps yet.')).toBeVisible()
    await expect.element(grid()).not.toBeInTheDocument()
  })

  it('shows placeholder tiles, read out as "Loading apps…", until the apps arrive', async () => {
    list.mockReturnValue(forever<Page<AppDetails>>())
    await renderApps()
    await expect.poll(() => textOf(loading())).toContain('Loading apps…')
    expect(document.querySelectorAll('.skeleton-media-grid > *, .loading-shapes .skeleton').length).toBeGreaterThan(0)
    await expect.element(grid()).not.toBeInTheDocument()
    await expect.element(failure()).not.toBeInTheDocument()
  })

  it('shows what failed with "Try again" when the apps can\'t be loaded, and loads them on retry', async () => {
    list.mockRejectedValueOnce(new ApiError('/api/apps', 500))
    await renderApps()
    await expect.poll(() => textOf(failure())).toContain("The apps can't be loaded right now.")
    await expect.element(grid()).not.toBeInTheDocument()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    await expect.element(failure()).not.toBeInTheDocument()
  })

  it('treats a network failure (no answer at all) like any other failure', async () => {
    list.mockRejectedValue(new ApiError('/api/apps', 0))
    await renderApps()
    await expect.poll(() => textOf(failure())).toContain("The apps can't be loaded right now.")
  })

  it('pages through more than 9 apps, with the page in the URL', async () => {
    const all = Array.from({ length: 12 }, (_, i) => makeApp(i + 1))
    list.mockImplementation(async (pageNumber = 1, pageSize = 9) => pageOf(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), { page: pageNumber, pageSize, totalCount: all.length }))
    const view = await renderApps()
    await expect.element(page.getByText('Page 1 of 2')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Previous' })).toBeDisabled()
    await page.getByRole('button', { name: 'Next' }).click()
    await expect.element(tile('App 12')).toBeVisible()
    await expect.element(page.getByText('Page 2 of 2')).toBeVisible()
    expect(view.location()).toBe('/apps?page=2')
    expect(list).toHaveBeenLastCalledWith(2, 9, expect.anything())
    await page.getByRole('button', { name: 'Previous' }).click()
    await expect.element(tile('App 1')).toBeVisible()
    expect(view.location()).toBe('/apps')
  })

  it('opens at the page in the URL, and goes to the last page when that one is past the end', async () => {
    const all = Array.from({ length: 12 }, (_, i) => makeApp(i + 1))
    list.mockImplementation(async (pageNumber = 1, pageSize = 9) => pageOf(all.slice((pageNumber - 1) * pageSize, pageNumber * pageSize), { page: pageNumber, pageSize, totalCount: all.length }))
    const view = await renderApps({ path: '/apps?page=7' })
    await expect.element(tile('App 10')).toBeVisible()
    expect(view.location()).toBe('/apps?page=2')
  })
})

describe('Apps page, for the signed-in admin', () => {
  it('starts the grid with an Add tile, has a Categories button, and asks for 8 apps so the first page stays 3 × 3', async () => {
    await asAdmin()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    const items = grid().element().querySelectorAll(':scope > li')
    expect(items).toHaveLength(4)
    expect(items[0].textContent).toContain('Add an app')
    await expect.element(categoriesButton()).toBeVisible()
    expect(list).toHaveBeenCalledWith(1, 8, expect.anything())
    expect(listCategories).toHaveBeenCalled()
  })

  it('keeps the Add tile when there are no apps (instead of "No apps yet.")', async () => {
    list.mockResolvedValue(pageOf<AppDetails>([]))
    await asAdmin()
    await expect.element(addTile()).toBeVisible()
    await expect.element(page.getByText('No apps yet.')).not.toBeInTheDocument()
  })

  it('opens an empty "Add an app" popup from the Add tile', async () => {
    await asAdmin()
    await addTile().click()
    const dialog = page.getByRole('dialog', { name: 'Add an app' })
    await expect.element(dialog).toBeVisible()
    await expect.element(dialog.getByRole('textbox', { name: 'Title' })).toHaveValue('')
  })

  it('opens the categories popup with the current list from the Categories button', async () => {
    await asAdmin()
    await categoriesButton().click()
    const dialog = page.getByRole('dialog', { name: 'App categories' })
    await expect.element(dialog).toBeVisible()
    await expect.element(dialog.getByRole('textbox').first()).toHaveValue(CATEGORIES[0].name)
    const names = [...dialog.element().querySelectorAll('input')].map((input) => input.value)
    expect(names).toEqual(CATEGORIES.map((c) => c.name))
  })

  it('shows a newly added app in its popup once saved, and the grid reloads with it', async () => {
    const added = makeApp(9, { title: 'Brand New', description: 'Just added.' })
    const create = vi.spyOn(api.apps, 'create').mockResolvedValue(added)
    await asAdmin()
    await addTile().click()
    const dialog = page.getByRole('dialog', { name: 'Add an app' })
    await dialog.getByRole('textbox', { name: 'Title' }).fill('Brand New')
    list.mockResolvedValue(pageOf([added, ...APPS]))
    await dialog.getByRole('button', { name: 'Add app' }).click()
    await expect.element(page.getByRole('dialog', { name: 'Brand New' })).toBeVisible()
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Brand New' }))
    await userEvent.keyboard('{Escape}')
    await expect.element(tile('Brand New')).toBeVisible()
  })

  it('closes the categories popup with Cancel, saving nothing', async () => {
    const save = vi.spyOn(api.apps, 'saveCategories')
    await asAdmin()
    await categoriesButton().click()
    const dialog = page.getByRole('dialog', { name: 'App categories' })
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(dialog).not.toBeInTheDocument()
    expect(save).not.toHaveBeenCalled()
  })

  it("offers Edit in an app's popup", async () => {
    await asAdmin()
    await tile('LIGHTHOUSE').click()
    await expect.element(page.getByRole('dialog', { name: 'LIGHTHOUSE' }).getByRole('button', { name: 'Edit' })).toBeVisible()
  })

  it('still shows the error, with its admin controls kept out of the way, when the apps fail to load', async () => {
    list.mockRejectedValue(new ApiError('/api/apps', 500))
    await asAdmin()
    await expect.poll(() => textOf(failure())).toContain("The apps can't be loaded right now.")
    await expect.element(categoriesButton()).toBeVisible()
  })
})

describe("Apps page, the admin's edit and delete", () => {
  it('saves an edited app, and its popup and tile show the new version', async () => {
    const edited = { ...APPS[0], title: 'LIGHTHOUSE II' }
    const update = vi.spyOn(api.apps, 'update').mockResolvedValue(edited)
    await asAdmin()
    await tile('LIGHTHOUSE').click()
    await page.getByRole('button', { name: 'Edit' }).click()
    const title = page.getByRole('textbox', { name: 'Title' })
    await expect.element(title).toHaveValue('LIGHTHOUSE')
    await title.fill('LIGHTHOUSE II')
    list.mockResolvedValue(pageOf([edited, ...APPS.slice(1)]))
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect.element(page.getByRole('dialog', { name: 'LIGHTHOUSE II' })).toBeVisible()
    expect(update).toHaveBeenCalledWith(1, expect.objectContaining({ title: 'LIGHTHOUSE II', categoryIds: [3] }))
    await userEvent.keyboard('{Escape}')
    await expect.element(tile('LIGHTHOUSE II')).toBeVisible()
  })

  it('shows the API\'s field errors under the fields when a save is rejected, and keeps the popup open', async () => {
    vi.spyOn(api.apps, 'create').mockRejectedValue(new ApiError('/api/apps', 400, { title: ['Give the app a title.'] }))
    await asAdmin()
    await addTile().click()
    const dialog = page.getByRole('dialog', { name: 'Add an app' })
    await dialog.getByRole('button', { name: 'Add app' }).click()
    await expect.poll(() => textOf(dialog)).toContain('Give the app a title.')
    await expect.poll(() => textOf(dialog.getByRole('alert'))).toContain('Some fields need fixing.')
    await expect.element(dialog).toBeVisible()
  })

  it('says the session ended when a save comes back 401', async () => {
    vi.spyOn(api.apps, 'create').mockRejectedValue(new ApiError('/api/apps', 401))
    await asAdmin()
    await addTile().click()
    const dialog = page.getByRole('dialog', { name: 'Add an app' })
    await dialog.getByRole('textbox', { name: 'Title' }).fill('Anything')
    await dialog.getByRole('button', { name: 'Add app' }).click()
    await expect.poll(() => textOf(dialog.getByRole('alert'))).toContain('Your session has ended. Sign in again, then save.')
  })

  it('deletes an app after confirming, and it leaves the grid', async () => {
    const remove = vi.spyOn(api.apps, 'delete').mockResolvedValue()
    await asAdmin()
    await tile('LIGHTHOUSE').click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Delete app' }).click()
    const confirm = page.getByRole('dialog', { name: 'Delete LIGHTHOUSE?' })
    await expect.element(confirm).toBeVisible()
    // Cancel has the focus, so Enter on its own never deletes.
    await expect.element(confirm.getByRole('button', { name: 'Cancel' })).toHaveFocus()
    list.mockResolvedValue(pageOf(APPS.slice(1)))
    await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
    expect(remove).toHaveBeenCalledWith(1)
    await expect.element(tile('LIGHTHOUSE')).not.toBeInTheDocument()
    await expect.element(tile('Pocket Planner')).toBeVisible()
  })

  it('cancelling a delete keeps the app', async () => {
    const remove = vi.spyOn(api.apps, 'delete')
    await asAdmin()
    await tile('LIGHTHOUSE').click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('button', { name: 'Delete app' }).click()
    await page.getByRole('dialog', { name: 'Delete LIGHTHOUSE?' }).getByRole('button', { name: 'Cancel' }).click()
    await expect.element(page.getByRole('dialog', { name: 'Delete LIGHTHOUSE?' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('dialog', { name: 'Edit LIGHTHOUSE' })).toBeVisible()
    expect(remove).not.toHaveBeenCalled()
  })

  it('asks before closing an edit with unsaved changes', async () => {
    await asAdmin()
    await tile('LIGHTHOUSE').click()
    await page.getByRole('button', { name: 'Edit' }).click()
    await page.getByRole('textbox', { name: 'Title' }).fill('Changed')
    await page.getByRole('button', { name: 'Close' }).first().click()
    const discard = page.getByRole('dialog', { name: 'Discard your changes?' })
    await expect.element(discard).toBeVisible()
    await discard.getByRole('button', { name: 'Discard' }).click()
    await expect.element(page.getByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('Apps page, when the session ends', () => {
  it('drops the admin controls and shows the visitor grid (9 a page)', async () => {
    const view = await asAdmin()
    await expect.element(addTile()).toBeVisible()
    view.store.dispatch(signOut.fulfilled(undefined, 'test'))
    await expect.element(addTile()).not.toBeInTheDocument()
    await expect.element(categoriesButton()).not.toBeInTheDocument()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    await expect.poll(() => list.mock.lastCall?.[1]).toBe(9)
  })
})

describe('Apps page, keyboard and accessibility', () => {
  it('gives the focus back to the tile when its popup closes', async () => {
    await renderApps()
    await tile('Pocket Planner').click()
    await expect.element(page.getByRole('dialog', { name: 'Pocket Planner' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(tile('Pocket Planner')).toHaveFocus()
  })

  it('opens a popup from the keyboard (Tab to a tile, Enter)', async () => {
    await renderApps()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    tile('LIGHTHOUSE').element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('dialog', { name: 'LIGHTHOUSE' })).toBeVisible()
  })

  for (const theme of THEMES) {
    it(`has no WCAG 2.1 AA problems in ${theme}: grid, admin grid, popup, loading, error`, async () => {
      await renderApps({ theme })
      await expect.element(tile('LIGHTHOUSE')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await tile('LIGHTHOUSE').click()
      await expect.element(page.getByRole('dialog', { name: 'LIGHTHOUSE' })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })

    it(`has no WCAG 2.1 AA problems in ${theme} for the admin, and while loading or failed`, async () => {
      await asAdmin({ theme })
      await expect.element(addTile()).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      list.mockReturnValue(forever<Page<AppDetails>>())
      await renderApps({ theme, path: '/apps?page=3' })
      await expect.element(loading()).toBeInTheDocument()
      expect(await a11yViolations()).toEqual([])
    })

    it(`has no WCAG 2.1 AA problems in ${theme} when the apps can't be loaded`, async () => {
      list.mockRejectedValue(new ApiError('/api/apps', 500))
      await renderApps({ theme })
      await expect.element(failure()).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})

describe('Apps page, unusual content', () => {
  it('cuts a long title after two lines and a long description after three, with the rest still in the text', async () => {
    const long = makeApp(1, { title: 'A really long app title '.repeat(6).trim(), description: 'A sentence that goes on. '.repeat(30).trim() })
    list.mockResolvedValue(pageOf([long]))
    await renderApps()
    await expect.element(page.getByRole('button', { name: /^A really long app title/ })).toBeVisible()
    const card = page.getByRole('button', { name: /^A really long app title/ }).element().closest('.media-card')!
    const title = card.querySelector<HTMLElement>('.media-card-title')!
    const description = card.querySelector<HTMLElement>('.media-card-description')!
    const lines = (el: HTMLElement) => Math.round(el.clientHeight / Number.parseFloat(getComputedStyle(el).lineHeight))
    expect(lines(title)).toBe(2)
    expect(lines(description)).toBe(3)
    expect(title.textContent).toBe(long.title)
    expect(description.textContent).toBe(long.description)
    // The grid keeps its columns: a long card isn't wider than the others would be.
    expect(card.getBoundingClientRect().width).toBeLessThan(300)
  })

  it("uses a YouTube video's thumbnail when an app has no image", async () => {
    const trailer = makeApp(1, { title: 'Trailer Only', media: [{ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' }] })
    list.mockResolvedValue(pageOf([trailer]))
    await renderApps()
    const image = tile('Trailer Only').element().closest('.media-card')!.querySelector('.fitted-image-main')
    expect(image?.getAttribute('src')).toBe('https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg')
  })

  it('fits wide and tall pictures inside the same frame, whole', async () => {
    await renderApps()
    await expect.element(tile('LIGHTHOUSE')).toBeVisible()
    await restMouse()
    await imagesLoaded()
    for (const name of ['LIGHTHOUSE', 'Pocket Planner']) {
      const card = tile(name).element().closest('.media-card')!
      const frame = card.querySelector('.media-card-image')!.getBoundingClientRect()
      const image = card.querySelector('.fitted-image-main')!.getBoundingClientRect()
      expect(image.width).toBeLessThanOrEqual(frame.width + 0.5)
      expect(image.height).toBeLessThanOrEqual(frame.height + 0.5)
      // Touches the frame on at least one side: scaled to fit, not left small.
      expect(Math.max(image.width / frame.width, image.height / frame.height)).toBeGreaterThan(0.98)
    }
    const frames = ['LIGHTHOUSE', 'Pocket Planner'].map((name) => tile(name).element().closest('.media-card')!.querySelector('.media-card-image')!.getBoundingClientRect().height)
    expect(frames[0]).toBe(frames[1])
  })
})

/**
 * What the page looks like, in every theme, for a visitor and for the admin, loaded, loading, empty
 * and failed, on a desktop and on a phone. The reference images are in __screenshots__ (committed);
 * after an intended change, `npm run test:update` writes new ones to review.
 */
describe('Apps page, screenshots', () => {
  afterEach(async () => {
    await page.viewport(1280, 900)
  })

  const shot = async (name: string) => {
    await restMouse()
    await imagesLoaded()
    await expect.element(page.getByRole('main')).toMatchScreenshot(name)
  }

  for (const theme of THEMES) {
    describe(`${theme} theme`, () => {
      it('visitor, loaded', async () => {
        await renderApps({ theme })
        await expect.element(tile('LIGHTHOUSE')).toBeVisible()
        await shot(`${theme}-visitor`)
      })

      it('admin, loaded', async () => {
        await asAdmin({ theme })
        await expect.element(tile('LIGHTHOUSE')).toBeVisible()
        await shot(`${theme}-admin`)
      })

      it('loading', async () => {
        list.mockReturnValue(forever<Page<AppDetails>>())
        await renderApps({ theme })
        await expect.element(loading()).toBeInTheDocument()
        await shot(`${theme}-loading`)
      })

      it('failed', async () => {
        list.mockRejectedValue(new ApiError('/api/apps', 500))
        await renderApps({ theme })
        await expect.element(failure()).toBeVisible()
        await shot(`${theme}-error`)
      })

      it('empty', async () => {
        list.mockResolvedValue(pageOf<AppDetails>([]))
        await renderApps({ theme })
        await expect.element(page.getByText('No apps yet.')).toBeVisible()
        await shot(`${theme}-empty`)
      })

      it('app popup', async () => {
        await renderApps({ theme })
        await tile('LIGHTHOUSE').click()
        const dialog = page.getByRole('dialog', { name: 'LIGHTHOUSE' })
        await expect.element(dialog).toBeVisible()
        await imagesLoaded()
        await expect.element(dialog).toMatchScreenshot(`${theme}-popup`)
      })

      it('phone', async () => {
        await page.viewport(390, 844)
        await renderApps({ theme })
        await expect.element(tile('LIGHTHOUSE')).toBeVisible()
        await shot(`${theme}-phone`)
      })
    })
  }
})
