import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { api, ApiError, type AppCategory, type AppDetails } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { APPS, CATEGORIES } from '@/test/fixtures/apps'
import { ADMIN, renderView, textOf } from '@/test/render'
import { AppDialog } from './AppDialog/AppDialog'
import { CategoriesDialog } from './CategoriesDialog/CategoriesDialog'

function renderNewApp({
  categories = CATEGORIES,
  onClose = vi.fn(),
  onSaved = vi.fn(),
}: { categories?: AppCategory[]; onClose?: () => void; onSaved?: (app: AppDetails) => void } = {}) {
  return renderView(<AppDialog app={null} categories={categories} canEdit onClose={onClose} onSaved={onSaved} onDeleted={vi.fn()} />, { user: ADMIN })
}

const dialog = () => page.getByRole('dialog', { name: 'Add an app' })
const saved = (create: ReturnType<typeof vi.spyOn>) => (create.mock.calls[0] as unknown[])[0]
const stubCreate = () => vi.spyOn(api.apps, 'create').mockImplementation(async (app) => ({ ...APPS[0], ...app, categories: [], id: 99 }))
const kindOfApp = () => dialog().getByRole('group', { name: 'Kind of app' })
const runsOn = () => dialog().getByRole('group', { name: 'Runs on' })
const whereToGet = () => dialog().getByRole('group', { name: 'Check it on…' })
const media = () => dialog().getByRole('group', { name: 'Images and videos' })

describe("the app form's categories", () => {
  it("toggles categories, keeping them in the list's order", async () => {
    const create = stubCreate()
    await renderNewApp()
    await dialog().getByRole('textbox', { name: 'Title' }).fill('X')
    await kindOfApp().getByRole('button', { name: 'Video game' }).click()
    await kindOfApp().getByRole('button', { name: 'Mobile app' }).click()
    await expect.element(kindOfApp().getByRole('button', { name: 'Mobile app' })).toHaveAttribute('aria-pressed', 'true')
    await kindOfApp().getByRole('button', { name: 'Website' }).click()
    await kindOfApp().getByRole('button', { name: 'Website' }).click()
    await dialog().getByRole('button', { name: 'Add app' }).click()
    expect(saved(create)).toMatchObject({ categoryIds: [1, 3] })
  })

  it('says how to add categories when there are none', async () => {
    await renderNewApp({ categories: [] })
    await expect.element(kindOfApp().getByText('No categories yet: add them with Categories, above the apps.')).toBeVisible()
  })
})

describe("the app form's platforms", () => {
  it('toggles the common ones, and adds another once (whatever its case), with the button or Enter', async () => {
    const create = stubCreate()
    await renderNewApp()
    await dialog().getByRole('textbox', { name: 'Title' }).fill('X')
    await runsOn().getByRole('button', { name: 'iOS' }).click()
    await runsOn().getByRole('button', { name: 'Steam Deck' }).click()
    await runsOn().getByRole('button', { name: 'iOS' }).click()
    await runsOn().getByRole('textbox', { name: 'Another platform' }).fill(' Meta Quest ')
    await runsOn().getByRole('button', { name: 'Add platform' }).click()
    await expect.element(runsOn().getByRole('button', { name: 'Meta Quest' })).toHaveAttribute('aria-pressed', 'true')
    await expect.element(runsOn().getByRole('textbox', { name: 'Another platform' })).toHaveValue('')
    await runsOn().getByRole('textbox', { name: 'Another platform' }).fill('meta quest')
    await userEvent.keyboard('{Enter}')
    await runsOn().getByRole('textbox', { name: 'Another platform' }).fill('Apple TV')
    await userEvent.keyboard('{Enter}')
    // Enter added it, it didn't submit the app.
    expect(create).not.toHaveBeenCalled()
    await dialog().getByRole('button', { name: 'Add app' }).click()
    expect(saved(create)).toMatchObject({ platforms: ['Steam Deck', 'Meta Quest', 'Apple TV'] })
  })
})

