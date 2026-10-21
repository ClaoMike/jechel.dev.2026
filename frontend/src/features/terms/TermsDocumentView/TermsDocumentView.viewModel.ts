import type { TermsDocument } from '../../../services/api'
import { formatDate } from '../../../utils/formatDate'

/** "Last updated …" when the terms were ever saved. */
export function useTermsDocumentViewViewModel({ terms }: { terms: TermsDocument }) {
  return { updated: terms.updatedAt ? `Last updated ${formatDate(terms.updatedAt)}` : null }
}
