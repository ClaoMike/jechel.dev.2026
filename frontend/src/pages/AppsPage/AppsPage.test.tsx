import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { api, ApiError, type AppDetails, type Page } from '../../services/api'
import { APPS, CATEGORIES, makeApp, pageOf } from '../../test/fixtures/apps'
import { ADMIN, forever, imagesLoaded, renderView, textOf, type RenderViewOptions } from '../../test/render'
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
