import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { THEMES } from '@/shared/lib/theme'
import { api, ApiError, type UpdateEmailKind, type UpdateEmailWording } from '@/shared/api'
import { a11yViolations } from '@/test/a11y'
import { DEFAULT_EMAILS, DEFAULT_WORDING, previewOf } from '@/test/fixtures/updateEmails'
import { ADMIN, forever, renderView, textOf } from '@/test/render'
import { formatDateTime } from '@/shared/lib/format'
import { UpdateEmailsEditor } from './UpdateEmailsEditor'

// The admin's wording of the emails subscribers get (Community tab): the preview of each email; Edit brings up
// the fields beside a live preview, Save keeps them, Cancel throws them away; back to the defaults, and a test
// sent to the admin's own inbox.

const MINE: UpdateEmailWording = { ...DEFAULT_WORDING, confirm: { ...DEFAULT_WORDING.confirm, subject: 'Say yes to jechel.dev' } }

function stub() {
  return {
    get: vi.spyOn(api.updates, 'getEmails').mockResolvedValue(structuredClone(DEFAULT_EMAILS)),
    preview: vi.spyOn(api.updates, 'previewEmail').mockImplementation(async (kind: UpdateEmailKind, wording: UpdateEmailWording) => previewOf(kind, wording)),
    save: vi.spyOn(api.updates, 'saveEmails').mockImplementation(async (wording) => ({ wording, defaults: DEFAULT_WORDING, updatedAt: '2026-10-21T20:00:00Z' })),
    reset: vi.spyOn(api.updates, 'resetEmails').mockResolvedValue(structuredClone(DEFAULT_EMAILS)),
    test: vi.spyOn(api.updates, 'testEmail').mockResolvedValue({ ok: true, message: 'Sent to admin@example.com.' }),
  }
}

const show = (theme?: 'dark' | 'light' | 'vice') => renderView(<UpdateEmailsEditor />, { user: ADMIN, theme })
/** Shown, then Edit pressed: the fields are there. */
async function showEditing(theme?: 'dark' | 'light' | 'vice') {
  await show(theme)
  await button('Edit').click()
  await expect.element(field('Subject')).toBeVisible()
}
const card = () => page.getByRole('region', { name: 'Preview update emails' })
const field = (name: string) => card().getByRole('textbox', { name, exact: true })
const choose = (name: string) =>
  card()
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .click()
const button = (name: string | RegExp) => card().getByRole('button', { name })
const frame = () => document.querySelector<HTMLIFrameElement>('.email-wording-frame')
const glass = () => document.querySelector<HTMLElement>('.email-wording-glass')!
const envelope = () => textOf(page.getByRole('definition').first()) + ' | ' + textOf(page.getByRole('definition').nth(1))
const lastPreview = (stubs: ReturnType<typeof stub>) => stubs.preview.mock.calls.at(-1)!

