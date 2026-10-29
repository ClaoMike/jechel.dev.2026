import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { page } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError, type TermsContent, type TermsDocument } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { stubApi, type ApiStubs } from '@/test/api'
import { TERMS } from '@/test/fixtures/site'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
import { useLoadTerms } from '@/entities/terms-of-use'
import { TermsPage } from './TermsPage'

// The admin's Terms tab: the terms as visitors read them, and editing them (sections of paragraphs and bullet lists).

let stubs: ApiStubs
let update: MockInstance<typeof api.terms.update>

beforeEach(() => {
  stubs = stubApi({ user: ADMIN })
  update = vi
    .spyOn(api.terms, 'update')
    .mockImplementation(async (content: TermsContent): Promise<TermsDocument> => ({ ...structuredClone(content), updatedAt: '2026-10-22T10:00:00Z' }))
})

/** The page, with what loads the terms for the whole site (TermsHost, in the app). */
function Page() {
  useLoadTerms()
  return <TermsPage />
}

const show = (theme?: 'dark' | 'light' | 'vice', user = ADMIN) => renderView(<Page />, { user, theme, path: '/terms' })
const form = () => page.getByRole('form', { name: 'Edit the terms' })
const edit = async () => {
  await page.getByRole('button', { name: 'Edit the terms' }).click()
  await expect.element(form()).toBeVisible()
}
const save = () => form().getByRole('button', { name: 'Save' }).click()
const section = (n: number) => form().getByRole('group', { name: `Section ${n}` })
/** What was sent to the API on the last save. */
const sent = () => update.mock.calls.at(-1)![0]

describe('reading', () => {
  it('shows the terms, with their sections, and an Edit button for the admin', async () => {
    await show()
    await expect.element(page.getByRole('heading', { name: /Who runs this site/ })).toBeVisible()
    expect(textOf(page.getByRole('region', { name: 'Terms and Conditions' }))).toContain('Use it lawfully.')
    await expect.element(page.getByRole('button', { name: 'Edit the terms' })).toBeVisible()
  })

  it('has no Edit button for anyone else', async () => {
    await show(undefined, null as never)
    await expect.element(page.getByRole('heading', { name: /Who runs this site/ })).toBeVisible()
    expect(page.getByRole('button', { name: 'Edit the terms' }).query()).toBeNull()
  })

  it('shows placeholders while loading, and offers to try again when it fails', async () => {
    stubs.terms.get.mockReturnValueOnce(forever())
    const loading = await show()
    await expect.element(page.getByRole('status')).toBeVisible()
    await loading.unmount()

    stubs.terms.get.mockRejectedValueOnce(new ApiError('/api/terms', 500))
    await show()
    await expect.element(page.getByText("The terms couldn't be loaded.")).toBeVisible()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(page.getByRole('heading', { name: /Who runs this site/ })).toBeVisible()
  })
})

