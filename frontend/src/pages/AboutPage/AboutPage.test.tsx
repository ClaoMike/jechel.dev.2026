import { afterEach, describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '../../layout/theme'
import { ApiError, type AboutContent } from '../../services/api'
import { a11yViolations } from '../../test/a11y'
import { stubApi, type ApiStubs } from '../../test/api'
import { ABOUT, EMPTY_ABOUT } from '../../test/fixtures/about'
import { RESUME } from '../../test/fixtures/site'
import { ADMIN, forever, renderView, shootWhole, textOf, type RenderViewOptions } from '../../test/render'
import { AboutPage } from './AboutPage'

const SECTIONS = ['Photo and links', "Where I've been", 'Problem solving', 'Skills', 'Work experience', 'Education', 'Academic papers', 'Qualifications', 'Languages', 'Licences', 'Hackathons']

let api: ApiStubs
const renderAbout = async (options: RenderViewOptions = {}) => {
  api ??= stubApi()
  return renderView(<AboutPage />, { path: '/about', ...options })
}
const asAdmin = (options: RenderViewOptions = {}) => {
  api = stubApi({ user: ADMIN })
  return renderAbout({ user: ADMIN, ...options })
}

afterEach(() => {
  api = undefined!
})

const headings = () => page.getByRole('heading', { level: 2 }).elements().map((h) => h.textContent)

describe('About Me, for a visitor', () => {
  it('shows every section, in order, with no editing and no résumé generator', async () => {
    await renderAbout()
    await expect.element(page.getByRole('region', { name: 'Hackathons' })).toBeVisible()
    expect(headings()).toEqual(['About Me', ...SECTIONS])
    await expect.element(page.getByRole('button', { name: /^Edit/ })).not.toBeInTheDocument()
    await expect.element(page.getByText('Résumé generator')).not.toBeInTheDocument()
    expect(api.resume.getSettings).not.toHaveBeenCalled()
  })

  it('shows the page’s shape while it loads (with a hidden heading)', async () => {
    api = stubApi()
    api.about.get.mockReturnValue(forever())
    await renderAbout()
    await expect.poll(() => textOf(page.getByRole('status'))).toBe('Loading About Me…')
    expect(headings()).toEqual(['About Me'])
  })

  it("says the page couldn't be loaded, and loads it on retry", async () => {
    api = stubApi()
    api.about.get.mockRejectedValueOnce(new ApiError('/api/about', 500))
    await renderAbout()
    await expect.poll(() => textOf(page.getByRole('alert'))).toContain("This page couldn't be loaded.")
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(page.getByRole('region', { name: 'Skills' })).toBeVisible()
  })

  it('shows an empty page section by section', async () => {
    api = stubApi()
    api.about.get.mockResolvedValue(structuredClone(EMPTY_ABOUT))
    await renderAbout()
    await expect.element(page.getByRole('region', { name: 'Hackathons' })).toBeVisible()
    expect(page.getByText('Nothing here yet.').elements().length).toBe(8)
    await expect.element(page.getByText('No skills yet.')).toBeVisible()
    await expect.element(page.getByText('No places yet.')).toBeVisible()
  })
})

describe('About Me, the headline under the name', () => {
  const headline = () => document.querySelector('.profile-headline')?.textContent

  it("shows the résumé's headline to visitors, from the public headline only", async () => {
    await renderAbout()
    await expect.poll(headline).toBe(RESUME.headline)
    expect(api.resume.getHeadline).toHaveBeenCalled()
    expect(api.resume.getSettings).not.toHaveBeenCalled()
    await expect.element(page.getByText('Only you see this:')).not.toBeInTheDocument()
  })

  it('shows the name alone when there is no headline', async () => {
    api = stubApi()
    api.resume.getHeadline.mockResolvedValue('')
    await renderAbout()
    await expect.element(page.getByText('Claudiu Mihai Jechel')).toBeVisible()
    await expect.element(page.getByRole('region', { name: 'Hackathons' })).toBeVisible()
    expect(headline()).toBeUndefined()
  })

  it('shows the name alone, and the rest of the page, when the headline fails to load', async () => {
    api = stubApi()
    api.resume.getHeadline.mockRejectedValue(new ApiError('/api/resume/headline', 500))
    await renderAbout()
    await expect.element(page.getByRole('region', { name: 'Hackathons' })).toBeVisible()
    expect(headline()).toBeUndefined()
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  it("shows the admin's new headline as soon as it's saved", async () => {
    await asAdmin()
    await expect.poll(headline).toBe(RESUME.headline)
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    const form = page.getByRole('form', { name: 'Edit Photo and links' })
    await expect.element(form.getByRole('textbox', { name: 'Headline' })).toHaveValue(RESUME.headline)
    await form.getByRole('textbox', { name: 'Headline' }).fill('Engineer')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect.poll(headline).toBe('Engineer')
    // From the save's answer: the headline isn't asked for again.
    expect(api.resume.getHeadline).toHaveBeenCalledTimes(1)
  })

  it("keeps the old headline when the contact can't be saved", async () => {
    await asAdmin()
    api.resume.saveContact.mockRejectedValue(new ApiError('/api/resume/contact', 400, { headline: ['Too long.'] }))
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    const form = page.getByRole('form', { name: 'Edit Photo and links' })
    await form.getByRole('textbox', { name: 'Headline' }).fill('x'.repeat(151))
    await form.getByRole('button', { name: 'Save' }).click()
    await expect.element(form.getByRole('textbox', { name: 'Headline' })).toHaveAccessibleDescription('Too long.')
    await form.getByRole('button', { name: 'Cancel' }).click()
    await expect.poll(headline).toBe(RESUME.headline)
  })
})

describe('About Me, for the admin', () => {
  it('has the résumé generator first, and Edit on every section', async () => {
    await asAdmin()
    await expect.element(page.getByText('Résumé generator')).toBeVisible()
    for (const title of SECTIONS) await expect.element(page.getByRole('button', { name: `Edit ${title}` })).toBeVisible()
    expect(api.resume.getSettings).toHaveBeenCalled()
  })

  it('saves a section by sending the whole page with that section changed, then shows what the API stored', async () => {
    await asAdmin()
    api.about.update.mockImplementation(async (content: AboutContent) => ({ ...structuredClone(content), languages: [{ name: 'Romanian (stored)', level: 'native' }] }))
    await page.getByRole('button', { name: 'Edit Languages' }).click()
    const form = page.getByRole('form', { name: 'Edit Languages' })
    await form.getByRole('textbox', { name: 'Language' }).first().fill('Română')
    await form.getByRole('button', { name: 'Save' }).click()
    expect(api.about.update).toHaveBeenCalledWith({ ...ABOUT, languages: [{ name: 'Română', level: 'native' }, ...ABOUT.languages.slice(1)] })
    await expect.element(page.getByText('Romanian (stored)')).toBeVisible()
  })

  it("keeps the other section's colours when saving one section's", async () => {
    await asAdmin()
    await page.getByRole('button', { name: "Edit Where I've been" }).click()
    const form = page.getByRole('form', { name: "Edit Where I've been" })
    await form.getByRole('group', { name: 'Colours' }).getByLabelText('Worked').fill('#010203')
    await form.getByRole('button', { name: 'Save' }).click()
    expect(api.about.update).toHaveBeenCalledWith({ ...ABOUT, colors: { skills: ABOUT.colors.skills, places: { ...ABOUT.colors.places, worked: '#010203' } } })
  })

  it("saves the résumé's private details first, then the profile", async () => {
    await asAdmin()
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    const form = page.getByRole('form', { name: 'Edit Photo and links' })
    await form.getByRole('textbox', { name: 'Headline' }).fill('Engineer')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect.element(form).not.toBeInTheDocument()
    expect(api.resume.saveContact).toHaveBeenCalledWith({ phone: RESUME.phone, email: RESUME.email, headline: 'Engineer' })
    expect(api.about.update).toHaveBeenCalledWith(ABOUT)
    expect(api.resume.saveContact.mock.invocationCallOrder[0]).toBeLessThan(api.about.update.mock.invocationCallOrder[0])
  })

  it("shows the private details' errors on their fields, and saves nothing else", async () => {
    await asAdmin()
    api.resume.saveContact.mockRejectedValue(new ApiError('/api/resume/contact', 400, { email: ['Not an email.'] }))
    await page.getByRole('button', { name: 'Edit Photo and links' }).click()
    const form = page.getByRole('form', { name: 'Edit Photo and links' })
    await form.getByRole('button', { name: 'Save' }).click()
    await expect.element(form.getByRole('textbox', { name: 'Email' })).toHaveAccessibleDescription('Not an email.')
    expect(api.about.update).not.toHaveBeenCalled()
  })

  it('shows only the email and phone as private, each with a copy button', async () => {
    await asAdmin()
    const profile = page.getByRole('region', { name: 'Photo and links' })
    await expect.element(profile.getByRole('button', { name: 'Copy email' })).toBeVisible()
    await expect.element(profile.getByRole('button', { name: 'Copy phone number' })).toBeVisible()
    const line = document.querySelector('.profile-private')!
    expect([...line.querySelectorAll('li')].map((li) => li.textContent)).toEqual([RESUME.email, RESUME.phone])
    expect(line.textContent).not.toContain(RESUME.headline)
  })

  it("says when the résumé's private details couldn't be loaded, and loads them on retry", async () => {
    api = stubApi({ user: ADMIN })
    // Failing every time (the generator panel asking too gets the same answer) until the retry.
    api.resume.getSettings.mockRejectedValue(new ApiError('/api/resume/settings', 500))
    await renderAbout({ user: ADMIN })
    const profile = page.getByRole('region', { name: 'Photo and links' })
    await expect.poll(() => textOf(profile.getByRole('alert'))).toContain("Your résumé's phone, email and headline couldn't be loaded.")
    api.resume.getSettings.mockResolvedValue(structuredClone(RESUME))
    await profile.getByRole('button', { name: 'Try again' }).click()
    await expect.poll(() => document.querySelector('.profile-private')?.textContent).toContain(RESUME.email)
  })
})

/** The whole page in every theme, for a visitor and for the admin (with an editor open). */
describe('About Me, screenshots and accessibility', () => {
  afterEach(async () => {
    vi.useRealTimers()
    await page.viewport(1280, 900)
  })

  // A fixed "now": the skills chart and the timelines count up to it.
  const fixTime = () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 19, 12))
  }
  const shot = (name: string) => shootWhole(page.getByRole('main'), name)

  for (const theme of THEMES) {
    describe(`${theme} theme`, () => {
      it('visitor', async () => {
        fixTime()
        await renderAbout({ theme })
        await expect.element(page.getByRole('list', { name: 'Solved by difficulty' })).toBeVisible()
        expect(await a11yViolations()).toEqual([])
        await shot(`${theme}-visitor`)
      })

      it('admin, editing Skills', async () => {
        fixTime()
        await asAdmin({ theme })
        await expect.element(page.getByRole('list', { name: 'Solved by difficulty' })).toBeVisible()
        await page.getByRole('button', { name: 'Edit Skills' }).click()
        await page.getByRole('button', { name: /^React/ }).click()
        expect(await a11yViolations()).toEqual([])
        await shot(`${theme}-admin-editing`)
      })

      it('loading and failed', async () => {
        api = stubApi()
        api.about.get.mockReturnValue(forever())
        const loading = await renderAbout({ theme })
        await expect.element(page.getByRole('status')).toBeInTheDocument()
        expect(await a11yViolations()).toEqual([])
        await shot(`${theme}-loading`)
        await loading.unmount()
        api.about.get.mockRejectedValue(new ApiError('/api/about', 500))
        await renderAbout({ theme })
        await expect.element(page.getByRole('alert')).toBeVisible()
        expect(await a11yViolations()).toEqual([])
        await shot(`${theme}-error`)
      })

      it('phone', async () => {
        fixTime()
        await page.viewport(390, 844)
        await renderAbout({ theme })
        await expect.element(page.getByRole('list', { name: 'Solved by difficulty' })).toBeVisible()
        await shot(`${theme}-phone`)
      })
    })
  }
})
