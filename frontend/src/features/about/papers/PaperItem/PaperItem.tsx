import { DownloadIcon } from '../../../../components/icons/icons'
import { RichText } from '../../RichText'

export type PaperView = { kind: 'download'; href: string; title: string; label: string } | { kind: 'text'; title: string }

/** A paper: its title downloads the PDF (so links inside it are plain text), or is just the title, with its links. */
export function PaperItem({ paper }: { paper: PaperView }) {
  return (
    <li>
      {paper.kind === 'download' ? (
        <a className="paper-download" href={paper.href} download aria-label={paper.label}>
          <DownloadIcon size={16} />
          <span>{paper.title}</span>
        </a>
      ) : (
        <RichText text={paper.title} />
      )}
    </li>
  )
}
