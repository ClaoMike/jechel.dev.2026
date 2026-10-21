import type { Paper } from '../../../../services/api'
import { isSafeUrl } from '../../format'
import { plainText } from '../../textLinks'

/** Each paper: a download link when it has a PDF (its title as plain text), its rich title otherwise. */
export function usePapersSectionViewModel(value: Paper[]) {
  return {
    papers: value.map((paper) =>
      paper.fileUrl && isSafeUrl(paper.fileUrl)
        ? { kind: 'download' as const, href: paper.fileUrl, title: plainText(paper.title), label: `${plainText(paper.title)} (PDF)` }
        : { kind: 'text' as const, title: paper.title },
    ),
  }
}
