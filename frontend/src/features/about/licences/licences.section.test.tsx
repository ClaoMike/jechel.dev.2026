import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { ApiError, type Licence } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView, textOf } from '../../../test/render'
import { LicencesSection } from './LicencesSection/LicencesSection'

function renderLicences({ value = ABOUT.licences, canEdit = false, onSave = vi.fn(async () => {}) }: { value?: Licence[]; canEdit?: boolean; onSave?: (v: Licence[]) => Promise<void> } = {}) {
  return renderView(<LicencesSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const form = () => page.getByRole('form', { name: 'Edit Licences' })

describe('Licences', () => {
  it('groups licences by kind, offered ones in the catalogue order, kinds without any left out', async () => {
    await renderLicences()
    await expect.poll(() => textOf(page.getByRole('list', { name: 'Driving licences' }))).toBe('AMMopedBCar')
    await expect.poll(() => textOf(page.getByRole('list', { name: 'Boating licences' }))).toBe('Day Skipper')
    await expect.poll(() => textOf(page.getByRole('list', { name: 'Other licences' }))).toBe('TTractor')
    await expect.element(page.getByRole('list', { name: 'Flying licences' })).not.toBeInTheDocument()
    expect([...document.querySelectorAll('.licence-group-title')].map((h) => h.textContent)).toEqual(['Driving', 'Boating', 'Other'])
  })

  it('says so when there are none', async () => {
    await renderLicences({ value: [] })
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
  })

  it('switches offered licences on and off with a click', async () => {
    const onSave = vi.fn(async () => {})
    await renderLicences({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Licences' }).click()
    await expect.element(form().getByRole('button', { name: 'B Car' })).toHaveAttribute('aria-pressed', 'true')
    await form().getByRole('button', { name: 'B Car' }).click()
    await form().getByRole('button', { name: 'PPL(A) Private pilot, aeroplanes' }).click()
    await expect.element(form().getByRole('button', { name: 'PPL(A) Private pilot, aeroplanes' })).toHaveAttribute('aria-pressed', 'true')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([ABOUT.licences[1], ABOUT.licences[2], ABOUT.licences[3], { category: 'flying', code: 'PPL(A)', name: 'Private pilot, aeroplanes' }])
  })

  it('adds a licence of your own (Enter works too), once; asks for what it is for', async () => {
    const onSave = vi.fn(async () => {})
    await renderLicences({ canEdit: true, onSave, value: [] })
    await page.getByRole('button', { name: 'Edit Licences' }).click()
    await form().getByRole('button', { name: 'Add licence' }).click()
    await expect.element(form().getByRole('textbox', { name: 'For' })).toHaveAccessibleDescription('Enter what the licence is for.')
    await form().getByRole('combobox', { name: 'Kind' }).selectOptions('Flying')
    await form().getByRole('textbox', { name: 'Code (optional)' }).fill(' UL ')
    await form().getByRole('textbox', { name: 'For' }).fill(' Microlight ')
    await expect.element(form().getByRole('textbox', { name: 'For' })).not.toHaveAccessibleDescription('Enter what the licence is for.')
    await userEvent.keyboard('{Enter}')
    await expect.element(form().getByRole('textbox', { name: 'For' })).toHaveValue('')
    await form().getByRole('textbox', { name: 'Code (optional)' }).fill('UL')
    await form().getByRole('textbox', { name: 'For' }).fill('Microlight')
    await form().getByRole('button', { name: 'Add licence' }).click()
    await expect.poll(() => textOf(form().getByRole('list').filter({ hasText: 'Microlight' }))).toContain('ULMicrolight Flying')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([{ category: 'flying', code: 'UL', name: 'Microlight' }])
  })

  it('removes a licence of your own, after asking, and shows its errors', async () => {
    const onSave = vi.fn().mockRejectedValueOnce(new ApiError('/api/about', 400, { 'licences[3].name': ['Too long.'], licences: ['Too many.'] })).mockResolvedValue(undefined)
    await renderLicences({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Licences' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(form().getByText('Too long.')).toBeVisible()
    await expect.element(form().getByText('Too many.')).toBeVisible()
    await form().getByRole('button', { name: 'Remove Tractor' }).click()
    await page.getByRole('dialog', { name: 'Remove Tractor?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenLastCalledWith(ABOUT.licences.slice(0, 3))
  })
})
