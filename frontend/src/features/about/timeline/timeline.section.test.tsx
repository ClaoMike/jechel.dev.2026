import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError, type EducationItem, type ExperienceItem } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView, textOf } from '../../../test/render'
import { currentMonth } from '../format'
import { EducationSection } from './EducationSection/EducationSection'
import { ExperienceSection } from './ExperienceSection/ExperienceSection'

function renderExperience({ value = ABOUT.experience, canEdit = false, onSave = vi.fn(async () => {}) }: { value?: ExperienceItem[]; canEdit?: boolean; onSave?: (v: ExperienceItem[]) => Promise<void> } = {}) {
  return renderView(<ExperienceSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const items = () => page.getByRole('region', { name: 'Work experience' }).getByRole('listitem').elements().filter((li) => li.classList.contains('timeline-item'))
const form = () => page.getByRole('form', { name: 'Edit Work experience' })
const role = (n: number) => form().getByRole('group', { name: `Role ${n}` })

describe('Work experience, for a visitor', () => {
  it('shows each role: title, company (a link) and place, when, and what was done', async () => {
    await renderExperience()
    const [first, second] = items()
    expect(first.querySelector('h3')?.textContent).toBe('Software Engineer')
    expect(first.querySelector('.timeline-meta')?.textContent).toBe('AcmeManchester')
    expect(first.querySelector('.timeline-meta a')?.getAttribute('href')).toBe('https://acme.example')
    expect(first.querySelector('time')?.textContent).toBe('Jul 2022 – Present')
    expect(first.querySelector('time')?.getAttribute('datetime')).toBe('2022-07')
    expect([...first.querySelectorAll('.bullets li')].map((li) => li.textContent)).toEqual(['Built the booking system.', 'Led the move to .NET 10.'])
    expect(second.querySelector('.timeline-meta')?.textContent).toBe('Globex')
    expect(second.querySelector('time')?.textContent).toBe('Jun 2021 – Sept 2021')
    expect(second.querySelector('.bullets')).toBeNull()
  })

  it('marks a role that has not started yet', async () => {
    await renderExperience({ value: [{ ...ABOUT.experience[0], start: '2099-01-01', end: null }] })
    expect(items()[0].querySelector('.tag')?.textContent).toBe('Upcoming')
    expect(items()[0].querySelector('time')?.textContent).toBe('Starting Jan 2099')
  })

  it('says so when there is nothing yet', async () => {
    await renderExperience({ value: [] })
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
  })
})

describe('Work experience, for the admin', () => {
  it("edits a role's fields and bullets, and saves", async () => {
    const onSave = vi.fn(async () => {})
    await renderExperience({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Work experience' }).click()
    await role(1).getByRole('textbox', { name: 'Job title' }).fill('Senior Engineer')
    await role(1).getByRole('textbox', { name: 'Location (optional)' }).fill('Remote')
    await role(1).getByRole('textbox', { name: 'Bullet point 2' }).fill('Mentored two juniors.')
    await role(1).getByRole('button', { name: 'Add bullet point' }).click()
    await role(1).getByRole('textbox', { name: 'Bullet point 3' }).fill('Ran the hiring.')
    await role(1).getByRole('button', { name: 'Move bullet point 3 up' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([
      { ...ABOUT.experience[0], title: 'Senior Engineer', location: 'Remote', bullets: [ABOUT.experience[0].bullets[0], 'Ran the hiring.', 'Mentored two juniors.'] },
      ABOUT.experience[1],
    ])
  })

  it('ends an ongoing role where it started, and makes an ended one ongoing', async () => {
    const onSave = vi.fn(async () => {})
    await renderExperience({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Work experience' }).click()
    await expect.element(role(1).getByRole('group', { name: 'End' })).not.toBeInTheDocument()
    await role(1).getByRole('checkbox', { name: 'Ongoing (no end date)' }).click()
    await expect.element(role(1).getByRole('textbox', { name: 'End year' })).toHaveValue('2022')
    await role(1).getByRole('textbox', { name: 'End year' }).fill('2025')
    await role(2).getByRole('checkbox', { name: 'Ongoing (no end date)' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([
      { ...ABOUT.experience[0], end: '2025-07-01' },
      { ...ABOUT.experience[1], end: null },
    ])
  })

  it('adds a role on top (this month, ongoing, one empty bullet), moves and removes roles', async () => {
    const onSave = vi.fn(async () => {})
    await renderExperience({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Work experience' }).click()
    await form().getByRole('button', { name: 'Add role' }).click()
    await expect.element(role(1).getByRole('textbox', { name: 'Job title' })).toHaveValue('')
    await role(1).getByRole('textbox', { name: 'Job title' }).fill('Founder')
    await role(1).getByRole('textbox', { name: 'Company' }).fill('Me Ltd')
    await form().getByRole('button', { name: 'Move role 3 up' }).click()
    await form().getByRole('button', { name: 'Remove role 3' }).click()
    await page.getByRole('dialog', { name: 'Remove role 3?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([
      { title: 'Founder', company: 'Me Ltd', location: '', start: currentMonth(), end: null, bullets: [''] },
      ABOUT.experience[1],
    ])
  })

  it('sorts by end date (ongoing first), and says so until the next change', async () => {
    const onSave = vi.fn(async () => {})
    await renderExperience({ canEdit: true, onSave, value: [ABOUT.experience[1], ABOUT.experience[0]] })
    await page.getByRole('button', { name: 'Edit Work experience' }).click()
    await form().getByRole('button', { name: 'Sort by end date' }).click()
    await expect.element(form().getByText('Sorted by end date, ongoing first. Save to keep this order, or Cancel to undo.')).toBeVisible()
    await role(1).getByRole('textbox', { name: 'Job title' }).fill('Engineer')
    await expect.element(form().getByText(/Sorted by end date/)).not.toBeInTheDocument()
    await form().getByRole('button', { name: 'Save' }).click()
    expect((onSave.mock.calls[0] as unknown as [ExperienceItem[]])[0].map((r) => r.company)).toEqual(['[Acme](https://acme.example)', 'Globex'])
  })

  it("shows the API's errors on each role's fields and bullets", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { 'experience[1].company': ['Required.'], 'experience[0].bullets[1]': ['Too long.'], 'experience[0].end': ['Before the start.'], experience: ['Too many.'] }))
    await renderExperience({ canEdit: true, onSave, value: [{ ...ABOUT.experience[0], end: '2020-01-01' }, ABOUT.experience[1]] })
    await page.getByRole('button', { name: 'Edit Work experience' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(role(2).getByRole('textbox', { name: 'Company' })).toHaveAccessibleDescription('Required.')
    await expect.element(role(1).getByRole('textbox', { name: 'Bullet point 2' })).toHaveAccessibleDescription('Too long.')
    await expect.element(role(1).getByRole('group', { name: 'End' })).toHaveAccessibleDescription('Before the start.')
    await expect.element(form().getByText('Too many.')).toBeVisible()
  })
})

describe('Education', () => {
  it('shows each course and institution, with no bullets', async () => {
    await renderView(<EducationSection value={ABOUT.education} canEdit={false} onSave={vi.fn()} />)
    await expect.poll(() => textOf(page.getByRole('region', { name: 'Education' }))).toContain('BSc Computer Science')
    expect(document.querySelector('.timeline-meta')?.textContent).toBe('The University of ManchesterManchester')
    expect(document.querySelector('time')?.textContent).toBe('Sept 2018 – Jun 2022')
  })

  it('edits a course (no bullets here) and adds one on top', async () => {
    const onSave = vi.fn(async () => {})
    await renderView(<EducationSection value={ABOUT.education} canEdit onSave={onSave} />)
    await page.getByRole('button', { name: 'Edit Education' }).click()
    const editForm = page.getByRole('form', { name: 'Edit Education' })
    await expect.element(editForm.getByRole('textbox', { name: /Bullet point/ })).not.toBeInTheDocument()
    await editForm.getByRole('button', { name: 'Add education' }).click()
    const first = editForm.getByRole('group', { name: 'Education 1' })
    await first.getByRole('textbox', { name: 'Degree or course' }).fill('MSc AI')
    await first.getByRole('textbox', { name: 'Institution' }).fill('Edinburgh')
    await editForm.getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([{ title: 'MSc AI', institution: 'Edinburgh', location: '', start: currentMonth(), end: null } satisfies EducationItem, ABOUT.education[0]])
  })
})
