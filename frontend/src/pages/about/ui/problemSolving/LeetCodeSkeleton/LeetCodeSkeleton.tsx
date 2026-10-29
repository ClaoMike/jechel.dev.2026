import { Loading, Skeleton } from '@/shared/ui/Skeleton'
import { strings } from '@/shared/i18n'

/** The stats' shape while they load: the ring, then three lines. */
export function LeetCodeSkeleton() {
  return (
    <Loading label={strings.leetCodeSkeleton.loadingLeetcodeStats}>
      <div className="leetcode-body">
        <Skeleton width={120} height={120} radius="50%" />
        <div className="skeleton-text" style={{ flex: 1 }}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="80%" height={16} />
          <Skeleton width="60%" height={16} />
        </div>
      </div>
    </Loading>
  )
}
