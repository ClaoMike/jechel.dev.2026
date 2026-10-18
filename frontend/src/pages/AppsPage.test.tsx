import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '../services/api'
import { renderApp } from '../test/render'
import { appsApi, makeApps, server, signedIn } from '../test/server'

afterEach(() => vi.restoreAllMocks())

async function renderApps({ count = 3, admin = false } = {}) {
  const apps = appsApi(makeApps(count))
  server.use(...(admin ? [signedIn()] : []), ...apps.handlers)
  renderApp('/apps')
  await screen.findByRole('list', { name: 'Apps' })
  if (admin) await screen.findByRole('button', { name: 'Add an app' })
  return { user: userEvent.setup(), ...apps }
}

const tiles = () => within(screen.getByRole('list', { name: 'Apps' })).getAllByRole('button')
/** A whole tile (picture, labels, description), around its title's button. */
const tile = (i: number) => within(tiles()[i].closest('li')!)
const dialog = (name: string | RegExp) => screen.getByRole('dialog', { name })

/** Clicks a remove button, then confirms in the popup it opens. */
async function removeConfirmed(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(screen.getByRole('button', { name }))
  await user.click(within(screen.getByRole('dialog', { name: `${name}?` })).getByRole('button', { name: 'Remove' }))
}

/** Stands in for uploads: jsdom can't send FormData. Videos are any file whose type starts with video/. */
function stubUploads() {
  let n = 0
  return vi.spyOn(api.files, 'uploadAppMedia').mockImplementation(async (file) => {
    n += 1
    const kind = file.type.startsWith('video/') ? ('video' as const) : ('image' as const)
    return { url: `/api/files/00000000-0000-0000-0000-00000000090${n}/${file.name}`, fileName: file.name, kind }
  })
}

