import { RichText } from '@/shared/ui/RichText'

export interface QualificationView {
  title: string
  issuer: string
  /** "Jun 2021" and "2021-06", when there's a date. */
  obtained: { text: string; dateTime: string } | null
  grade: string
}

/** One qualification: its title, then who issued it, when, and the grade (whichever there are). */
export function QualificationItem({ item }: { item: QualificationView }) {
  return (
    <li className="qualification">
      <span className="qualification-title">
        <RichText text={item.title} />
      </span>
      <span className="qualification-meta">
        {item.issuer && (
          <span>
            <RichText text={item.issuer} />
          </span>
        )}
        {item.obtained && (
          <span>
            <time dateTime={item.obtained.dateTime}>{item.obtained.text}</time>
          </span>
        )}
        {item.grade && <span>{item.grade}</span>}
      </span>
    </li>
  )
}