describe('editing', () => {
  it('starts from the terms as they are, and Cancel leaves them so', async () => {
    await show()
    await edit()
    await expect.element(form().getByRole('textbox', { name: 'Title' })).toHaveValue(TERMS.title)
    await expect.element(section(2).getByRole('textbox', { name: 'Heading' })).toHaveValue('What you agree to')

    await form().getByRole('textbox', { name: 'Title' }).fill('Changed')
    await form().getByRole('button', { name: 'Cancel' }).click()

    expect(form().query()).toBeNull()
    await expect.element(page.getByRole('heading', { name: /Who runs this site/ })).toBeVisible()
    expect(update).not.toHaveBeenCalled()
  })

  it('saves the title, the introduction, and text in each section', async () => {
    await show()
    await edit()
    await form().getByRole('textbox', { name: 'Title' }).fill('Site terms')
    await form()
      .getByRole('textbox', { name: /^Introduction/ })
      .fill('Read me first.')
    await section(1).getByRole('textbox', { name: 'Text of paragraph 1' }).fill('Claudiu, as a hobby.')
    await section(2).getByRole('textbox', { name: 'Bullet point 1' }).fill('Be kind.')
    await save()

    await expect.poll(() => update.mock.calls.length).toBe(1)
    expect(sent().title).toBe('Site terms')
    expect(sent().intro).toBe('Read me first.')
    expect(sent().sections[0].blocks[0].text).toBe('Claudiu, as a hobby.')
    expect(sent().sections[1].blocks[1].items[0]).toBe('Be kind.')
    await expect.element(form()).not.toBeInTheDocument()
  })

  it('adds sections, paragraphs and bullet lists', async () => {
    await show()
    await edit()
    await form().getByRole('button', { name: 'Add section' }).click()
    await section(3).getByRole('textbox', { name: 'Heading' }).fill('Cookies')
    await section(3).getByRole('textbox', { name: 'Text of paragraph 1' }).fill('None.')
    await section(3).getByRole('button', { name: 'Add bullet list' }).click()
    await section(3).getByRole('textbox', { name: 'Bullet point 1' }).fill('Not one.')
    await section(3).getByRole('button', { name: 'Add paragraph' }).click()
    await section(3).getByRole('textbox', { name: 'Text of paragraph 3' }).fill('Really.')
    await save()

    await expect.poll(() => update.mock.calls.length).toBe(1)
    expect(sent().sections[2]).toEqual({
      heading: 'Cookies',
      blocks: [
        { kind: 'paragraph', text: 'None.', items: [] },
        { kind: 'bullets', text: '', items: ['Not one.'] },
        { kind: 'paragraph', text: 'Really.', items: [] },
      ],
    })
  })

  it('moves sections and blocks, and removes them after asking', async () => {
    await show()
    await edit()
    await form().getByRole('button', { name: 'Move section 1 down' }).click()
    await expect.element(section(1).getByRole('textbox', { name: 'Heading' })).toHaveValue('What you agree to')

    await section(1).getByRole('button', { name: 'Move bullet list 2 of section 1 up' }).click()
    await section(1).getByRole('button', { name: 'Remove paragraph 2 of section 1' }).click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()

    await form().getByRole('button', { name: 'Remove section 2' }).click()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await save()

    await expect.poll(() => update.mock.calls.length).toBe(1)
    expect(sent().sections).toEqual([{ heading: 'What you agree to', blocks: [{ kind: 'bullets', text: '', items: ['Use it lawfully.', 'Read the [privacy notes](/terms).'] }] }])
  })

  it('shows what the API says is wrong next to each field', async () => {
    update.mockRejectedValueOnce(
      new ApiError('/api/terms', 400, { title: ['Required.'], 'sections[1].heading': ['Required.'], 'sections[1].blocks[1].items[0]': ['Must be at most 1000 characters.'] }),
    )
    await show()
    await edit()
    await save()

    await expect.element(form().getByRole('alert')).toHaveTextContent('Some fields need fixing; see the messages above.')
    await expect.element(form().getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true')
    await expect.element(section(2).getByRole('textbox', { name: 'Heading' })).toHaveAttribute('aria-invalid', 'true')
    expect(textOf(section(2))).toContain('Must be at most 1000 characters.')
  })

  it('says when the session ended, or that saving failed, and keeps the draft', async () => {
    update.mockRejectedValueOnce(new ApiError('/api/terms', 401)).mockRejectedValueOnce(new ApiError('/api/terms', 500))
    await show()
    await edit()
    await form().getByRole('textbox', { name: 'Title' }).fill('Keep me')

    await save()
    await expect.element(form().getByRole('alert')).toHaveTextContent('Your session has ended. Sign in again, then save.')
    await save()
    await expect.element(form().getByRole('alert')).toHaveTextContent("Couldn't save. Please try again.")
    await expect.element(form().getByRole('textbox', { name: 'Title' })).toHaveValue('Keep me')
  })

  it('keeps what was typed while it was saving, when saving fails', async () => {
    let fail!: (error: unknown) => void
    update.mockReturnValueOnce(new Promise((_, reject) => (fail = reject)))
    await show()
    await edit()
    await save()
    await expect.element(form().getByRole('button', { name: 'Saving…' })).toBeDisabled()

    await form().getByRole('textbox', { name: 'Title' }).fill('Typed meanwhile')
    fail(new ApiError('/api/terms', 500))

    await expect.element(form().getByRole('alert')).toBeVisible()
    await expect.element(form().getByRole('textbox', { name: 'Title' })).toHaveValue('Typed meanwhile')
  })
})

describe('accessibility', () => {
  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems, reading or editing`, async () => {
      await show(theme)
      await expect.element(page.getByRole('heading', { name: /Who runs this site/ })).toBeVisible()
      expect(await a11yViolations()).toEqual([])
      await edit()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