describe('AppsPage for visitors', () => {
  it('shows a tile per app with its first image, title and the start of its description', async () => {
    await renderApps()

    expect(screen.getByRole('heading', { name: 'Apps' })).toBeInTheDocument()
    expect(tiles().map((t) => t.textContent)).toEqual(['App 1', 'App 2', 'App 3'])
    // App 1 starts with a video: its tile still shows the first image.
    const card = tiles()[0].closest('li')!
    expect(card.querySelector('img')).toHaveAttribute('src', makeApps(1)[0].media[1].url)
    expect(within(card).getByText('What app 1 does, on GitHub.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add an app' })).not.toBeInTheDocument()
  })

  it('opens an app in a popup with a slider of its images and videos', async () => {
    const { user } = await renderApps()

    await user.click(screen.getByRole('button', { name: 'App 1' }))
    const popup = dialog('App 1')
    expect(within(popup).getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/x/app1')
    const slider = within(popup).getByRole('region', { name: 'App 1: images and videos' })
    expect(within(slider).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['1 of 3', '2 of 3', '3 of 3'])
    expect(within(slider).getByLabelText('App 1, video 1 of 3').tagName).toBe('VIDEO')
    expect(within(slider).getByText('1 / 3')).toBeInTheDocument()

    await user.click(within(slider).getByRole('button', { name: 'Next' }))
    expect(within(slider).getByText('2 / 3')).toBeInTheDocument()
    await user.click(within(slider).getByRole('button', { name: 'Show 3 of 3' }))
    expect(within(slider).getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(within(popup).queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows categories as labels on the tile and in the popup, with platforms and store links in the popup', async () => {
    const { user } = await renderApps()

    expect(tile(0).getByText('Mobile app')).toBeInTheDocument()
    expect(tile(0).getByText('Video game')).toBeInTheDocument()
    expect(tile(0).queryByText('iOS')).not.toBeInTheDocument()

    await user.click(tiles()[0])
    const popup = dialog('App 1')
    expect(within(popup).getByText('Video game')).toBeInTheDocument()
    expect(within(within(popup).getByRole('list', { name: 'Runs on' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['iOS', 'Android'])
    const store = within(popup).getByRole('link', { name: 'Check it on App Store' })
    expect(store).toHaveAttribute('href', 'https://apps.apple.com/app/app1')
    expect(store).toHaveAttribute('target', '_blank')
  })

  it('says when there are no apps', async () => {
    server.use(...appsApi([]).handlers)
    renderApp('/apps')
    expect(await screen.findByText('No apps yet.')).toBeInTheDocument()
  })
})

describe('AppsPage for the admin', () => {
  it('has an Add tile first, keeping the first page at nine tiles', async () => {
    await renderApps({ admin: true, count: 10 })

    expect(tiles()).toHaveLength(9)
    expect(tiles()[0]).toHaveAccessibleName('Add an app')
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument()
  })

  it('adds an app with images and a video, reordered, one removed', async () => {
    const { user, sent } = await renderApps({ admin: true })
    const uploads = stubUploads()

    await user.click(screen.getByRole('button', { name: 'Add an app' }))
    const form = dialog('Add an app')
    await user.click(within(form).getByRole('button', { name: 'Add app' }))
    expect(await within(form).findByText('Required.')).toBeInTheDocument()

    await user.type(within(form).getByLabelText('Title'), 'Portfolio')
    await user.click(within(form).getByRole('button', { name: 'Video game' }))
    await user.click(within(form).getByRole('button', { name: 'Mobile app' }))
    await user.type(within(form).getByLabelText('Description'), 'This site.')
    await user.click(within(form).getByRole('button', { name: 'Android' }))
    await user.type(within(form).getByLabelText('Another platform'), 'Meta Quest{Enter}')
    expect(within(form).getByRole('button', { name: 'Meta Quest' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(within(form).getByRole('button', { name: 'Add a link' }))
    await user.type(within(form).getByLabelText('Check it on… (link 1)'), 'Google Play')
    await user.type(within(form).getByLabelText('Address (link 1)'), 'https://play.google.com/store/apps/details?id=x')
    await user.upload(within(form).getByLabelText('Image or video files'), [
      new File(['a'], 'home.png', { type: 'image/png' }),
      new File(['b'], 'demo.mp4', { type: 'video/mp4' }),
      new File(['c'], 'about.png', { type: 'image/png' }),
    ])
    const list = await within(form).findByRole('list', { name: 'Images and videos' })
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3))
    expect(uploads).toHaveBeenCalledTimes(3)

    // Reordering by keyboard, on the tile's drag handle (dragging itself is tested in the browser, e2e).
    within(form).getByRole('button', { name: 'Reorder image 1' }).focus()
    await user.keyboard('{ArrowRight}')
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1. Video', '2. Image', '3. Image'])
    expect(screen.getByText('Moved to position 2 of 3.')).toBeInTheDocument()
    await user.click(within(form).getByRole('button', { name: 'Remove image 3' }))
    await user.click(within(dialog('Remove image 3?')).getByRole('button', { name: 'Remove' }))
    await user.click(within(form).getByRole('button', { name: 'Add app' }))

    expect(await screen.findByRole('dialog', { name: 'Portfolio' })).toBeInTheDocument()
    expect(sent.at(-1)).toEqual({
      method: 'POST',
      body: {
        title: 'Portfolio',
        description: 'This site.',
        categoryIds: [1, 3],
        platforms: ['Android', 'Meta Quest'],
        links: [{ label: 'Google Play', url: 'https://play.google.com/store/apps/details?id=x' }],
        media: [
          { url: '/api/files/00000000-0000-0000-0000-000000000902/demo.mp4', kind: 'video' },
          { url: '/api/files/00000000-0000-0000-0000-000000000901/home.png', kind: 'image' },
        ],
      },
    })
    await waitFor(() => expect(tiles()[1]).toHaveAccessibleName('Portfolio'))
  })

  it('manages the categories: rename, reorder, add and remove', async () => {
    const { user, savedCategories } = await renderApps({ admin: true })

    await user.click(screen.getByRole('button', { name: 'Categories' }))
    const popup = dialog('App categories')
    await user.clear(within(popup).getByLabelText('Category 3'))
    await user.type(within(popup).getByLabelText('Category 3'), 'Game')
    await user.click(within(popup).getByRole('button', { name: 'Move Game up' }))
    await removeConfirmed(user, 'Remove Website')
    await user.click(within(popup).getByRole('button', { name: 'Add category' }))
    await user.click(within(popup).getByRole('button', { name: 'Save' }))
    expect(await within(popup).findByText('Required.')).toBeInTheDocument()
    await user.type(within(popup).getByLabelText('Category 3'), 'Desktop app')
    await user.click(within(popup).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(savedCategories.at(-1)).toEqual([
      { id: 1, name: 'Mobile app' },
      { id: 3, name: 'Game' },
      { id: null, name: 'Desktop app' },
    ])
    // The tiles show the new names, and the removed category is gone.
    await waitFor(() => expect(tile(1).getByText('Game')).toBeInTheDocument())
    expect(screen.queryByText('Website')).not.toBeInTheDocument()

    await user.click(tiles()[2])
    await user.click(within(dialog('App 2')).getByRole('button', { name: 'Edit' }))
    expect(within(dialog('Edit App 2')).getAllByRole('button', { pressed: false }).map((b) => b.textContent).slice(0, 3)).toEqual(['Mobile app', 'Game', 'Desktop app'])
  })

  it('edits an app in the same popup', async () => {
    const { user, sent } = await renderApps({ admin: true })

    await user.click(screen.getByRole('button', { name: 'App 2' }))
    await user.click(within(dialog('App 2')).getByRole('button', { name: 'Edit' }))
    const form = dialog('Edit App 2')
    expect(within(form).getByLabelText('Title')).toHaveValue('App 2')
    await user.clear(within(form).getByLabelText('Title'))
    await user.type(within(form).getByLabelText('Title'), 'Renamed')
    within(form).getByRole('button', { name: 'Reorder image 2' }).focus()
    await user.keyboard('{ArrowLeft}')
    await user.click(within(form).getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('dialog', { name: 'Renamed' })).toBeInTheDocument()
    expect(sent[0].method).toBe('PUT')
    expect(sent[0].body.media.map((m) => m.url)).toEqual(makeApps(2)[1].media.map((m) => m.url).reverse())
    await waitFor(() => expect(screen.getByRole('button', { name: 'Renamed' })).toBeInTheDocument())
  })

  it('adds a YouTube trailer and an image from links, and plays the trailer in the slider', async () => {
    const { user, sent } = await renderApps({ admin: true })

    await user.click(screen.getByRole('button', { name: 'Add an app' }))
    const form = dialog('Add an app')
    await user.type(within(form).getByLabelText('Title'), 'Space game')
    await user.click(within(form).getByRole('button', { name: 'Add link' }))
    expect(within(form).getByText('Paste a link first.')).toBeInTheDocument()
    await user.type(within(form).getByLabelText('Or add from a link'), 'javascript:alert(1){Enter}')
    expect(within(form).getByText('That should be a link starting with https://.')).toBeInTheDocument()
    await user.clear(within(form).getByLabelText('Or add from a link'))
    await user.type(within(form).getByLabelText('Or add from a link'), 'https://youtu.be/dQw4w9WgXcQ?si=x{Enter}')
    await user.type(within(form).getByLabelText('Or add from a link'), 'https://cdn.example.com/shot.png')
    await user.click(within(form).getByRole('button', { name: 'Add link' }))
    expect(within(within(form).getByRole('list', { name: 'Images and videos' })).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['1. YouTube', '2. Image'])
    await user.click(within(form).getByRole('button', { name: 'Add app' }))

    const popup = await screen.findByRole('dialog', { name: 'Space game' })
    expect(sent[0].body.media).toEqual([
      { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', kind: 'youtube' },
      { url: 'https://cdn.example.com/shot.png', kind: 'image' },
    ])
    expect(within(popup).getByTitle('Space game, video 1 of 2')).toHaveAttribute('src', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ')
    await user.click(within(popup).getByRole('button', { name: 'Next' }))
    // Off its slide, the player is gone (so it stops), and a thumbnail takes its place.
    expect(within(popup).queryByTitle('Space game, video 1 of 2')).not.toBeInTheDocument()
    await user.click(within(popup).getByRole('button', { name: 'Show Space game, video 1 of 2' }))
    expect(within(popup).getByTitle('Space game, video 1 of 2')).toBeInTheDocument()
    // The tile shows the first image, even after a YouTube video.
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Space game' }).closest('li')!.querySelector('img')).toHaveAttribute('src', 'https://cdn.example.com/shot.png')
  })

  it('deletes an app once confirmed', async () => {
    const { user, deleted } = await renderApps({ admin: true })

    await user.click(screen.getByRole('button', { name: 'App 3' }))
    await user.click(within(dialog('App 3')).getByRole('button', { name: 'Edit' }))
    await user.click(screen.getByRole('button', { name: 'Delete app' }))
    await user.click(within(dialog('Delete App 3?')).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(deleted).toEqual([3])
    await waitFor(() => expect(screen.queryByRole('button', { name: 'App 3' })).not.toBeInTheDocument())
  })

  it('asks before throwing away unsaved changes', async () => {
    const { user } = await renderApps({ admin: true })

    await user.click(screen.getByRole('button', { name: 'Add an app' }))
    await user.type(within(dialog('Add an app')).getByLabelText('Title'), 'Half done')
    await user.keyboard('{Escape}')
    await user.click(within(dialog('Discard your changes?')).getByRole('button', { name: 'Cancel' }))
    expect(within(dialog('Add an app')).getByLabelText('Title')).toHaveValue('Half done')

    await user.click(within(dialog('Add an app')).getByRole('button', { name: 'Close' }))
    await user.click(within(dialog('Discard your changes?')).getByRole('button', { name: 'Discard' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('refuses a file over the limit without sending it', async () => {
    const { user } = await renderApps({ admin: true })
    const uploads = stubUploads()

    await user.click(screen.getByRole('button', { name: 'Add an app' }))
    const big = new File(['x'], 'huge.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 16 * 1024 * 1024 })
    await user.upload(within(dialog('Add an app')).getByLabelText('Image or video files'), big)

    expect(await screen.findByRole('alert')).toHaveTextContent('huge.png is 16 MB; the limit is 15 MB.')
    expect(uploads).not.toHaveBeenCalled()
  })
})