describe('Preview update emails: the wording', () => {
  it('shows the preview of the confirmation first, from the updates sender, and no fields until Edit', async () => {
    const stubs = stub()
    await show()
    await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')
    expect(envelope()).toBe('jechel.dev <updates@jechel.dev> | Confirm your jechel.dev updates')
    expect(card().getByRole('textbox').query()).toBeNull()
    expect(button('Save').query()).toBeNull()
    expect(button('Cancel').query()).toBeNull()
    await expect.element(button('Edit')).toBeVisible()
    expect(lastPreview(stubs)[0]).toBe('confirm')
  })

  it('brings up the fields on Edit, filled in and focused, beside the preview; Save waits for a change', async () => {
    const stubs = stub()
    await show()
    await button('Edit').click()
    await expect.element(field('Subject')).toHaveValue('Confirm your jechel.dev updates')
    expect(document.activeElement).toBe(field('Subject').element())
    await expect.element(field('Button')).toHaveValue('Yes, send me updates')
    await expect.element(field('About replies')).toHaveValue(DEFAULT_WORDING.footer.noReply)
    await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')
    expect(envelope()).toBe('jechel.dev <updates@jechel.dev> | Confirm your jechel.dev updates')
    // Scripts off; same origin only so the frame can be measured.
    expect(frame()!.getAttribute('sandbox')).toBe('allow-same-origin')
    expect(frame()!.title).toBe('Preview of the confirmation email')
    expect(lastPreview(stubs)[0]).toBe('confirm')
    expect(textOf(card())).not.toContain('Saved')
    await expect.element(button('Save')).toBeDisabled()
    await expect.element(button('Cancel')).toBeEnabled()
    expect(button('Edit').query()).toBeNull()

    // A change enables Save; typing it back as it was disables it again.
    await field('Button').fill('Count me in')
    await expect.element(button('Save')).toBeEnabled()
    await field('Button').fill('Yes, send me updates')
    await expect.element(button('Save')).toBeDisabled()
  })

  it('says only what each field is: no descriptions, hints or defaults button', async () => {
    stub()
    await showEditing()
    expect(card().element().querySelectorAll('.field-hint')).toHaveLength(0)
    expect(textOf(card())).not.toMatch(/What subscribers get|default wording|in grey|Optional|becomes the name/)
    expect(
      card()
        .getByRole('button', { name: /default/ })
        .query(),
    ).toBeNull()
  })

  it('shows the preview under glass: its links can be neither clicked nor reached with Tab', async () => {
    stub()
    await show()
    await expect.poll(() => frame()?.contentDocument?.querySelector('a')?.textContent).toBe('Yes, send me updates')
    expect(glass().inert).toBe(true)
    const before = location.href
    const box = frame()!.getBoundingClientRect()
    const link = frame()!.contentDocument!.querySelector('a')!.getBoundingClientRect()
    // What a pointer over the link hits is the app/styles/glass, outside the frame's page.
    expect(document.elementFromPoint(box.left + link.left + 2, box.top + link.top + 2)).not.toBe(frame())
    await page.elementLocator(glass()).click({ force: true })
    expect(location.href).toBe(before)

    ;(button('Edit').element() as HTMLElement).focus()
    for (let i = 0; i < 6; i++) await userEvent.tab({ shift: true })
    expect(frame()!.contains(document.activeElement)).toBe(false)
    expect(document.activeElement).not.toBe(frame())
  })

  it('makes the frame as tall as the email, so nothing scrolls inside it', async () => {
    stub()
    await show()
    await expect.poll(() => frame()?.contentDocument?.querySelector('a')).toBeTruthy()
    const email = () => frame()!.contentDocument!.documentElement
    await expect.poll(() => Math.round(frame()!.getBoundingClientRect().height)).toBe(Math.ceil(email().getBoundingClientRect().height))
    // Shorter than the frame starts out: it shrinks to the email, no empty space under it, nothing to scroll.
    expect(frame()!.getBoundingClientRect().height).toBeLessThan(560)
    expect(email().scrollHeight).toBeLessThanOrEqual(email().clientHeight)
  })

  it('switches between the previews of the three emails', async () => {
    const stubs = stub()
    await show()
    await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')

    await choose('New video')
    await expect.element(button('New video')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => envelope()).toContain('A new video is up: Devlog 1')
    expect(lastPreview(stubs)[0]).toBe('video')
    expect(frame()!.title).toBe('Preview of the new video email')

    await choose('New app')
    await expect.poll(() => envelope()).toContain('A new app is out: Space Game')
    expect(frame()!.title).toBe('Preview of the new app email')
    expect(card().getByRole('textbox').query()).toBeNull()
  })

  it('switches between the three emails while editing, each with its own fields and preview', async () => {
    const stubs = stub()
    await showEditing()

    await choose('New video')
    await expect.element(field('Subject')).toHaveValue('A new video is up: {title}')
    await expect.element(field('Message')).toHaveValue('A new video is up')
    await expect.element(field('Note')).toHaveValue('')
    await expect.element(field('Button')).toHaveValue('Watch it')
    await expect.element(button('New video')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => envelope()).toContain('A new video is up: Devlog 1')
    expect(lastPreview(stubs)[0]).toBe('video')

    await choose('New app')
    await expect.element(field('Button')).toHaveValue('Take a look')
    await expect.poll(() => envelope()).toContain('A new app is out: Space Game')
    expect(frame()!.title).toBe('Preview of the new app email')
    await expect.element(button('Send me a test (new app)')).toBeVisible()
  })

  it('follows the typing in the preview once it pauses, not every key', async () => {
    const stubs = stub()
    await showEditing()
    await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')
    const before = stubs.preview.mock.calls.length

    await field('Button').fill('Count me in')
    await field('Button').fill('Count me in!')
    await expect.poll(() => frame()?.srcdoc).toContain('Count me in!')
    expect(stubs.preview.mock.calls.length).toBe(before + 1)
    expect(lastPreview(stubs)[1].confirm.button).toBe('Count me in!')
    // Unsaved: nothing stored yet.
    expect(stubs.save).not.toHaveBeenCalled()
    expect(textOf(card())).toContain('Unsaved changes: subscribers still get the saved wording.')
  })

  it('saves the whole draft, every email, says so, and goes back to the preview', async () => {
    const stubs = stub()
    await showEditing()
    await field('Subject').fill('Say yes to jechel.dev')
    await choose('New app')
    // The app's fields are in place before typing (not the confirmation's, still there for a moment).
    await expect.element(field('Message')).toHaveValue('A new app is out')
    await field('Button').fill('Try it')
    await button('Save').click()

    await expect.element(card().getByRole('status').filter({ hasText: 'Saved' })).toHaveTextContent('Saved. New emails use this wording.')
    expect(stubs.save).toHaveBeenCalledWith({
      ...DEFAULT_WORDING,
      confirm: { ...DEFAULT_WORDING.confirm, subject: 'Say yes to jechel.dev' },
      app: { ...DEFAULT_WORDING.app, button: 'Try it' },
    })
    await expect.poll(() => textOf(card())).toContain(`Saved ${formatDateTime('2026-10-21T20:00:00Z')}`)
    expect(textOf(card())).not.toContain('Unsaved changes')
    // Out of editing: the preview alone, and the keyboard back on Edit.
    expect(card().getByRole('textbox').query()).toBeNull()
    expect(button('Save').query()).toBeNull()
    expect(document.activeElement).toBe(button('Edit').element())
    await expect.poll(() => envelope()).toContain('A new app is out')
    await expect.poll(() => frame()?.srcdoc).toContain('Try it')
  })

  it('throws away the changes on Cancel: the preview of the saved wording, and nothing saved', async () => {
    const stubs = stub()
    await showEditing()
    await field('Button').fill('Something else')
    await expect.poll(() => frame()?.srcdoc).toContain('Something else')
    await button('Cancel').click()

    expect(card().getByRole('textbox').query()).toBeNull()
    expect(document.activeElement).toBe(button('Edit').element())
    await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')
    expect(stubs.save).not.toHaveBeenCalled()
    expect(textOf(card())).not.toContain('Unsaved changes')

    await button('Edit').click()
    await expect.element(field('Button')).toHaveValue('Yes, send me updates')
    await expect.element(button('Save')).toBeDisabled()
  })

  it('saving words back to the defaults forgets the own wording, so later defaults apply too', async () => {
    const stubs = stub()
    stubs.get.mockResolvedValue({ wording: MINE, defaults: DEFAULT_WORDING, updatedAt: '2026-10-20T10:00:00Z' })
    await showEditing()
    await expect.element(field('Subject')).toHaveValue('Say yes to jechel.dev')
    expect(textOf(card())).toContain('Saved')

    await field('Subject').fill('Confirm your jechel.dev updates')
    await button('Save').click()

    await expect.poll(() => stubs.reset.mock.calls.length).toBe(1)
    expect(stubs.save).not.toHaveBeenCalled()
    // No date of an own wording any more.
    await expect.poll(() => card().element().querySelector('.inbox-header .muted')).toBeNull()
  })

  it('a new video or app has a note too, empty at first, and it is saved with the rest', async () => {
    const stubs = stub()
    await showEditing()
    await choose('New video')
    await expect.element(field('Message')).toHaveValue('A new video is up')
    await field('Note').fill('Filmed in one take.')
    await field('Message').fill('Fresh from the channel:\n\n{title}')
    await button('Save').click()
    await expect.poll(() => stubs.save.mock.calls.at(-1)?.[0].video).toEqual({ ...DEFAULT_WORDING.video, intro: 'Fresh from the channel:\n\n{title}', note: 'Filmed in one take.' })
  })

  it("marks what the API wouldn't save, next to the field, and opens that email", async () => {
    const stubs = stub()
    stubs.save.mockRejectedValueOnce(new ApiError('/api/updates/emails', 400, { 'video.subject': ['Only {title} can be filled in; remove {name}.'] }))
    await showEditing()
    await field('Note').fill('A note.')
    await button('Save').click()

    await expect.element(card().getByRole('alert')).toHaveTextContent('Some fields need a look.')
    await expect.element(field('Button')).toHaveValue('Watch it')
    await expect.element(card().getByText('Only {title} can be filled in; remove {name}.')).toBeVisible()
    await expect.element(field('Subject')).toHaveAttribute('aria-invalid', 'true')
    expect(textOf(button(/^New video/))).toContain('needs a look')
  })

  it('checks the draft as it is typed: the preview says what is wrong and fades until fixed', async () => {
    const stubs = stub()
    await showEditing()
    await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')
    stubs.preview.mockRejectedValue(new ApiError('/api/updates/emails/preview', 400, { 'confirm.button': ['Required.'] }))

    await field('Button').fill('')
    await expect.element(card().getByText('Required.')).toBeVisible()
    await expect.poll(() => glass().classList.contains('is-stale')).toBe(true)

    stubs.preview.mockImplementation(async (kind, wording) => previewOf(kind, wording))
    await field('Button').fill('Go')
    await expect.poll(() => frame()?.srcdoc).toContain('>Go<')
    expect(card().getByText('Required.').query()).toBeNull()
    expect(glass().classList.contains('is-stale')).toBe(false)
  })

  it("says when the preview couldn't be made", async () => {
    const stubs = stub()
    stubs.preview.mockRejectedValue(new ApiError('/api/updates/emails/preview', 503))
    await show()
    await expect.element(card().getByText("The preview couldn't be made.")).toBeVisible()
  })

  it('sends the saved email shown to the admin as a test before Edit', async () => {
    const stubs = stub()
    await show()
    await button('Send me a test (confirmation)').click()
    await expect.element(card().getByRole('status').filter({ hasText: 'Sent to' })).toHaveTextContent('✓ Sent to admin@example.com.')
    expect(stubs.test).toHaveBeenCalledWith('confirm', DEFAULT_WORDING)
  })

  it('sends the draft of the email shown to the admin as a test, and says how it went', async () => {
    const stubs = stub()
    await showEditing()
    await choose('New video')
    await expect.element(field('Message')).toHaveValue('A new video is up')
    await field('Button').fill('Play')
    await button('Send me a test (new video)').click()

    await expect.element(card().getByRole('status').filter({ hasText: 'Sent to' })).toHaveTextContent('✓ Sent to admin@example.com.')
    expect(stubs.test).toHaveBeenCalledWith('video', { ...DEFAULT_WORDING, video: { ...DEFAULT_WORDING.video, button: 'Play' } })
    expect(stubs.save).not.toHaveBeenCalled()

    stubs.test.mockResolvedValueOnce({ ok: false, message: 'Resend refused it: The jechel.dev domain is not verified.' })
    await button('Send me a test (new video)').click()
    await expect.element(card().getByText('Resend refused it: The jechel.dev domain is not verified.')).toBeVisible()

    stubs.test.mockRejectedValueOnce(new ApiError('/api/updates/emails/test', 500))
    await button('Send me a test (new video)').click()
    await expect.element(card().getByText("The test couldn't be sent. Please try again.")).toBeVisible()
  })

  it("doesn't send a test of wording the API turns down, and marks the field", async () => {
    const stubs = stub()
    stubs.test.mockRejectedValueOnce(new ApiError('/api/updates/emails/test', 400, { 'confirm.intro': ['Required.'] }))
    await show()
    await button(/^Send me a test/).click()
    // The fields come up, to fix it.
    await expect.element(card().getByText('Fix the fields marked first.')).toBeVisible()
    await expect.element(field('Message')).toHaveAttribute('aria-invalid', 'true')
    // Straight into the field to fix.
    expect(document.activeElement).toBe(field('Message').element())
  })

  it("says when saving didn't work for another reason", async () => {
    const stubs = stub()
    stubs.save.mockRejectedValueOnce(new ApiError('/api/updates/emails', 401))
    await showEditing()
    await field('Subject').fill('New subject')
    await button('Save').click()
    await expect.element(card().getByRole('alert')).toHaveTextContent('Your session has ended. Sign in again, then save.')
    await expect.element(field('Subject')).toHaveValue('New subject')
  })

  it('shows it loading, and a way to try again when it fails', async () => {
    const stubs = stub()
    stubs.get.mockReturnValue(forever())
    await show()
    await expect.element(card().getByRole('status')).toHaveTextContent("Loading the emails' wording…")

    stubs.get.mockRejectedValueOnce(new ApiError('/api/updates/emails', 500)).mockResolvedValue(structuredClone(DEFAULT_EMAILS))
    await show()
    await expect.element(page.getByText("The emails' wording couldn't be loaded.")).toBeVisible()
    await page.getByRole('button', { name: 'Try again' }).click()
    await expect.element(button('Edit')).toBeVisible()
  })

  it('works from the keyboard: pick an email, edit, save', async () => {
    const stubs = stub()
    await show()
    await expect.element(button('Edit')).toBeVisible()
    ;(button(/^New app/).element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => envelope()).toContain('A new app is out')
    // Past the preview (under app/styles/glass, nothing to stop at) to Edit, which goes into the first field.
    await userEvent.tab()
    expect(document.activeElement).toBe(button('Edit').element())
    await userEvent.keyboard('{Enter}')
    await expect.element(field('Message')).toHaveValue('A new app is out')
    expect(document.activeElement).toBe(field('Subject').element())
    await userEvent.keyboard('{End}{Backspace>40/}Out now: {{title}')
    await expect.element(field('Subject')).toHaveValue('Out now: {title}')
    ;(button('Save').element() as HTMLElement).focus()
    await userEvent.keyboard('{Enter}')
    await expect.poll(() => stubs.save.mock.calls.at(-1)?.[0].app.subject).toBe('Out now: {title}')
  })

  for (const theme of THEMES) {
    it(`${theme}: has no WCAG problems`, async () => {
      stub()
      await show(theme)
      await expect.poll(() => frame()?.srcdoc).toContain('Yes, send me updates')
      expect(await a11yViolations()).toEqual([])
      await button('Edit').click()
      await expect.element(field('Subject')).toBeVisible()
      expect(await a11yViolations()).toEqual([])
    })
  }
})