describe("the app form's store links", () => {
  it('adds links with suggested store names, removes one after asking, and shows their errors', async () => {
    const create = vi.spyOn(api.apps, 'create').mockRejectedValueOnce(new ApiError('/api/apps', 400, { 'links[0].url': ['Not a link.'], links: ['Too many.'] }))
    await renderNewApp()
    await dialog().getByRole('textbox', { name: 'Title' }).fill('X')
    await whereToGet().getByRole('button', { name: 'Add a link' }).click()
    await whereToGet().getByRole('button', { name: 'Add a link' }).click()
    const label = whereToGet().getByRole('combobox', { name: 'Check it on… (link 1)' })
    expect((label.element() as HTMLInputElement).list?.querySelectorAll('option').length).toBeGreaterThan(5)
    await label.fill('Steam')
    await whereToGet().getByRole('textbox', { name: 'Address (link 1)' }).fill('steam')
    await whereToGet().getByRole('button', { name: 'Remove link 2' }).click()
    await page.getByRole('dialog', { name: 'Remove link 2?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await dialog().getByRole('button', { name: 'Add app' }).click()
    expect(saved(create)).toMatchObject({ links: [{ label: 'Steam', url: 'steam' }] })
    await expect.element(whereToGet().getByRole('textbox', { name: 'Address (link 1)' })).toHaveAccessibleDescription('Not a link.')
    await expect.element(whereToGet().getByText('Too many.')).toBeVisible()
    await expect.poll(() => textOf(dialog().getByRole('alert').last())).toBe('Some fields need fixing.')
  })
})

describe("the app form's images and videos", () => {
  it('adds media from a link: a YouTube video, an image elsewhere; refuses what is not a link', async () => {
    const create = stubCreate()
    await renderNewApp()
    await dialog().getByRole('textbox', { name: 'Title' }).fill('X')
    const link = media().getByRole('textbox', { name: 'Or add from a link' })
    await link.fill('youtube.com')
    await media().getByRole('button', { name: 'Add link' }).click()
    await expect.element(link).toHaveAccessibleDescription('That should be a link starting with https://.')
    await link.fill('https://youtu.be/dQw4w9WgXcQ')
    await expect.element(link).not.toHaveAttribute('aria-invalid')
    await userEvent.keyboard('{Enter}')
    await link.fill('https://cdn.example.com/shot.png')
    await media().getByRole('button', { name: 'Add link' }).click()
    await expect.poll(() => [...media().element().querySelectorAll('.media-list-label')].map((l) => l.textContent)).toEqual(['1. YouTube', '2. Image'])
    await dialog().getByRole('button', { name: 'Add app' }).click()
    expect(saved(create)).toMatchObject({
      media: [
        { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' },
        { url: 'https://cdn.example.com/shot.png', kind: 'image' },
      ],
    })
  })

  it('uploads several files one after another, showing which one and how far; reports the ones that failed', async () => {
    const upload = vi
      .spyOn(api.files, 'uploadAppMedia')
      .mockImplementationOnce(async (_, progress) => {
        progress?.(0.5)
        return { url: '/api/files/app-media/a.webp', fileName: 'a.webp', kind: 'image' }
      })
      .mockRejectedValueOnce(new ApiError('/api/files/app-media', 400, { file: ['Not a picture.'] }))
      .mockRejectedValueOnce(new ApiError('/api/files/app-media', 401))
    await renderNewApp()
    const png = (name: string) => new File([new Uint8Array(10)], name, { type: 'image/png' })
    await media()
      .getByLabelText('Image or video files')
      .upload([png('a.png'), png('b.png'), png('c.png')])
    await expect
      .poll(() =>
        media()
          .getByRole('alert')
          .elements()
          .map((e) => e.textContent),
      )
      .toEqual(['b.png: Not a picture.', 'c.png: your session has ended. Sign in again, then upload.'])
    expect(upload).toHaveBeenCalledTimes(3)
    await expect.element(media().getByRole('button', { name: 'Upload images or videos' })).toBeEnabled()
    await expect.poll(() => [...media().element().querySelectorAll('.media-list-label')].map((l) => l.textContent)).toEqual(['1. Image'])
  })

  it('refuses an image over 15 MB before sending it', async () => {
    const upload = vi.spyOn(api.files, 'uploadAppMedia')
    await renderNewApp()
    await media()
      .getByLabelText('Image or video files')
      .upload(new File([new Uint8Array(16 * 1024 * 1024)], 'huge.png', { type: 'image/png' }))
    await expect.poll(() => textOf(media().getByRole('alert'))).toBe('huge.png is 16 MB; the limit is 15 MB.')
    expect(upload).not.toHaveBeenCalled()
  })

  it('reorders with the arrow keys on a handle (saying where it went), and removes after asking', async () => {
    const update = vi.spyOn(api.apps, 'update').mockImplementation(async (_, app) => ({ ...APPS[0], ...app, categories: [] }))
    const app: AppDetails = {
      ...APPS[0],
      media: [
        { url: '/a.png', kind: 'image' },
        { url: '/b.mp4', kind: 'video' },
        { url: 'https://youtu.be/dQw4w9WgXcQ', kind: 'youtube' },
      ],
    }
    await renderView(<AppDialog app={app} categories={CATEGORIES} canEdit onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />, { user: ADMIN })
    await page.getByRole('button', { name: 'Edit' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit LIGHTHOUSE' })
    ;(edit.getByRole('button', { name: 'Reorder image 1' }).element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect.poll(() => edit.element().querySelector('[aria-live="polite"]')?.textContent).toBe('Moved to position 2 of 3.')
    await edit.getByRole('button', { name: 'Remove YouTube video 3' }).click()
    await page.getByRole('dialog', { name: 'Remove YouTube video 3?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await edit.getByRole('button', { name: 'Save', exact: true }).click()
    expect((update.mock.calls[0] as unknown[])[1]).toMatchObject({
      media: [
        { url: '/b.mp4', kind: 'video' },
        { url: '/a.png', kind: 'image' },
      ],
    })
  })
})

describe("the app form's What's new? switch", () => {
  const whatsNew = () => page.getByRole('group', { name: "Show in What's new?" })

  it('is on for a new app, and saves it off when switched off', async () => {
    const create = stubCreate()
    await renderNewApp()
    await dialog().getByRole('textbox', { name: 'Title' }).fill('X')
    await expect.element(whatsNew().getByRole('radio', { name: 'On' })).toBeChecked()
    await whatsNew().getByText('Off').click()
    await dialog().getByRole('button', { name: 'Add app' }).click()
    expect(saved(create)).toMatchObject({ showInWhatsNew: false })
  })

  it("shows an app's own setting when editing it, and saves the change", async () => {
    const update = vi.spyOn(api.apps, 'update').mockImplementation(async (_, app) => ({ ...APPS[0], ...app, categories: [] }))
    await renderView(<AppDialog app={{ ...APPS[0], showInWhatsNew: false }} categories={CATEGORIES} canEdit onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />, {
      user: ADMIN,
    })
    await page.getByRole('button', { name: 'Edit' }).click()
    await expect.element(whatsNew().getByRole('radio', { name: 'Off' })).toBeChecked()
    await whatsNew().getByText('On').click()
    await page.getByRole('dialog', { name: 'Edit LIGHTHOUSE' }).getByRole('button', { name: 'Save', exact: true }).click()
    expect((update.mock.calls[0] as unknown[])[1]).toMatchObject({ showInWhatsNew: true })
  })
})

describe('the app popup, closing', () => {
  it('closes a new, untouched app at once, and asks first once something is typed', async () => {
    const onClose = vi.fn()
    await renderNewApp({ onClose })
    await dialog().getByRole('button', { name: 'Cancel' }).click()
    expect(onClose).toHaveBeenCalledTimes(1)
    await dialog().getByRole('textbox', { name: 'Title' }).fill('Half done')
    await dialog().getByRole('button', { name: 'Close' }).click()
    const discard = page.getByRole('dialog', { name: 'Discard your changes?' })
    await expect.element(discard.getByText("What you changed in this app isn't saved.")).toBeVisible()
    await discard.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(dialog()).toBeVisible()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has no WCAG problems in the form', async () => {
    await renderView(<AppDialog app={null} categories={CATEGORIES} canEdit onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />, { user: ADMIN, theme: 'light' })
    expect(await a11yViolations()).toEqual([])
  })
})

describe('the categories popup', () => {
  const categories = () => page.getByRole('dialog', { name: 'App categories' })
  const renderCategories = (onClose = vi.fn(), onSaved = vi.fn()) => renderView(<CategoriesDialog categories={CATEGORIES} onClose={onClose} onSaved={onSaved} />, { user: ADMIN })

  it('renames, reorders, adds and removes categories, then saves them together', async () => {
    const save = vi.spyOn(api.apps, 'saveCategories').mockImplementation(async (list) => list.map((c, i) => ({ id: c.id ?? 10 + i, name: c.name })))
    const onSaved = vi.fn()
    await renderCategories(vi.fn(), onSaved)
    await categories().getByRole('textbox', { name: 'Category 2' }).fill('Web app')
    await categories().getByRole('button', { name: 'Move Video game up' }).click()
    await categories().getByRole('button', { name: 'Add category' }).click()
    await categories().getByRole('textbox', { name: 'Category 4' }).fill('Tool')
    await categories().getByRole('button', { name: 'Remove Mobile app' }).click()
    await page.getByRole('dialog', { name: 'Remove Mobile app?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await categories().getByRole('button', { name: 'Save' }).click()
    expect(save).toHaveBeenCalledWith([
      { id: 3, name: 'Video game' },
      { id: 2, name: 'Web app' },
      { id: null, name: 'Tool' },
    ])
    expect(onSaved).toHaveBeenCalledWith([
      { id: 3, name: 'Video game' },
      { id: 2, name: 'Web app' },
      { id: 12, name: 'Tool' },
    ])
  })

  it("names an unnamed category by its place, and shows the API's errors", async () => {
    vi.spyOn(api.apps, 'saveCategories')
      .mockRejectedValueOnce(new ApiError('/api/apps/categories', 400, { '[3].name': ['Required.'], '': ['Two have the same name.'] }))
      .mockRejectedValueOnce(new ApiError('/api/apps/categories', 401))
    await renderCategories()
    await categories().getByRole('button', { name: 'Add category' }).click()
    await expect.element(categories().getByRole('button', { name: 'Remove category 4' })).toBeVisible()
    await categories().getByRole('button', { name: 'Save' }).click()
    await expect.element(categories().getByRole('textbox', { name: 'Category 4' })).toHaveAccessibleDescription('Required.')
    await expect.poll(() => textOf(categories().getByRole('alert'))).toBe('Two have the same name.')
    await categories().getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => textOf(categories().getByRole('alert'))).toBe('Your session has ended. Sign in again, then save.')
  })

  it('asks before throwing away changes; Cancel closes at once', async () => {
    const onClose = vi.fn()
    await renderCategories(onClose)
    await categories().getByRole('textbox', { name: 'Category 1' }).fill('Apps')
    await userEvent.keyboard('{Escape}')
    const discard = page.getByRole('dialog', { name: 'Discard your changes?' })
    await expect.element(discard.getByText("Your changes to the categories aren't saved.")).toBeVisible()
    await discard.getByRole('button', { name: 'Discard' }).click()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
