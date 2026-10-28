import { RichText } from '../../RichText'
import { BulletList } from '../../section/BulletList/BulletList'
import type { TimelineItemView } from '../timeline'
import { strings } from '../../../../strings'

/** One entry on a timeline: title (and "Upcoming"), where, when, and what was done. */
export function TimelineItem({ item }: { item: TimelineItemView }) {
  return (
    <li className="timeline-item">
      <div className="timeline-heading">
        <h3>
          <RichText text={item.title} />
        </h3>
        {item.upcoming && <span className="tag">{strings.timelineItem.upcoming}</span>}
      </div>
      {item.meta.length > 0 && (
        <p className="timeline-meta">
          {item.meta.map((part, i) => (
            <span key={i}>
              <RichText text={part} />
            </span>
          ))}
        </p>
      )}
      <p className="timeline-period">
        <time dateTime={item.dateTime}>{item.period}</time>
      </p>
      <BulletList bullets={item.bullets} />
    </li>
  )
}
