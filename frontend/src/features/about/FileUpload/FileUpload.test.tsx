import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'
import { api, ApiError } from '../../../services/api'
import { renderView, textOf } from '../../../test/render'
import { FileUpload } from './FileUpload'

const pdf = (name = 'paper.pdf', bytes = 10) => new File([new Uint8Array(bytes)], name, { type: 'application/pdf' })

function renderUpload({ onUploaded = vi.fn(), onRemove, error, maxBytes = 1000, context }: { onUploaded?: () => void; onRemove?: () => void; error?: string; maxBytes?: number; context?: string } = {}) {
  return renderView(
    <FileUpload label="PDF" context={context} accept="application/pdf" maxBytes={maxBytes} hint="Up to 1 KB." kind="paper" onUploaded={onUploaded} onRemove={onRemove} error={error}>
      <p>current file</p>
    </FileUpload>,
  )
}

describe('uploading a file', () => {
  it('is a named group with an upload button, its hint and what is there now', async () => {
    await renderUpload()
    const group = page.getByRole('group', { name: 'PDF' })
    await expect.element(group).toHaveAccessibleDescription('Up to 1 KB.')
    await expect.element(group.getByRole('button', { name: 'Upload PDF' })).toBeVisible()
    await expect.element(page.getByText('current file')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Remove PDF' })).not.toBeInTheDocument()
  })

  it('uploads at once, showing the progress, and hands over the uploaded file', async () => {
    let progress!: (fraction: number) => void
    let finish!: (file: { url: string; fileName: string }) => void
    vi.spyOn(api.files, 'uploadPaper').mockImplementation((_, onProgress) => {
      progress = onProgress!
      return new Promise((resolve) => (finish = resolve))
    })
    const onUploaded = vi.fn()
    await renderUpload({ onUploaded })
    await page.getByLabelText('PDF file').upload(pdf())
    await expect.element(page.getByRole('button', { name: 'Uploading… 0%' })).toBeDisabled()
    progress(0.42)
    await expect.element(page.getByRole('button', { name: 'Uploading… 42%' })).toBeVisible()
    finish({ url: '/api/files/papers/paper.pdf', fileName: 'paper.pdf' })
    await expect.element(page.getByRole('button', { name: 'Upload PDF' })).toBeEnabled()
    expect(onUploaded).toHaveBeenCalledWith({ url: '/api/files/papers/paper.pdf', fileName: 'paper.pdf' })
  })

  it('refuses a file over the limit before sending it', async () => {
    const send = vi.spyOn(api.files, 'uploadPaper')
    await renderUpload({ maxBytes: 1024 * 1024 })
    await page.getByLabelText('PDF file').upload(pdf('big.pdf', 2.5 * 1024 * 1024))
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe('That file is 2.5 MB. The limit is 1 MB.')
    expect(send).not.toHaveBeenCalled()
  })

  it("shows why an upload failed: the API's reason, an ended session, or anything else", async () => {
    const send = vi
      .spyOn(api.files, 'uploadPaper')
      .mockRejectedValueOnce(new ApiError('/api/files/paper', 400, { file: ['That is not a PDF.'] }))
      .mockRejectedValueOnce(new ApiError('/api/files/paper', 401))
      .mockRejectedValueOnce(new ApiError('/api/files/paper', 500))
    await renderUpload()
    const input = page.getByLabelText('PDF file')
    await input.upload(pdf())
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe('That is not a PDF.')
    await input.upload(pdf())
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe('Your session has ended. Sign in again, then upload.')
    await input.upload(pdf())
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe("Couldn't upload. Please try again.")
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('shows the error the section got back from the API', async () => {
    await renderUpload({ error: 'The file is missing.' })
    await expect.poll(() => textOf(page.getByRole('alert'))).toBe('The file is missing.')
  })

  it('replaces and removes (after asking) when there is a file, named for its item', async () => {
    const onRemove = vi.fn()
    await renderUpload({ onRemove, context: 'for paper 2' })
    await expect.element(page.getByRole('button', { name: 'Replace PDF for paper 2' })).toBeVisible()
    await page.getByRole('button', { name: 'Remove PDF for paper 2' }).click()
    await page.getByRole('dialog', { name: 'Remove the PDF for paper 2?' }).getByRole('button', { name: 'Remove', exact: true }).click()
    expect(onRemove).toHaveBeenCalledOnce()
  })
})
