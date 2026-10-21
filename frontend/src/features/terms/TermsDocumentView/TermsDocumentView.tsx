import type { TermsDocument } from '../../../services/api'
import { RichText } from '../../about/RichText'
import { TermsSectionView } from '../TermsSectionView/TermsSectionView'
import { useTermsDocumentViewViewModel } from './TermsDocumentView.viewModel'

interface TermsDocumentViewProps {
  terms: TermsDocument
  /** Leave the title out, e.g. when the popup's header shows it. */
  hideTitle?: boolean
}

/** The terms as a document: the title and date, the introduction, then the numbered sections. */
export function TermsDocumentView(props: TermsDocumentViewProps) {
  const { terms, hideTitle = false } = props
  const vm = useTermsDocumentViewViewModel(props)
  return (
    <article className="terms-document">
      {!hideTitle && <h2 className="terms-title">{terms.title}</h2>}
      {vm.updated && <p className="terms-updated">{vm.updated}</p>}
      {terms.intro && (
        <p className="terms-intro">
          <RichText text={terms.intro} />
        </p>
      )}
      {terms.sections.map((section, i) => (
        <TermsSectionView key={i} number={i + 1} section={section} />
      ))}
    </article>
  )
}
