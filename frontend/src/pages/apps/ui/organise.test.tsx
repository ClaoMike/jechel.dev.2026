import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { AppsPage } from './AppsPage'
import { api, ApiError, type AppOrderItem } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { APPS, CATEGORIES, pageOf } from '@/test/fixtures/apps'
import { ADMIN, forever, renderView } from '@/test/render'

// Apps → Organise: the admin's order of the apps, and which of them What's new? may show.

const ORDER: AppOrderItem[] = [
  { id: 1, title: 'LIGHTHOUSE', showInWhatsNew: true },
  { id: 2, title: 'Pocket Planner', showInWhatsNew: false },
  { id: 3, title: 'No Picture', showInWhatsNew: true },
]

const dialog = () => page.getByRole('dialog', { name: 'Organise apps' })
const save = () => dialog().getByRole('button', { name: 'Save', exact: true })
const close = () => dialog().getByRole('button', { name: 'Close' })
const rows = () => [...document.querySelectorAll('.organise-row')]
const titles = () => rows().map((row) => row.querySelector('.organise-title')?.textContent)
const handle = (title: string) => dialog().getByRole('button', { name: `Reorder ${title}` })
const showIn = (title: string) => dialog().getByRole('group', { name: `Show ${title} in What's new?` })

let listOrder: MockInstance<typeof api.apps.listOrder>
let saveOrder: MockInstance<typeof api.apps.saveOrder>
let list: MockInstance<typeof api.apps.list>

beforeEach(() => {
  list = vi.spyOn(api.apps, 'list').mockResolvedValue(pageOf(APPS))
  vi.spyOn(api.apps, 'listCategories').mockResolvedValue(CATEGORIES)
  // As the API: what's saved is what loads next (the list loads again after a save).
  let stored = structuredClone(ORDER)
  listOrder = vi.spyOn(api.apps, 'listOrder').mockImplementation(async () => structuredClone(stored))
  saveOrder = vi.spyOn(api.apps, 'saveOrder').mockImplementation(async (order) => {
    stored = order.map((item) => ({ ...item, title: ORDER.find((o) => o.id === item.id)!.title }))
    return structuredClone(stored)
  })
})

async function openOrganise() {
  await renderView(<AppsPage />, { path: '/apps', user: ADMIN })
  await page.getByRole('button', { name: 'Organise' }).click()
  await expect.element(dialog()).toBeVisible()
  await expect.poll(titles).toEqual(['LIGHTHOUSE', 'Pocket Planner', 'No Picture'])
}

/** A mouse drag of `from` (anywhere on its row) over `to`, then dropped. */
function drag(from: Element, to: Element) {
  const at = (type: string, target: Element) => {
    const box = target.getBoundingClientRect()
    target.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        clientX: box.left + 60,
        clientY: box.top + box.height / 2,
      }),
    )
  }
  at('pointerdown', from)
  // Over the target: the row starts moving, then follows the pointer there (moves go to the row that has the pointer).
  const box = to.getBoundingClientRect()
  for (const y of [box.top - 20, box.top + box.height / 2]) {
    from.dispatchEvent(
      new PointerEvent('pointermove', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, clientX: box.left + 60, clientY: y }),
    )
  }
  from.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }))
}

