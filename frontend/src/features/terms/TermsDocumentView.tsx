import { RichText } from '../about/RichText'
import type { TermsDocument } from '../../services/api'
import { formatDate } from '../../utils/formatDate'

interface TermsDocumentViewProps {
  terms: TermsDocument
  /** Leave the title out, e.g. when the popup's header shows it. */
  hideTitle?: boolean
}

/** The terms as a document: the title and date, the introduction, then the numbered sections. */
export function TermsDocumentView({ terms, hideTitle = false }: TermsDocumentViewProps) {
  return (
    <article className="terms-document">
      {!hideTitle && <h2 className="terms-title">{terms.title}</h2>}
      {terms.updatedAt && <p className="terms-updated">Last updated {formatDate(terms.updatedAt)}</p>}
      {terms.intro && (
        <p className="terms-intro">
          <RichText text={terms.intro} />
        </p>
      )}
      {terms.sections.map((section, i) => (
        <section key={i} className="terms-section">
          <h3>
            <span className="terms-number">{i + 1}.</span> {section.heading}
          </h3>
          {section.blocks.map((block, b) =>
            block.kind === 'paragraph' ? (
              <p key={b}>
                <RichText text={block.text} />
              </p>
            ) : (
              <ul key={b}>
                {block.items.map((item, k) => (
                  <li key={k}>
                    <RichText text={item} />
                  </li>
                ))}
              </ul>
            ),
          )}
        </section>
      ))}
    </article>
  )
}
