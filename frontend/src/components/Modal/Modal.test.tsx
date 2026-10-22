import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderView } from '../../test/render'
import { ConfirmDialog } from '../ConfirmDialog/ConfirmDialog'
import { Modal } from './Modal'

// The one popup the site uses: focus goes in and stays (Tab wraps both ways), Escape or the backdrop closes it, focus goes back.

function Opener({ empty = false }: { empty?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Modal labelledBy="title" onClose={() => setOpen(false)}>
          <h2 id="title">Hello</h2>
          {!empty && (
            <>
              <button type="button">First</button>
              <input aria-label="Middle" />
              <button type="button" disabled>
                Off
              </button>
              <a href="/x">Last</a>
            </>
          )}
        </Modal>
      )}
    </>
  )
}

const dialog = () => page.getByRole('dialog', { name: 'Hello' })
const focused = () => (document.activeElement as HTMLElement).textContent || document.activeElement!.getAttribute('aria-label')

async function openIt(empty = false) {
  await renderView(<Opener empty={empty} />)
  await page.getByRole('button', { name: 'Open' }).click()
  await expect.element(dialog()).toBeVisible()
}

describe('the popup', () => {
  it('takes the focus, and keeps the page behind from scrolling', async () => {
    await openIt()
    expect(document.activeElement).toBe(dialog().element())
    expect(document.body.style.overflow).toBe('hidden')
  })

  it('Tab goes through what can be focused and wraps; Shift+Tab goes back, also from the first', async () => {
    await openIt()

    await userEvent.keyboard('{Tab}')
    expect(focused()).toBe('First')
    await userEvent.keyboard('{Tab}')
    expect(focused()).toBe('Middle')
    await userEvent.keyboard('{Tab}')
    expect(focused()).toBe('Last')
    await userEvent.keyboard('{Tab}')
    expect(focused()).toBe('First')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(focused()).toBe('Last')
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(focused()).toBe('Middle')
  })

  it('with nothing to focus, Tab stays put', async () => {
    await openIt(true)

    await userEvent.keyboard('{Tab}')

    expect(document.activeElement).toBe(dialog().element())
  })

  it('closes with Escape, and gives the focus back to what opened it', async () => {
    await openIt()

    await userEvent.keyboard('{Escape}')

    await expect.element(dialog()).not.toBeInTheDocument()
    expect(focused()).toBe('Open')
    expect(document.body.style.overflow).toBe('')
  })

  it('closes on a press on the backdrop, not inside', async () => {
    await openIt()

    dialog()
      .element()
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await expect.element(dialog()).toBeVisible()

    document.querySelector('.modal-backdrop')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    await expect.element(dialog()).not.toBeInTheDocument()
  })
})

describe('asking first', () => {
  function Ask({ onConfirm, danger }: { onConfirm: () => void | Promise<void>; danger?: boolean }) {
    const [open, setOpen] = useState(true)
    return open ? (
      <ConfirmDialog title="Delete it?" confirmLabel="Delete" danger={danger} onConfirm={onConfirm} onClose={() => setOpen(false)}>
        <p>This can't be undone.</p>
      </ConfirmDialog>
    ) : (
      <p>Closed</p>
    )
  }
  const ask = () => page.getByRole('dialog', { name: 'Delete it?' })

  it('has Cancel focused, so Enter by mistake does nothing', async () => {
    const onConfirm = vi.fn()
    await renderView(<Ask onConfirm={onConfirm} />)
    await expect.element(ask()).toBeVisible()

    expect(focused()).toBe('Cancel')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText('Closed')).toBeVisible()
    expect(onConfirm).not.toHaveBeenCalled()
  })

  it('waits while it works, then closes', async () => {
    let done!: () => void
    await renderView(<Ask onConfirm={() => new Promise<void>((resolve) => (done = resolve))} />)
    await ask().getByRole('button', { name: 'Delete' }).click()

    await expect.element(ask().getByRole('button', { name: 'Working…' })).toBeDisabled()
    await expect.element(ask().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    await expect.element(ask()).toBeVisible()

    done()
    await expect.element(page.getByText('Closed')).toBeVisible()
  })

  it('says when it failed, and stays to try again', async () => {
    const onConfirm = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
    await renderView(<Ask onConfirm={onConfirm} />)

    await ask().getByRole('button', { name: 'Delete' }).click()
    await expect.element(ask().getByRole('alert')).toHaveTextContent("That didn't work. Please try again.")
    await ask().getByRole('button', { name: 'Delete' }).click()

    await expect.element(page.getByText('Closed')).toBeVisible()
    expect(onConfirm).toHaveBeenCalledTimes(2)
  })

  it('is red for something that can’t be undone, plain otherwise', async () => {
    await renderView(<Ask onConfirm={() => {}} danger={false} />)

    expect(ask().getByRole('button', { name: 'Delete' }).element().className).toBe('button')
  })
})
