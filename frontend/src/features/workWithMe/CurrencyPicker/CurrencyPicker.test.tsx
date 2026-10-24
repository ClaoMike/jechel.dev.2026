import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { renderView } from '../../../test/render'
import { CurrencyPicker } from './CurrencyPicker'

// A short dropdown of currencies, each with its coin, the favourites first; usable with the mouse or the keyboard alone.

function Picker({ start = 'EUR' }: { start?: string }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <button type="button">Elsewhere</button>
      <CurrencyPicker label="Currency" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

const combobox = () => page.getByRole('combobox', { name: 'Currency' })
const listbox = () => page.getByRole('listbox', { name: 'Currency' })
const chosen = () => document.querySelector('output')!.textContent
const active = () => document.getElementById(combobox().element().getAttribute('aria-activedescendant') ?? '')?.textContent

describe('the currency picker', () => {
  it('shows the chosen currency with its coin, closed', async () => {
    await renderView(<Picker />)
    await expect.element(combobox()).toHaveTextContent('€EUREuro')
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(listbox().query()).toBeNull()
  })

  it('lists the favourites (EUR, RON, GBP) first, then the others, each with its coin, the chosen one ticked', async () => {
    await renderView(<Picker start="RON" />)
    await combobox().click()
    await expect.element(listbox()).toBeVisible()
    const groups = listbox().getByRole('group')
    expect(groups.elements().map((g) => g.getAttribute('aria-label'))).toEqual(['Favourites', 'Other currencies'])
    expect(
      groups
        .first()
        .getByRole('option')
        .elements()
        .map((o) => o.querySelector('.currency-code')!.textContent),
    ).toEqual(['EUR', 'RON', 'GBP'])
    expect(groups.last().getByRole('option').elements()).toHaveLength(10)
    const options = listbox().getByRole('option').elements()
    expect(options.every((o) => o.querySelector('.currency-coin')?.getAttribute('aria-hidden') === 'true')).toBe(true)
    expect(options.filter((o) => o.getAttribute('aria-selected') === 'true').map((o) => o.querySelector('.currency-code')!.textContent)).toEqual(['RON'])
  })

  it('picks one with a click, and closes', async () => {
    await renderView(<Picker />)
    await combobox().click()
    await page.getByRole('option', { name: /USD/ }).click()
    expect(chosen()).toBe('USD')
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
    await expect.element(combobox()).toHaveTextContent('$USDUS dollar')
  })

  it('closes on a click elsewhere, or on its own button again, without changing the currency', async () => {
    await renderView(<Picker />)
    await combobox().click()
    await page.getByRole('button', { name: 'Elsewhere' }).click()
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
    await combobox().click()
    await combobox().click()
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(chosen()).toBe('EUR')
  })

  it('works from the keyboard alone: opens on the chosen one, moves, jumps by letter, picks, and Escape changes nothing', async () => {
    await renderView(<Picker start="RON" />)
    combobox().element().focus()

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'true')
    expect(active()).toContain('RON')
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).toContain('GBP')
    await userEvent.keyboard('{End}')
    expect(active()).toContain('AUD')
    await userEvent.keyboard('{ArrowDown}')
    expect(active()).toContain('AUD')
    await userEvent.keyboard('{Home}')
    expect(active()).toContain('EUR')
    await userEvent.keyboard('{ArrowUp}')
    expect(active()).toContain('EUR')
    await userEvent.keyboard('c')
    expect(active()).toContain('CHF')
    await userEvent.keyboard('c')
    expect(active()).toContain('CZK')
    await userEvent.keyboard('c')
    expect(active()).toContain('CAD')
    await userEvent.keyboard('c')
    expect(active()).toContain('CHF')

    await userEvent.keyboard('{Escape}')
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(combobox().element().hasAttribute('aria-activedescendant')).toBe(false)
    expect(chosen()).toBe('RON')

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.keyboard('{Enter}')
    expect(chosen()).toBe('EUR')
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
    expect(document.activeElement).toBe(combobox().element())

    await userEvent.keyboard(' ')
    await userEvent.keyboard('g')
    await userEvent.keyboard(' ')
    expect(chosen()).toBe('GBP')
  })

  it('picks the highlighted one on Tab, moving on', async () => {
    await renderView(<Picker />)
    combobox().element().focus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Tab}')
    expect(chosen()).toBe('RON')
    await expect.element(combobox()).toHaveAttribute('aria-expanded', 'false')
  })
})
