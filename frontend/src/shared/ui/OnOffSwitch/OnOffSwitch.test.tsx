import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { useState } from 'react'
import { renderView } from '@/test/render'
import { OnOffSwitch } from './OnOffSwitch'

// On or Off, looking like the theme switcher: two radio buttons in a group named after what they switch.

function Controlled({ start = true, onChange = () => {} }: { start?: boolean; onChange?: (on: boolean) => void }) {
  const [on, setOn] = useState(start)
  return (
    <OnOffSwitch
      label="Site error"
      on={on}
      onChange={(next) => {
        setOn(next)
        onChange(next)
      }}
    />
  )
}

const group = () => page.getByRole('group', { name: 'Site error' })

describe('OnOffSwitch', () => {
  it('is a group named after what it switches, with On and Off, one of them chosen', async () => {
    await renderView(<Controlled />)
    await expect.element(group()).toBeVisible()
    await expect.element(group().getByRole('radio', { name: 'On' })).toBeChecked()
    await expect.element(group().getByRole('radio', { name: 'Off' })).not.toBeChecked()
    expect(group().element().classList.contains('theme-switch')).toBe(true)
  })

  it('switches with a click, and slides its thumb to the chosen side', async () => {
    const changed = vi.fn()
    await renderView(<Controlled onChange={changed} />)
    const fieldset = group().element() as HTMLElement
    expect(fieldset.style.getPropertyValue('--theme-index')).toBe('0')

    await group().getByText('Off').click()
    expect(changed).toHaveBeenLastCalledWith(false)
    await expect.element(group().getByRole('radio', { name: 'Off' })).toBeChecked()
    expect(fieldset.style.getPropertyValue('--theme-index')).toBe('1')

    await group().getByText('On').click()
    expect(changed).toHaveBeenLastCalledWith(true)
  })

  it('switches with the arrow keys', async () => {
    const changed = vi.fn()
    await renderView(<Controlled onChange={changed} />)
    ;(group().getByRole('radio', { name: 'On' }).element() as HTMLElement).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(changed).toHaveBeenLastCalledWith(false)
    await userEvent.keyboard('{ArrowLeft}')
    expect(changed).toHaveBeenLastCalledWith(true)
  })

  it("can't be changed while disabled", async () => {
    const changed = vi.fn()
    await renderView(<OnOffSwitch label="Site error" on onChange={changed} disabled />)
    await expect.element(group().getByRole('radio', { name: 'Off' })).toBeDisabled()
    await group().getByText('Off').click({ force: true })
    expect(changed).not.toHaveBeenCalled()
  })

  it('gives each switch its own buttons, so two never move together', async () => {
    const first = vi.fn()
    const second = vi.fn()
    await renderView(
      <>
        <OnOffSwitch label="One" on onChange={first} />
        <OnOffSwitch label="Two" on onChange={second} />
      </>,
    )
    await page.getByRole('group', { name: 'Two' }).getByText('Off').click()
    expect(second).toHaveBeenCalledWith(false)
    expect(first).not.toHaveBeenCalled()
    await expect.element(page.getByRole('group', { name: 'One' }).getByRole('radio', { name: 'On' })).toBeChecked()
  })
})
