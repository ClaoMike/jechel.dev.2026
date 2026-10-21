import type { TermsSection } from '../../../services/api'
import { RichText } from '../../about/RichText'

/** One numbered section of the terms: its heading, then paragraphs and bullet lists (with links). */
export function TermsSectionView({ number, section }: { number: number; section: TermsSection }) {
  return (
    <section className="terms-section">
      <h3>
        <span className="terms-number">{number}.</span> {section.heading}
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
  )
}
