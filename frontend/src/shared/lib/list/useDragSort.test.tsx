import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderView } from '@/test/render'
import { useDragSort } from './useDragSort'

// Reordering a list by dragging (mouse anywhere on an item, a finger on its handle) or with the arrow keys on the handle.

function List({ initial = ['Alpha', 'Beta', 'Gamma'] }: { initial?: string[] }) {
  const [items, setItems] = useState(initial)
  const sort = useDragSort(items.length, (from, to) => {
    const next = [...items]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    setItems(next)
  })
  return (
    <>
      <ul aria-label="Items" style={{ listStyle: 'none', padding: 0, width: 300 }} data-dragging={sort.dragging || undefined}>
        {sort.order.map((index, position) => (
          <li key={items[index]} {...sort.itemProps(position)} style={{ height: 40 }}>
            <span {...sort.handleProps(position, items[index])} tabIndex={0} role="button">
              ≡
            </span>{' '}
            {items[index]} <button type="button">Edit</button>
          </li>
        ))}
      </ul>
      <p role="status">{sort.announcement}</p>
      <p data-testid="saved">{items.join(',')}</p>
    </>
  )
}

const items = () => [...document.querySelectorAll('li')]
const shown = () => items().map((li) => li.textContent!.replace(/[≡\s]|Edit/g, ''))
const saved = () => document.querySelector('[data-testid="saved"]')!.textContent

/** A pointer event over `target` (its middle, moved by dy), as a mouse (pointer 1) or a finger sends it. */
function pointer(type: string, target: Element, dy = 0, { pointerId = 1, pointerType = 'mouse', button = 0 } = {}) {
  const box = target.getBoundingClientRect()
  target.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId,
      pointerType,
      isPrimary: pointerId === 1,
      button,
      clientX: box.left + 100,
      clientY: box.top + box.height / 2 + dy,
    }),
  )
}

describe('dragging', () => {
  it('shows the new order while dragging, and applies it when dropped', async () => {
    await renderView(<List />)
    const first = items()[0]

    pointer('pointerdown', first)
    pointer('pointermove', first, 85)
    await expect.poll(shown).toEqual(['Beta', 'Gamma', 'Alpha'])
    expect(saved()).toBe('Alpha,Beta,Gamma')
    expect(document.querySelector('ul')!.hasAttribute('data-dragging')).toBe(true)

    pointer('pointerup', first, 85)
    await expect.poll(saved).toBe('Beta,Gamma,Alpha')
    expect(document.querySelector('ul')!.hasAttribute('data-dragging')).toBe(false)
  })

  it('a click without moving is not a drag, and dropping in place changes nothing', async () => {
    await renderView(<List />)
    const first = items()[0]

    pointer('pointerdown', first)
    pointer('pointermove', first, 3)
    pointer('pointerup', first, 3)
    expect(document.querySelector('ul')!.hasAttribute('data-dragging')).toBe(false)

    pointer('pointerdown', first)
    pointer('pointermove', first, 10)
    await expect.poll(() => document.querySelector('ul')!.hasAttribute('data-dragging')).toBe(true)
    pointer('pointerup', first, 10)
    await expect.poll(() => document.querySelector('ul')!.hasAttribute('data-dragging')).toBe(false)
    expect(saved()).toBe('Alpha,Beta,Gamma')
  })

  it('a cancelled drag puts everything back', async () => {
    await renderView(<List />)
    const first = items()[0]

    pointer('pointerdown', first)
    pointer('pointermove', first, 85)
    await expect.poll(shown).toEqual(['Beta', 'Gamma', 'Alpha'])
    pointer('pointercancel', first, 85)

    await expect.poll(shown).toEqual(['Alpha', 'Beta', 'Gamma'])
    expect(saved()).toBe('Alpha,Beta,Gamma')
  })

  it("doesn't start on a button, with another mouse button, or by touch away from the handle", async () => {
    await renderView(<List />)
    const first = items()[0]

    pointer('pointerdown', first.querySelector('button')!)
    pointer('pointermove', first, 85)
    pointer('pointerdown', first, 0, { button: 2 })
    pointer('pointermove', first, 85)
    pointer('pointerdown', first, 0, { pointerType: 'touch', pointerId: 3 })
    pointer('pointermove', first, 85, { pointerType: 'touch', pointerId: 3 })

    expect(document.querySelector('ul')!.hasAttribute('data-dragging')).toBe(false)
    expect(shown()).toEqual(['Alpha', 'Beta', 'Gamma'])
  })

  it('by touch, the handle drags; another finger lifting doesn’t drop it', async () => {
    await renderView(<List />)
    const handle = items()[0].querySelector('[data-drag-handle]')!
    const touch = { pointerType: 'touch', pointerId: 1 }

    pointer('pointerdown', handle, 0, touch)
    pointer('pointermove', items()[0], 45, touch)
    await expect.poll(shown).toEqual(['Beta', 'Alpha', 'Gamma'])
    pointer('pointerup', items()[0], 0, { pointerType: 'touch', pointerId: 9 })
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(saved()).toBe('Alpha,Beta,Gamma')
    expect(shown()).toEqual(['Beta', 'Alpha', 'Gamma'])

    pointer('pointerup', items()[1], 0, touch)
    await expect.poll(saved).toBe('Beta,Alpha,Gamma')
  })
})

describe('the keyboard', () => {
  it('moves an item with the arrows on its handle, says where, and stops at the ends', async () => {
    await renderView(<List />)
    const handle = page.getByRole('button', { name: 'Reorder Beta' })
    ;(handle.element() as HTMLElement).focus()

    await userEvent.keyboard('{ArrowDown}')
    await expect.poll(saved).toBe('Alpha,Gamma,Beta')
    await expect.element(page.getByRole('status')).toHaveTextContent('Moved to position 3 of 3.')

    ;(page.getByRole('button', { name: 'Reorder Beta' }).element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(saved()).toBe('Alpha,Gamma,Beta')

    await userEvent.keyboard('{ArrowUp}{ArrowLeft}')
    await expect.poll(saved).toBe('Beta,Alpha,Gamma')
    await userEvent.keyboard('{Enter}')
    expect(saved()).toBe('Beta,Alpha,Gamma')
    expect(page.getByRole('button', { name: 'Reorder Beta' }).element().getAttribute('title')).toBe('Drag to reorder, or use the arrow keys')
  })
})
