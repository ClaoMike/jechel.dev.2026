import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError, type Qualification } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView } from '../../../test/render'
import { currentMonth } from '../format'
import { QualificationsSection } from './QualificationsSection/QualificationsSection'

function renderQualifications({ value = ABOUT.qualifications, canEdit = false, onSave = vi.fn(async () => {}) }: { value?: Qualification[]; canEdit?: boolean; onSave?: (v: Qualification[]) => Promise<void> } = {}) {
  return renderView(<QualificationsSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const form = () => page.getByRole('form', { name: 'Edit Qualifications' })
const qualification = (n: number) => form().getByRole('group', { name: `Qualification ${n}` })

describe('Qualifications', () => {
  it('shows what, who issued it (a link), when and the grade; leaving out what is missing', async () => {
    await renderQualifications()
    const [aws, firstAid] = [...document.querySelectorAll('.qualification')]
    expect(aws.querySelector('.qualification-title')?.textContent).toBe('AWS Certified Developer')
    expect(aws.querySelector('.qualification-meta')?.textContent).toBe('AmazonMay 2023Grade: 870/1000')
    expect(aws.querySelector('.qualification-meta a')?.getAttribute('href')).toBe('https://aws.amazon.com')
    expect(aws.querySelector('time')?.getAttribute('datetime')).toBe('2023-05')
    expect(firstAid.querySelector('.qualification-meta')?.textContent).toBe('')
  })

  it('says so when there are none', async () => {
    await renderQualifications({ value: [] })
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
  })

  it('edits, adds (dated this month), moves and removes qualifications', async () => {
    const onSave = vi.fn(async () => {})
    await renderQualifications({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Qualifications' }).click()
    await qualification(1).getByRole('textbox', { name: 'Grade (optional)' }).fill('900/1000')
    await qualification(2).getByRole('textbox', { name: 'Obtained year' }).fill('2019')
    await form().getByRole('button', { name: 'Add qualification' }).click()
    await qualification(3).getByRole('textbox', { name: 'Qualification' }).fill('Scrum Master')
    await form().getByRole('button', { name: 'Move qualification 3 up' }).click()
    await form().getByRole('button', { name: 'Remove qualification 1' }).click()
    await page.getByRole('dialog', { name: 'Remove qualification 1?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([
      { title: 'Scrum Master', issuer: '', obtained: currentMonth(), grade: '' },
      { ...ABOUT.qualifications[1], obtained: '2019-01-01' },
    ])
  })

  it("shows the API's errors on each field", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { 'qualifications[0].title': ['Required.'], 'qualifications[0].grade': ['Too long.'], 'qualifications[1].obtained': ['In the future.'] }))
    await renderQualifications({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Qualifications' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(qualification(1).getByRole('textbox', { name: 'Qualification' })).toHaveAccessibleDescription('Required.')
    await expect.element(qualification(1).getByRole('textbox', { name: 'Grade (optional)' })).toHaveAccessibleDescription('Too long.')
    await expect.element(qualification(2).getByRole('group', { name: 'Obtained' })).toHaveAccessibleDescription('In the future.')
  })
})
