import type { Paper } from '../../../../services/api'
import { fileNameOf, isSafeUrl } from '../../format'
import { PAPER_MAX_BYTES } from '../../uploadLimits'

export interface PaperEditorProps {
  index: number
  count: number
  paper: Paper
  titleError?: string
  fileError?: string
  onChange: (paper: Paper) => void
  setFile: (fileUrl: string) => void
  onMove: (from: number, to: number) => void
  onRemove: () => void
}

/** One paper's title and its PDF (uploaded, replaced or removed). */
export function usePaperEditorViewModel({ index, paper, onChange, setFile }: PaperEditorProps) {
  const file = paper.fileUrl && isSafeUrl(paper.fileUrl) ? { href: paper.fileUrl, name: fileNameOf(paper.fileUrl) } : null
  return {
    legend: `Paper ${index + 1}`,
    name: `paper ${index + 1}`,
    uploadContext: `for paper ${index + 1}`,
    maxBytes: PAPER_MAX_BYTES,
    file,
    setTitle: (title: string) => onChange({ ...paper, title }),
    uploaded: (url: string) => setFile(url),
    removeFile: paper.fileUrl ? () => setFile('') : undefined,
  }
}
