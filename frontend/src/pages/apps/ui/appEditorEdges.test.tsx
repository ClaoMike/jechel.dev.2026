import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { api, ApiError, type AppDetails } from '@/shared/api'
import { APPS, CATEGORIES } from '@/test/fixtures/apps'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
import { AppDialog } from './AppDialog/AppDialog'
import { CategoriesDialog } from './CategoriesDialog/CategoriesDialog'
import { isVideoFile } from '@/entities/app'

// The app form and popups at their edges: big and untyped files, upload progress, the API's errors on
// each part, Enter in the link box, closing with and without changes.

const newApp = () => page.getByRole('dialog', { name: 'Add an app' })
const media = () => newApp().getByRole('group', { name: 'Images and videos' })
const filesInput = () => media().getByLabelText('Image or video files')

function renderNewApp(onClose = vi.fn()) {
  return renderView(<AppDialog app={null} categories={CATEGORIES} canEdit onClose={onClose} onSaved={vi.fn()} onDeleted={vi.fn()} />, { user: ADMIN })
}

/** A file of `megabytes`, made in the browser and handed to the picker there (no copy through the test runner). */
function pick(name: string, type: string, megabytes: number) {
  const input = filesInput().element() as HTMLInputElement
  const files = new DataTransfer()
  files.items.add(new File([new Uint8Array(megabytes * 1024 * 1024)], name, { type }))
  input.files = files.files
  input.dispatchEvent(new Event('change', { bubbles: true }))
}

describe('uploading images and videos', () => {
  it('takes a video by its name when the browser gives it no type (its 200 MB limit, not the 15 MB of images)', async () => {
    const upload = vi.spyOn(api.files, 'uploadAppMedia').mockResolvedValue({ url: '/api/files/1/clip.mp4', fileName: 'clip.mp4', kind: 'video' })
    await renderNewApp()

    pick('clip.mp4', '', 20)

    await expect.poll(() => upload.mock.calls.length).toBe(1)
    expect(media().getByRole('alert').query()).toBeNull()
  })

  it.each([
    ['clip.MOV', '', true],
    ['clip.webm', '', true],
    ['clip.m4v', '', true],
    ['clip.mp4', 'video/mp4', true],
    ['shot.png', 'image/png', false],
    ['notes', '', false],
    ['mp4.png', '', false],
  ])('treats %s (type "%s") as a video: %s', (name, type, video) => {
    expect(isVideoFile(new File([], name, { type }))).toBe(video)
  })

  it('refuses a video over 200 MB before sending it', async () => {
    const upload = vi.spyOn(api.files, 'uploadAppMedia')
    await renderNewApp()

    pick('long.mp4', 'video/mp4', 201)

    await expect.poll(() => textOf(media().getByRole('alert'))).toBe('long.mp4 is 201 MB; the limit is 200 MB.')
    expect(upload).not.toHaveBeenCalled()
  })

  it('says how far a single upload has got', async () => {
    vi.spyOn(api.files, 'uploadAppMedia').mockImplementation((_, progress) => {
      progress?.(0.42)
      return forever()
    })
    await renderNewApp()

    await filesInput().upload(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))

    await expect.element(media().getByRole('button', { name: 'Uploading… 42%' })).toBeDisabled()
    await expect.poll(() => textOf(media().getByRole('status'))).toBe('Uploading… 42%')
  })

  it('clears the file picker afterwards, so the same file can be picked again', async () => {
    vi.spyOn(api.files, 'uploadAppMedia').mockResolvedValue({ url: '/api/files/1/a.webp', fileName: 'a.webp', kind: 'image' })
    await renderNewApp()

    await filesInput().upload(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))

    await expect.poll(() => (filesInput().element() as HTMLInputElement).value).toBe('')
  })

  it('says why an upload failed when the API gives no reason', async () => {
    vi.spyOn(api.files, 'uploadAppMedia').mockRejectedValue(new ApiError('/api/files/app-media', 500))
    await renderNewApp()

    await filesInput().upload(new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }))

    await expect.poll(() => textOf(media().getByRole('alert'))).toBe("a.png: couldn't upload. Please try again.")
  })
})

