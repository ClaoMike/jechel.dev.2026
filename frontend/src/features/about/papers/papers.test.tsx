import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError, type Paper } from '../../../services/api'
import { ABOUT } from '../../../test/fixtures/about'
import { renderView } from '../../../test/render'
import { PapersSection } from './PapersSection/PapersSection'

function renderPapers({ value = ABOUT.papers, canEdit = false, onSave = vi.fn(async () => {}) }: { value?: Paper[]; canEdit?: boolean; onSave?: (v: Paper[]) => Promise<void> } = {}) {
  return renderView(<PapersSection value={value} canEdit={canEdit} onSave={onSave} />)
}

const form = () => page.getByRole('form', { name: 'Edit Academic papers' })
const paper = (n: number) => form().getByRole('group', { name: `Paper ${n}` })

describe('Academic papers', () => {
  it('downloads a paper from its title (as plain text) when it has a PDF, and shows the rich title otherwise', async () => {
    await renderPapers()
    const download = page.getByRole('link', { name: 'Fast tries for autocomplete (PDF)' })
    await expect.element(download).toHaveAttribute('href', '/api/files/papers/tries.pdf')
    await expect.element(download).toHaveAttribute('download', '')
    expect(download.element().querySelectorAll('a')).toHaveLength(0)
    await expect.element(page.getByText('An unpublished note')).toBeVisible()
    await expect.element(page.getByRole('link', { name: /unpublished/ })).not.toBeInTheDocument()
  })

  it('never makes an unsafe file a link', async () => {
    await renderPapers({ value: [{ title: 'Odd', fileUrl: 'javascript:alert(1)' }] })
    await expect.element(page.getByRole('link')).not.toBeInTheDocument()
    await expect.element(page.getByText('Odd')).toBeVisible()
  })

  it('says so when there are none', async () => {
    await renderPapers({ value: [] })
    await expect.element(page.getByText('Nothing here yet.')).toBeVisible()
  })

  it('shows each PDF by its file name, uploads one for a paper and removes another', async () => {
    vi.spyOn(api.files, 'uploadPaper').mockResolvedValue({ url: '/api/files/papers/note%20v2.pdf', fileName: 'note v2.pdf' })
    const onSave = vi.fn(async () => {})
    await renderPapers({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Academic papers' }).click()
    await expect.element(paper(1).getByRole('link', { name: 'tries.pdf' })).toHaveAttribute('target', '_blank')
    await expect.element(paper(2).getByText('No PDF: the title is shown without a link.')).toBeVisible()
    await paper(2).getByLabelText('PDF file for paper 2').upload(new File([new Uint8Array(10)], 'note.pdf', { type: 'application/pdf' }))
    await expect.element(paper(2).getByRole('link', { name: 'note v2.pdf' })).toBeVisible()
    await paper(1).getByRole('button', { name: 'Remove PDF for paper 1' }).click()
    await page.getByRole('dialog', { name: 'Remove the PDF for paper 1?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([{ ...ABOUT.papers[0], fileUrl: '' }, { ...ABOUT.papers[1], fileUrl: '/api/files/papers/note%20v2.pdf' }])
  })

  it('adds, renames, moves and removes papers', async () => {
    const onSave = vi.fn(async () => {})
    await renderPapers({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Academic papers' }).click()
    await form().getByRole('button', { name: 'Add paper' }).click()
    await paper(3).getByRole('textbox', { name: 'Title' }).fill('A third one')
    await form().getByRole('button', { name: 'Move paper 3 up' }).click()
    await form().getByRole('button', { name: 'Remove paper 1' }).click()
    await page.getByRole('dialog', { name: 'Remove paper 1?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    expect(onSave).toHaveBeenCalledWith([{ title: 'A third one', fileUrl: '' }, ABOUT.papers[1]])
  })

  it("shows the API's errors on the title and the file", async () => {
    const onSave = vi.fn().mockRejectedValue(new ApiError('/api/about', 400, { 'papers[0].title': ['Required.'], 'papers[1].fileUrl': ['Not a PDF.'], papers: ['Too many.'] }))
    await renderPapers({ canEdit: true, onSave })
    await page.getByRole('button', { name: 'Edit Academic papers' }).click()
    await form().getByRole('button', { name: 'Save' }).click()
    await expect.element(paper(1).getByRole('textbox', { name: 'Title' })).toHaveAccessibleDescription('Required.')
    await expect.element(paper(2).getByText('Not a PDF.')).toBeVisible()
    await expect.element(form().getByText('Too many.')).toBeVisible()
  })
})
