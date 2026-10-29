import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { TextField, type EditorProps } from '@/shared/ui/fields'
import { ApiError } from '@/shared/api'
import { renderView, textOf } from '@/test/render'
import { EditableSection } from './EditableSection'

interface Note {
  text: string
}

/** The simplest editor: one field, showing its error from the section. */
function NoteEditor({ value, onChange, errors }: EditorProps<Note>) {
  return <TextField label="Text" value={value.text} onChange={(text) => onChange({ text })} error={errors.text} />
}

function renderNote({ canEdit = false, onSave = vi.fn(async () => {}), hideTitle = false, value = { text: 'Hello' } } = {}) {
  return renderView(
    <EditableSection title="Notes" errorKeys={['text']} value={value} canEdit={canEdit} onSave={onSave} editor={NoteEditor} hideTitle={hideTitle}>
      <p>{value.text}</p>
    </EditableSection>,
  )
}

const section = () => page.getByRole('region', { name: 'Notes' })
const collapse = () => page.getByRole('button', { name: 'Collapse Notes' })
const expand = () => page.getByRole('button', { name: 'Expand Notes' })
const form = () => page.getByRole('form', { name: 'Edit Notes' })

describe('an About Me section, for anyone', () => {
  it('is a region named by its heading, showing its content', async () => {
    await renderNote()
    await expect.element(section()).toBeVisible()
    await expect.element(section().getByRole('heading', { level: 2, name: 'Notes' })).toBeVisible()
    await expect.element(page.getByText('Hello')).toBeVisible()
    await expect.element(page.getByRole('button', { name: /Edit/ })).not.toBeInTheDocument()
  })

  it('collapses and expands, and the browser remembers it', async () => {
    const first = await renderNote()
    await expect.element(collapse()).toHaveAttribute('aria-expanded', 'true')
    await collapse().click()
    await expect.element(page.getByText('Hello')).not.toBeVisible()
    await expect.element(expand()).toHaveAttribute('aria-expanded', 'false')
    expect(localStorage.getItem('about.collapsed.Notes')).toBe('1')
    await first.unmount()

    await renderNote()
    await expect.element(expand()).toBeVisible()
    await expect.element(page.getByText('Hello')).not.toBeVisible()
    await expand().click()
    await expect.element(page.getByText('Hello')).toBeVisible()
    expect(localStorage.getItem('about.collapsed.Notes')).toBeNull()
  })

  it('still collapses where the browser keeps nothing (private mode)', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    await renderNote()
    await collapse().click()
    await expect.element(page.getByText('Hello')).not.toBeVisible()
  })

  it('can hide its heading (still read out) while open, e.g. on the profile card', async () => {
    await renderNote({ hideTitle: true })
    const heading = section().getByRole('heading', { name: 'Notes' })
    expect(heading.element().className).toContain('visually-hidden')
    await collapse().click()
    expect(heading.element().className).not.toContain('visually-hidden')
  })
})

describe('an About Me section, for the admin', () => {
  it('switches into a form with a copy of the content; Cancel drops the changes', async () => {
    const onSave = vi.fn(async () => {})
    await renderNote({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Notes' }).click()
    await expect.element(form()).toBeVisible()
    await expect.element(collapse()).not.toBeInTheDocument()
    const box = form().getByRole('textbox', { name: 'Text' })
    await expect.element(box).toHaveValue('Hello')
    await box.fill('Changed')
    await form().getByRole('button', { name: 'Cancel' }).click()
    await expect.element(form()).not.toBeInTheDocument()
    await expect.element(page.getByText('Hello')).toBeVisible()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('saves the draft, waiting with "Saving…", then shows the section again', async () => {
    let finish!: () => void
    const onSave = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)))
    await renderNote({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Notes' }).click()
    await form().getByRole('textbox', { name: 'Text' }).fill('Changed')
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith({ text: 'Changed' })
    await expect.element(form().getByRole('button', { name: 'Saving…' })).toBeDisabled()
    await expect.element(form().getByRole('button', { name: 'Cancel' })).toBeDisabled()
    finish()
    await expect.element(form()).not.toBeInTheDocument()
  })

  it("keeps the form after a rejected save, with the API's errors on its fields", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { text: ['Too short.'] }))
    await renderNote({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Notes' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(form().getByRole('textbox', { name: 'Text' })).toHaveAccessibleDescription('Too short.')
    await expect.poll(() => textOf(form().getByRole('alert'))).toBe('Some fields need fixing; see the messages above.')
    await expect.element(form().getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('says which other section stops it saving, and when the session ended', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new ApiError('/api/about', 400, { 'papers[1].title': ['Required.'] }))
      .mockRejectedValueOnce(new ApiError('/api/about', 401))
    await renderNote({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Notes' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => textOf(form().getByRole('alert'))).toBe("Couldn't save, because another section needs fixing first. Academic papers, item 2: Required.")
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.poll(() => textOf(form().getByRole('alert'))).toBe('Your session has ended. Sign in again, then save.')
  })

  it('opens a collapsed section to edit it', async () => {
    localStorage.setItem('about.collapsed.Notes', '1')
    await renderNote({ canEdit: true })
    await page.getByRole('button', { name: 'Edit Notes' }).click()
    await expect.element(form()).toBeVisible()
  })
})