describe('adding from a link', () => {
  const linkBox = () => media().getByRole('textbox', { name: 'Or add from a link' })

  it('adds it with Enter, without saving the app; other keys just type', async () => {
    const create = vi.spyOn(api.apps, 'create')
    await renderNewApp()
    await linkBox().fill('https://cdn.example.com/shot.png')
    await userEvent.keyboard('{End}')
    expect(media().element().querySelectorAll('.media-list-label')).toHaveLength(0)

    await userEvent.keyboard('{Enter}')

    await expect.poll(() => [...media().element().querySelectorAll('.media-list-label')].map((l) => l.textContent)).toEqual(['1. Image'])
    await expect.element(linkBox()).toHaveValue('')
    expect(create).not.toHaveBeenCalled()
  })

  it('says to paste a link first, and forgets the problem once something is typed', async () => {
    await renderNewApp()
    await media().getByRole('button', { name: 'Add link' }).click()
    await expect.element(linkBox()).toHaveAccessibleDescription('Paste a link first.')

    await linkBox().fill('h')

    await expect.element(linkBox()).not.toHaveAccessibleDescription('Paste a link first.')
  })
})

describe("the API's errors on each part of the form", () => {
  it('shows them under categories, platforms and the images and videos, and says some fields need fixing', async () => {
    vi.spyOn(api.apps, 'create').mockRejectedValue(
      new ApiError('/api/apps', 400, {
        categoryIds: ["That category doesn't exist any more. Reload the page."],
        platforms: ['Each can be added once.'],
        'media[1].url': ['Must be a YouTube video link.'],
      }),
    )
    await renderNewApp()
    await newApp().getByRole('textbox', { name: 'Title' }).fill('X')

    await newApp().getByRole('button', { name: 'Add app' }).click()

    await expect.poll(() => textOf(newApp().getByRole('alert').last())).toBe('Some fields need fixing.')
    const text = textOf(newApp())
    expect(text).toContain("That category doesn't exist any more. Reload the page.")
    expect(text).toContain('Each can be added once.')
    expect(text).toContain('Must be a YouTube video link.')
  })
})

describe('closing the popup of an app being edited', () => {
  const app: AppDetails = { ...APPS[0], platforms: [], links: [] }
  const shown = () => page.getByRole('dialog', { name: app.title })
  const editing = () => page.getByRole('dialog', { name: `Edit ${app.title}` })

  it('goes back to showing the app with Cancel', async () => {
    await renderView(<AppDialog app={app} categories={CATEGORIES} canEdit onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />, { user: ADMIN })
    await shown().getByRole('button', { name: 'Edit' }).click()

    await editing().getByRole('button', { name: 'Cancel' }).click()

    await expect.element(shown().getByRole('button', { name: 'Edit' })).toBeVisible()
  })

  it('closes at once with × when nothing changed, and asks first when something did', async () => {
    const onClose = vi.fn()
    await renderView(<AppDialog app={app} categories={CATEGORIES} canEdit onClose={onClose} onSaved={vi.fn()} onDeleted={vi.fn()} />, { user: ADMIN })
    await shown().getByRole('button', { name: 'Edit' }).click()
    await editing().getByRole('button', { name: 'Close' }).click()
    expect(onClose).toHaveBeenCalledTimes(1)

    // (Closing is the page's to do: here the popup stays, still editing.)
    await editing().getByRole('textbox', { name: 'Title' }).fill('Renamed')
    await editing().getByRole('button', { name: 'Close' }).click()

    await expect.element(page.getByRole('dialog', { name: 'Discard your changes?' })).toBeVisible()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows no "Runs on" or store links for an app without them', async () => {
    await renderView(<AppDialog app={app} categories={CATEGORIES} canEdit={false} onClose={vi.fn()} onSaved={vi.fn()} onDeleted={vi.fn()} />)
    await expect.element(shown()).toBeVisible()
    expect(textOf(shown())).not.toContain('Runs on')
    expect(shown().getByRole('list', { name: 'Where to get it' }).query()).toBeNull()
  })
})

describe('the categories popup, at its edges', () => {
  const popup = () => page.getByRole('dialog', { name: 'App categories' })

  it('closes at once when nothing changed', async () => {
    const onClose = vi.fn()
    await renderView(<CategoriesDialog categories={CATEGORIES} onClose={onClose} onSaved={vi.fn()} />, { user: ADMIN })
    await expect.element(popup()).toBeVisible()

    await userEvent.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('says some names need fixing when the API only points at the fields', async () => {
    vi.spyOn(api.apps, 'saveCategories').mockRejectedValue(new ApiError('/api/apps/categories', 400, { '[0].name': ['Must be at most 40 characters.'] }))
    await renderView(<CategoriesDialog categories={CATEGORIES} onClose={vi.fn()} onSaved={vi.fn()} />, { user: ADMIN })

    await popup().getByRole('button', { name: 'Save' }).click()

    await expect.poll(() => textOf(popup().getByRole('alert'))).toBe('Some names need fixing.')
    await expect.element(popup().getByRole('textbox', { name: 'Category 1' })).toHaveAccessibleDescription('Must be at most 40 characters.')
  })
})