describe('Apps → Organise', () => {
  it("is the first of the admin's buttons above the apps, before Categories; visitors have neither", async () => {
    const admin = await renderView(<AppsPage />, { path: '/apps', user: ADMIN })
    await expect.element(page.getByRole('button', { name: 'Organise' })).toBeVisible()
    const buttons = [...document.querySelectorAll('.page-actions button')].map((b) => b.textContent)
    expect(buttons).toEqual(['Organise', 'Categories'])
    await admin.unmount()

    await renderView(<AppsPage />, { path: '/apps' })
    await expect.element(page.getByRole('list', { name: 'Apps' })).toBeVisible()
    expect(document.querySelector('.page-actions')).toBeNull()
  })

  it("lists every app in the order, with whether What's new? may show it; Save waits for a change", async () => {
    await openOrganise()
    await expect.element(save()).toBeDisabled()
    await expect.element(showIn('LIGHTHOUSE').getByRole('radio', { name: 'On' })).toBeChecked()
    await expect.element(showIn('Pocket Planner').getByRole('radio', { name: 'Off' })).toBeChecked()
    // Save is top left: before the title.
    const header = document.querySelector('.organise-header')!
    expect([...header.children].map((child) => child.textContent)).toEqual(['Save', 'Organise apps', '×'])
    expect(await a11yViolations()).toEqual([])
  })

  it('closes only with ×: not with Escape, nor a click beside it', async () => {
    await openOrganise()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog()).toBeVisible()
    ;(document.querySelector('.modal-backdrop') as HTMLElement).dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await expect.element(dialog()).toBeVisible()

    await close().click()
    await expect.element(dialog()).not.toBeInTheDocument()
  })

  it('reorders by dragging, then saves the whole order; the apps load again in it, and Save waits again', async () => {
    await openOrganise()
    const loads = list.mock.calls.length
    // The rows are found by where they are: wait until the popup has finished opening (its animation moves them).
    await Promise.all(document.getAnimations().map((animation) => animation.finished))
    drag(rows()[2], rows()[0])
    await expect.poll(titles).toEqual(['No Picture', 'LIGHTHOUSE', 'Pocket Planner'])
    await expect.element(save()).toBeEnabled()

    // The list loads again after a save: held back, so the saved order shows by itself first (no frame of the old one).
    listOrder.mockReturnValue(forever())
    await save().click()

    expect(saveOrder).toHaveBeenCalledWith([
      { id: 3, showInWhatsNew: true },
      { id: 1, showInWhatsNew: true },
      { id: 2, showInWhatsNew: false },
    ])
    await expect.element(save()).toBeDisabled()
    await expect.element(dialog().getByRole('status')).toHaveTextContent('Saved.')
    // Still open, on the saved order.
    expect(titles()).toEqual(['No Picture', 'LIGHTHOUSE', 'Pocket Planner'])
    await expect.poll(() => list.mock.calls.length).toBeGreaterThan(loads)
  })

  it('reorders with the arrow keys on a handle, saying where it went', async () => {
    await openOrganise()
    await handle('LIGHTHOUSE').element().focus()
    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(titles).toEqual(['Pocket Planner', 'LIGHTHOUSE', 'No Picture'])
    await expect.element(page.getByText('Moved to position 2 of 3.')).toBeInTheDocument()
    await expect.element(save()).toBeEnabled()

    // Back where it was: nothing to save.
    await handle('LIGHTHOUSE').element().focus()
    await userEvent.keyboard('{ArrowUp}')
    await expect.poll(titles).toEqual(['LIGHTHOUSE', 'Pocket Planner', 'No Picture'])
    await expect.element(save()).toBeDisabled()
  })

  it("switches whether What's new? may show an app, and saves it with the order", async () => {
    await openOrganise()
    await showIn('LIGHTHOUSE').getByText('Off').click()
    await expect.element(save()).toBeEnabled()
    await showIn('Pocket Planner').getByText('On').click()

    await save().click()

    expect(saveOrder.mock.calls[0][0].map(({ id, showInWhatsNew }) => [id, showInWhatsNew])).toEqual([
      [1, false],
      [2, true],
      [3, true],
    ])
  })

  it('asks before closing with changes not saved: keep editing, or discard them', async () => {
    await openOrganise()
    await showIn('No Picture').getByText('Off').click()

    await close().click()
    const ask = page.getByRole('dialog', { name: 'Discard your changes?' })
    await expect.element(ask).toBeVisible()
    await ask.getByRole('button', { name: 'Cancel' }).click()
    await expect.element(dialog()).toBeVisible()
    await expect.element(showIn('No Picture').getByRole('radio', { name: 'Off' })).toBeChecked()

    await close().click()
    await page.getByRole('dialog', { name: 'Discard your changes?' }).getByRole('button', { name: 'Discard' }).click()
    await expect.element(dialog()).not.toBeInTheDocument()
    expect(saveOrder).not.toHaveBeenCalled()
  })

  it('says when a save failed, and keeps the changes to try again', async () => {
    await openOrganise()
    await handle('No Picture').element().focus()
    await userEvent.keyboard('{ArrowUp}')

    saveOrder.mockRejectedValueOnce(new ApiError('/api/apps/order', 500))
    await save().click()
    await expect.element(dialog().getByRole('alert')).toHaveTextContent("Couldn't save. Please try again.")
    expect(titles()).toEqual(['LIGHTHOUSE', 'No Picture', 'Pocket Planner'])
    await expect.element(save()).toBeEnabled()
  })

  it('when apps were added or deleted meanwhile, says so and shows the list as it is now, to arrange again', async () => {
    saveOrder.mockRejectedValueOnce(new ApiError('/api/apps/order', 400, { '': ['Apps were added or deleted meanwhile. Load the list again, then arrange it.'] }))
    await openOrganise()
    listOrder.mockResolvedValue([...structuredClone(ORDER), { id: 4, title: 'Added elsewhere', showInWhatsNew: true }])
    await handle('No Picture').element().focus()
    await userEvent.keyboard('{ArrowUp}')

    await save().click()

    await expect.element(dialog().getByRole('alert')).toHaveTextContent("Apps were added or deleted meanwhile. Here's the list as it is now: arrange it again, then save.")
    await expect.poll(titles).toEqual(['LIGHTHOUSE', 'Pocket Planner', 'No Picture', 'Added elsewhere'])
    await expect.element(save()).toBeDisabled()
  })

  it('shows placeholders while the apps load', async () => {
    listOrder.mockReturnValueOnce(forever())
    await renderView(<AppsPage />, { path: '/apps', user: ADMIN })
    await page.getByRole('button', { name: 'Organise' }).click()
    await expect.element(dialog().getByText('Loading the apps…')).toBeInTheDocument()
    await expect.element(save()).toBeDisabled()
  })

  it("offers to try again when the apps can't be loaded", async () => {
    listOrder.mockRejectedValueOnce(new ApiError('/api/apps/order', 500))
    await renderView(<AppsPage />, { path: '/apps', user: ADMIN })
    await page.getByRole('button', { name: 'Organise' }).click()
    await expect.element(dialog().getByText("The apps can't be loaded right now.")).toBeVisible()
    await dialog().getByRole('button', { name: 'Try again' }).click()
    await expect.poll(titles).toEqual(['LIGHTHOUSE', 'Pocket Planner', 'No Picture'])
  })

  it('says so when there are no apps yet', async () => {
    listOrder.mockResolvedValue([])
    await renderView(<AppsPage />, { path: '/apps', user: ADMIN })
    await page.getByRole('button', { name: 'Organise' }).click()
    await expect.element(dialog().getByText('No apps yet.')).toBeVisible()
    await expect.element(save()).toBeDisabled()
  })
})
