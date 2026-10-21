import { Loading, SkeletonText } from '../../../components/Skeleton'

/** The terms' shape while they load: an introduction, then numbered sections of paragraphs. */
export function TermsSkeleton() {
  return (
    <Loading label="Loading the terms…">
      <SkeletonText lines={2} />
      {[4, 3, 5].map((lines, i) => (
        <div key={i} className="skeleton-text">
          <SkeletonText lines={1} lineHeight={20} />
          <SkeletonText lines={lines} />
        </div>
      ))}
    </Loading>
  )
}
