import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, type ResumeSettingsDetails } from '../../../services/api'
import { RESUME } from '../../../test/fixtures/site'
import { ADMIN, forever, renderView, textOf } from '../../../test/render'
import { ResumePanel } from './ResumePanel'

const SKILLS = ['C#', 'React', 'COBOL']

async function renderPanel(settings: () => Promise<ResumeSettingsDetails> = async () => structuredClone(RESUME)) {
  const getSettings = vi.spyOn(api.resume, 'getSettings').mockImplementation(settings)
  await renderView(<ResumePanel skills={SKILLS} />, { user: ADMIN })
  await page.getByText('Résumé generator').click()
  return { getSettings }
}

const sections = () => page.getByRole('group', { name: 'Sections to include' })
const skills = () => page.getByRole('group', { name: 'Skills to show' })

describe('the résumé generator', () => {
  it('is folded away until opened, and says only the admin sees it', async () => {
    await renderView(<ResumePanel skills={SKILLS} />, { user: ADMIN })
    expect(document.querySelector('details.resume-panel')?.hasAttribute('open')).toBe(false)
    await expect.poll(() => document.querySelector('summary')?.textContent).toBe('Résumé generator · only you see this')
  })

  it('shows the saved choices: which sections go in, in print order, and which skills', async () => {
    await renderPanel(async () => ({ ...structuredClone(RESUME), excludedSkills: ['cobol'] }))
    await expect.poll(() => sections().getByRole('checkbox').elements().length).toBe(12)
    expect(sections().getByRole('checkbox').elements().map((c) => c.parentElement!.textContent)).toEqual([
      'Citizenship and residence',
      'Links (this site, GitHub, LinkedIn)',
      'Work experience',
      'Skills',
      'Education',
      'Qualifications',
      'Academic papers',
      'Hackathons',
      'Problem solving (LeetCode, NeetCode)',
      'Languages',
      'Licences',
      "Where I've been (as a list)",
    ])
    await expect.element(sections().getByRole('checkbox', { name: 'Work experience' })).toBeChecked()
    await expect.element(sections().getByRole('checkbox', { name: 'Languages' })).not.toBeChecked()
    // Skills are matched whatever their case.
    await expect.element(skills().getByRole('checkbox', { name: 'COBOL' })).not.toBeChecked()
    await expect.element(skills().getByRole('checkbox', { name: 'React' })).toBeChecked()
  })

  it('only asks which skills to show while Skills is in', async () => {
    await renderPanel()
    await expect.element(skills()).toBeVisible()
    await sections().getByRole('checkbox', { name: 'Skills' }).click()
    await expect.element(skills()).not.toBeInTheDocument()
  })

  it('generates both résumés with the choices, saying when they are ready', async () => {
    const generate = vi.spyOn(api.resume, 'generate').mockResolvedValue({ ...RESUME, generatedAt: '2026-10-19T09:30:00Z' })
    await renderPanel()
    await sections().getByRole('checkbox', { name: 'Languages' }).click()
    await skills().getByRole('checkbox', { name: 'COBOL' }).click()
    await page.getByRole('button', { name: 'Generate résumés' }).click()
    expect(generate).toHaveBeenCalledWith({ sections: ['statuses', 'links', 'experience', 'skills', 'education', 'languages'], excludedSkills: ['COBOL'] })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Both résumés are ready. Visitors now download the public copy.')
  })

  it('saves the choices without generating', async () => {
    const save = vi.spyOn(api.resume, 'saveChoices').mockResolvedValue(RESUME)
    await renderPanel()
    await page.getByRole('button', { name: 'Save without generating' }).click()
    expect(save).toHaveBeenCalledWith({ sections: RESUME.sections, excludedSkills: [] })
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Saved.')
  })

  it('waits while it works, then says when it failed', async () => {
    let fail!: (e: unknown) => void
    vi.spyOn(api.resume, 'generate').mockReturnValue(new Promise((_, reject) => (fail = reject)))
    vi.spyOn(api.resume, 'saveChoices').mockRejectedValue(new ApiError('/api/resume/choices', 500))
    await renderPanel()
    await page.getByRole('button', { name: 'Generate résumés' }).click()
    await expect.element(page.getByRole('button', { name: 'Generating…' })).toBeDisabled()
    await expect.element(page.getByRole('button', { name: 'Save without generating' })).toBeDisabled()
    fail(new ApiError('/api/resume/generate', 500))
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("The résumés couldn't be generated. Please try again.")
    await page.getByRole('button', { name: 'Save without generating' }).click()
    await expect.poll(() => textOf(page.getByRole('status'))).toBe("That couldn't be saved. Please try again.")
  })

  it('offers both copies to download, each tagged with when it was made', async () => {
    await renderPanel()
    await expect.element(page.getByText('Last generated 10 Oct 2026, 11:00.')).toBeVisible()
    const version = `?v=${Date.parse(RESUME.generatedAt!)}`
    await expect.element(page.getByRole('link', { name: 'Download private copy' })).toHaveAttribute('href', `${api.resume.privateUrl}${version}`)
    await expect.element(page.getByRole('link', { name: 'Download public copy' })).toHaveAttribute('href', `${api.resume.publicUrl}${version}`)
  })

  it('says when it was never generated', async () => {
    await renderPanel(async () => ({ ...structuredClone(RESUME), generatedAt: null }))
    await expect.element(page.getByText('Not generated yet.')).toBeVisible()
    await expect.element(page.getByRole('link', { name: /Download/ })).not.toBeInTheDocument()
  })

  it("shows the settings' shape while they load, and a retry when they can't", async () => {
    await renderPanel(() => forever())
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading the résumé settings…')
  })

  it("retries the settings that couldn't be loaded", async () => {
    const { getSettings } = await renderPanel(vi.fn().mockRejectedValueOnce(new ApiError('/api/resume/settings', 500)).mockResolvedValue(structuredClone(RESUME)))
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("The résumé settings couldn't be loaded.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(sections()).toBeVisible()
    expect(getSettings).toHaveBeenCalledTimes(2)
  })
})
