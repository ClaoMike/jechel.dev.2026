import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError, type Language } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView } from '../../../test/render'
import { LanguagesSection } from './LanguagesSection/LanguagesSection'

function renderLanguages({ value = ABOUT.languages, canEdit = false, onSave = vi.fn(async () => {}) }: { value?: Language[]; canEdit?: boolean; onSave?: (v: Language[]) => Promise<void> } = {}) {
  return renderView(<LanguagesSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const form = () => page.getByRole('form', { name: 'Edit Languages' })
const language = (n: number) => form().getByRole('group', { name: `Language ${n}` })

describe('Languages', () => {
  it('shows each language, its level in words, and as filled steps (5 native, 1 beginner)', async () => {
    await renderLanguages()
    const rows = [...document.querySelectorAll('.language')]
    expect(rows.map((r) => `${r.querySelector('.language-name')?.textContent} ${r.querySelector('.language-level')?.textContent}`)).toEqual(['Romanian Native', 'English Fluent', 'Spanish Beginner'])
    expect(rows.map((r) => r.querySelectorAll('.language-step-on').length)).toEqual([5, 4, 1])
    expect(rows[0].querySelector('.language-steps')?.getAttribute('aria-hidden')).toBe('true')
  })

  it('says so when there are none', async () => {
    await renderLanguages({ value: [] })
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
  })

  it('edits a level, adds one (as a beginner), moves and removes languages', async () => {
    const onSave = vi.fn(async () => {})
    await renderLanguages({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Languages' }).click()
    await language(3).getByRole('combobox', { name: 'Level' }).selectOptions('Intermediate')
    await form().getByRole('button', { name: 'Add language' }).click()
    await expect.element(language(4).getByRole('combobox', { name: 'Level' })).toHaveValue('beginner')
    await language(4).getByRole('textbox', { name: 'Language' }).fill('German')
    await form().getByRole('button', { name: 'Move language 4 up' }).click()
    await form().getByRole('button', { name: 'Remove language 2' }).click()
    await page.getByRole('dialog', { name: 'Remove language 2?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([ABOUT.languages[0], { name: 'German', level: 'beginner' }, { name: 'Spanish', level: 'intermediate' }])
  })

  it("shows the API's errors on the name and the level", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { 'languages[0].name': ['Required.'], 'languages[1].level': ['Unknown level.'] }))
    await renderLanguages({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Languages' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(language(1).getByRole('textbox', { name: 'Language' })).toHaveAccessibleDescription('Required.')
    await expect.element(language(2).getByRole('combobox', { name: 'Level' })).toHaveAttribute('aria-invalid', 'true')
    await expect.element(language(2).getByText('Unknown level.')).toBeVisible()
  })
})
