import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { ApiError, type Hackathon } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView } from '../../../test/render'
import { HackathonsSection } from './HackathonsSection/HackathonsSection'

function renderHackathons({ value = ABOUT.hackathons, canEdit = false, onSave = vi.fn(async () => {}) }: { value?: Hackathon[]; canEdit?: boolean; onSave?: (v: Hackathon[]) => Promise<void> } = {}) {
  return renderView(<HackathonsSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const form = () => page.getByRole('form', { name: 'Edit Hackathons' })
const hackathon = (n: number) => form().getByRole('group', { name: `Hackathon ${n}` })

describe('Hackathons', () => {
  it('shows each one on the timeline: its name (a link), its year and what happened', async () => {
    await renderHackathons()
    const item = document.querySelector('.timeline-item')!
    expect(item.querySelector('h3 a')?.getAttribute('href')).toBe('https://hackmanchester.com')
    expect(item.querySelector('time')?.textContent).toBe('2021')
    expect(item.querySelector('time')?.getAttribute('datetime')).toBe('2021')
    expect(item.querySelector('.bullets')?.textContent).toBe('Won best use of AI.')
    expect(item.querySelector('.timeline-meta')).toBeNull()
  })

  it('says so when there are none', async () => {
    await renderHackathons({ value: [] })
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
  })

  it('adds one on top for this year, and keeps a half-typed year until it is a full one', async () => {
    const onSave = vi.fn(async () => {})
    await renderHackathons({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Hackathons' }).click()
    await form().getByRole('button', { name: 'Add hackathon' }).click()
    const year = hackathon(1).getByRole('textbox', { name: 'Year' })
    await expect.element(year).toHaveValue(String(new Date().getFullYear()))
    await hackathon(1).getByRole('textbox', { name: 'Name' }).fill('Junction')
    await year.fill('20')
    await expect.element(year).toHaveAttribute('aria-invalid', 'true')
    await year.fill('2019')
    await expect.element(year).not.toHaveAttribute('aria-invalid')
    await hackathon(1).getByRole('textbox', { name: 'Bullet point 1' }).fill('Built a drone app.')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([{ name: 'Junction', year: 2019, bullets: ['Built a drone app.'] }, ABOUT.hackathons[0]])
  })

  it('sorts by year, newest first', async () => {
    const onSave = vi.fn(async () => {})
    await renderHackathons({ canEdit: true, onSave, value: [{ name: 'Old', year: 2015, bullets: [] }, ...ABOUT.hackathons] })
    await page.getByRole('button', { name: 'Edit Hackathons' }).click()
    await form().getByRole('button', { name: 'Sort by year' }).click()
    await expect.element(form().getByText('Sorted by year, newest first. Save to keep this order, or Cancel to undo.')).toBeVisible()
    await form().getByRole('button', { name: 'Save' }).click()
    expect((onSave.mock.calls[0] as unknown as [Hackathon[]])[0].map((h) => h.year)).toEqual([2021, 2015])
  })

  it("shows the API's errors on the year, the name and the bullets", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { 'hackathons[0].year': ['Too early.'], 'hackathons[0].name': ['Required.'], 'hackathons[0].bullets[0]': ['Too long.'], 'hackathons[0].bullets': ['Too many.'] }))
    await renderHackathons({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Hackathons' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(hackathon(1).getByRole('textbox', { name: 'Year' })).toHaveAccessibleDescription('Too early.')
    await expect.element(hackathon(1).getByRole('textbox', { name: 'Year' })).toHaveAttribute('aria-invalid', 'true')
    await expect.element(hackathon(1).getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Required.')
    await expect.element(hackathon(1).getByRole('textbox', { name: 'Bullet point 1' })).toHaveAccessibleDescription('Too long.')
    await expect.element(hackathon(1).getByText('Too many.')).toBeVisible()
  })
})
