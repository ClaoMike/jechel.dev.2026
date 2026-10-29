import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError, type Skill } from '@/shared/api'
import { ABOUT } from '@/test/fixtures/about'
import { renderView, textOf } from '@/test/render'
import { currentMonth } from '@/shared/lib/format'
import { SkillsChart } from './SkillsChart/SkillsChart'
import { SkillsSection, type SkillsValue } from './SkillsSection/SkillsSection'

const NOW = new Date(2026, 9, 19)
const VALUE: SkillsValue = { skills: ABOUT.skills, colors: ABOUT.colors.skills }

function renderSkills({
  value = VALUE,
  canEdit = false,
  onSave = vi.fn(async () => {}),
}: { value?: SkillsValue; canEdit?: boolean; onSave?: (v: SkillsValue) => Promise<void> } = {}) {
  return renderView(<SkillsSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const rows = () => page.getByRole('list', { name: 'Skills, with when and how each was used' })
const form = () => page.getByRole('form', { name: 'Edit Skills' })
const skillToggle = (name: string | RegExp) => form().getByRole('button', { name, expanded: undefined })

describe('the skills chart', () => {
  it('lists each skill with its total experience, and a bar for each period', async () => {
    await renderView(<SkillsChart skills={VALUE.skills} colors={VALUE.colors} now={NOW} />)
    const items = rows().getByRole('listitem').elements()
    expect(items.map((li) => li.querySelector('.skill-name')?.textContent)).toEqual(['C#', 'React', 'COBOL'])
    expect(items.map((li) => li.querySelector('.skill-value')?.textContent)).toEqual(['8 years', '6 years', ''])
    expect(items.map((li) => li.querySelectorAll('.skill-bar').length)).toEqual([1, 2, 0])
  })

  it('reads each bar out: what it was used for, and when', async () => {
    await renderView(<SkillsChart skills={VALUE.skills} colors={VALUE.colors} now={NOW} />)
    const [cSharp, react] = rows().getByRole('listitem').elements()
    expect(cSharp.querySelector('.skill-bar .visually-hidden')?.textContent).toBe(': Work, Academic, Sept 2018 – Present')
    expect(cSharp.querySelector('.skill-tooltip')?.textContent).toBe('C# Work, AcademicSept 2018 – Present')
    expect([...react.querySelectorAll('.skill-bar .visually-hidden')].map((s) => s.textContent)).toEqual([': Personal, Mar 2020 – Jun 2022', ': Work, Jan 2023 – Present'])
    expect(cSharp.querySelector('.skill-bar')?.getAttribute('tabindex')).toBe('0')
  })

  it('colours a bar by its uses, in bands when there are several, and places it on the time axis', async () => {
    await renderView(<SkillsChart skills={VALUE.skills} colors={VALUE.colors} now={NOW} />)
    const bar = rows().getByRole('listitem').elements()[0].querySelector<HTMLElement>('.skill-bar')!
    expect(bar.style.background).toContain('linear-gradient')
    const single = rows().getByRole('listitem').elements()[1].querySelector<HTMLElement>('.skill-bar')!
    expect(getComputedStyle(single).backgroundColor).toBe('rgb(34, 197, 94)')
    // From January 2018 to the end of 2026: a bar from September 2018 to now.
    expect(Number.parseFloat(bar.style.left)).toBeCloseTo((8 / (9 * 12)) * 100, 3)
    // Nine years: too many to label each, so every second one.
    expect([...document.querySelectorAll('.skill-axis-ticks span')].map((s) => s.textContent)).toEqual(['2018', '2020', '2022', '2024', '2026'])
  })

  it('has a legend of only the uses that appear', async () => {
    await renderView(<SkillsChart skills={[{ name: 'Go', periods: [{ start: '2024-01-01', end: null, uses: ['personal'] }] }]} colors={VALUE.colors} now={NOW} />)
    await expect.poll(() => textOf(page.getByRole('list', { name: 'Colours' }))).toBe('Personal')
  })
})

describe('Skills, as a section', () => {
  it('shows the chart, or says there are no skills yet', async () => {
    const view = await renderSkills()
    await expect.element(rows()).toBeVisible()
    await view.unmount()
    await renderSkills({ value: { ...VALUE, skills: [] } })
    await expect.element(page.getByText('No skills yet.')).toBeVisible()
  })
})

describe('Skills, for the admin', () => {
  it('folds each skill to its name and experience until opened', async () => {
    await renderSkills({ canEdit: true })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    const toggles = form()
      .getByRole('button')
      .elements()
      .filter((b) => b.classList.contains('accordion-toggle'))
    expect(toggles.map((b) => b.textContent)).toEqual([
      `C#${toggles[0].querySelector('.accordion-meta')!.textContent}`,
      `React${toggles[1].querySelector('.accordion-meta')!.textContent}`,
      'COBOLno dates',
    ])
    expect(toggles.every((b) => b.getAttribute('aria-expanded') === 'false')).toBe(true)
    // Folded: their fields are out of sight (and out of the accessibility tree).
    expect(form().getByRole('textbox', { name: 'Skill', exact: true }).elements()).toHaveLength(0)
    await skillToggle(/^React/).click()
    await expect.element(skillToggle(/^React/)).toHaveAttribute('aria-expanded', 'true')
    await expect.element(form().getByRole('group', { name: 'Skill 2' }).getByRole('textbox', { name: 'Skill', exact: true })).toHaveValue('React')
    await expect.element(form().getByRole('group', { name: 'Skill 2' }).getByRole('group', { name: 'Period 2' })).toBeVisible()
    expect(form().getByRole('textbox', { name: 'Skill', exact: true }).elements()).toHaveLength(1)
  })

  it('sorts by experience and says so until the next change; sorting needs two skills', async () => {
    const onSave = vi.fn(async () => {})
    await renderSkills({ canEdit: true, onSave, value: { ...VALUE, skills: [VALUE.skills[2], VALUE.skills[1], VALUE.skills[0]] } })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await form().getByRole('button', { name: 'Sort by experience' }).click()
    await expect.element(form().getByText('Sorted by experience, most first. Save to keep this order, or Cancel to undo.')).toBeVisible()
    await form().getByRole('button', { name: 'Move skill 3 up' }).click()
    await expect.element(form().getByText(/Sorted by experience/)).not.toBeInTheDocument()
    await form().getByRole('button', { name: 'Save' }).click()
    expect((onSave.mock.calls[0] as unknown as [SkillsValue])[0].skills.map((s) => s.name)).toEqual(['C#', 'COBOL', 'React'])
  })

  it('cannot sort a single skill', async () => {
    await renderSkills({ canEdit: true, value: { ...VALUE, skills: [VALUE.skills[0]] } })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await expect.element(form().getByRole('button', { name: 'Sort by experience' })).toBeDisabled()
  })

  it('adds a skill, open, used for work from this month; and saves its name and colours', async () => {
    const onSave = vi.fn(async () => {})
    await renderSkills({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await form().getByRole('button', { name: 'Add skill' }).click()
    await expect.element(skillToggle('Skill 4 no dates').or(skillToggle(/^Skill 4/))).toHaveAttribute('aria-expanded', 'true')
    await form().getByRole('group', { name: 'Skill 4' }).getByRole('textbox', { name: 'Skill', exact: true }).fill('Rust')
    await form().getByRole('group', { name: 'Colours' }).getByLabelText('Academic').fill('#123456')
    await form().getByRole('button', { name: 'Save' }).click()
    const saved = (onSave.mock.calls[0] as unknown as [SkillsValue])[0]
    expect(saved.skills.at(-1)).toEqual({ name: 'Rust', periods: [{ start: currentMonth(), end: null, uses: ['work'] }] } satisfies Skill)
    expect(saved.colors).toEqual({ ...VALUE.colors, academic: '#123456' })
  })

  it('edits a period: dates, still in use, and what it was used for; adds one after the last, and removes one', async () => {
    const onSave = vi.fn(async () => {})
    await renderSkills({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await skillToggle(/^React/).click()
    const react = form().getByRole('group', { name: 'Skill 2' })
    const period2 = react.getByRole('group', { name: 'Period 2' })
    await period2.getByRole('checkbox', { name: 'Still using it' }).click()
    await expect.element(period2.getByRole('group', { name: 'To' })).toBeVisible()
    await period2.getByRole('textbox', { name: 'To year' }).fill('2024')
    await period2.getByRole('checkbox', { name: 'Academic' }).click()
    await react.getByRole('button', { name: 'Add period to skill 2' }).click()
    await expect.element(react.getByRole('group', { name: 'Period 3' }).getByRole('textbox', { name: 'From year' })).toHaveValue('2024')
    await react.getByRole('button', { name: 'Remove period 1 of skill 2' }).click()
    await page.getByRole('dialog', { name: 'Remove period 1 of skill 2?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    const saved = (onSave.mock.calls[0] as unknown as [SkillsValue])[0]
    expect(saved.skills[1].periods).toEqual([
      { start: '2023-01-01', end: '2024-01-01', uses: ['work', 'academic'] },
      { start: '2024-01-01', end: null, uses: ['work'] },
    ])
  })

  it('moves when a period started, and folds a skill again', async () => {
    const onSave = vi.fn(async () => {})
    await renderSkills({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await skillToggle(/^React/).click()
    const react = form().getByRole('group', { name: 'Skill 2' })
    await react.getByRole('group', { name: 'Period 1' }).getByRole('textbox', { name: 'From year' }).fill('2018')
    await skillToggle(/^React/).click()
    await expect.element(skillToggle(/^React/)).toHaveAttribute('aria-expanded', 'false')
    await form().getByRole('button', { name: 'Save' }).click()
    const saved = (onSave.mock.calls[0] as unknown as [SkillsValue])[0]
    expect(saved.skills[1].periods[0].start).toMatch(/^2018-/)
  })

  it('moves and removes skills, keeping each open one open', async () => {
    const onSave = vi.fn(async () => {})
    await renderSkills({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await skillToggle(/^C#/).click()
    await form().getByRole('button', { name: 'Move skill 1 down' }).click()
    await expect.element(skillToggle(/^C#/)).toHaveAttribute('aria-expanded', 'true')
    await expect.element(skillToggle(/^React/)).toHaveAttribute('aria-expanded', 'false')
    await form().getByRole('button', { name: 'Remove skill 1' }).click()
    await page.getByRole('dialog', { name: 'Remove skill 1?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await expect.element(skillToggle(/^C#/)).toHaveAttribute('aria-expanded', 'true')
    await form().getByRole('button', { name: 'Save' }).click()
    expect((onSave.mock.calls[0] as unknown as [SkillsValue])[0].skills.map((s) => s.name)).toEqual(['C#', 'COBOL'])
  })

  it('keeps a skill with an error open, showing its errors in place', async () => {
    const onSave = vi.fn().mockRejectedValue(
      new ApiError('/api/about', 400, {
        'skills[2].name': ['Required.'],
        'skills[2].periods': ['Add a period.'],
        'skills[0].periods[0].uses': ['Tick one.'],
        'colors.skills.work': ['Not a colour.'],
      }),
    )
    await renderSkills({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Skills' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(skillToggle(/^COBOL/)).toBeDisabled()
    await expect.element(skillToggle(/^COBOL/)).toHaveAttribute('aria-expanded', 'true')
    await expect.element(form().getByRole('group', { name: 'Skill 3' }).getByRole('textbox', { name: 'Skill', exact: true })).toHaveAccessibleDescription('Required.')
    await expect.element(form().getByText('Add a period.')).toBeVisible()
    await expect.element(form().getByRole('group', { name: 'Skill 1' }).getByRole('group', { name: 'Used for' })).toHaveAccessibleDescription('Tick one.')
    await expect.element(form().getByRole('group', { name: 'Colours' }).getByLabelText('Work')).toHaveAccessibleDescription('Not a colour.')
  })
})
