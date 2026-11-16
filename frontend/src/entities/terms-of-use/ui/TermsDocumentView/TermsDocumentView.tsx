import type { TermsDocument } from '@/shared/api'
import { RichText } from '@/shared/ui/RichText'
import { TermsSectionView } from '../TermsSectionView/TermsSectionView'
import { formatDate } from '@/shared/lib/format'
import { strings } from '@/shared/i18n'

interface TermsDocumentViewProps {
  terms: TermsDocument
  /** Leave the title out, e.g. when the popup's header shows it. */
  hideTitle?: boolean
}

/** The terms as a document: the title and date, the introduction, then the numbered sections. */
export function TermsDocumentView(props: TermsDocumentViewProps) {
  const { terms, hideTitle = false } = props
  return (
    <article className="terms-document">
      {!hideTitle && <h2 className="terms-title">{terms.title}</h2>}
      {props.terms.updatedAt && (
        <p className="terms-updated">
          {strings.termsDocumentView.lastUpdated}
          {formatDate(props.terms.updatedAt)}
        </p>
      )}
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
