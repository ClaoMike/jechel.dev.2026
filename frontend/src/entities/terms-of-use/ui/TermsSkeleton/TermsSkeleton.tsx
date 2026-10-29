import { Loading, SkeletonText } from '@/shared/ui/Skeleton'
import { strings } from '@/shared/i18n'

/** The terms' shape while they load: an introduction, then numbered sections of paragraphs. */
export function TermsSkeleton() {
  return (
    <Loading label={strings.termsSkeleton.loadingTerms}>
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
