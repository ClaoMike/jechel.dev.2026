import { Loading, Skeleton, SkeletonChips } from '../../../components/Skeleton'
import { strings } from '../../../strings'

/** The résumé settings' shape while they load: a line, the section chips, the button. */
export function ResumeSkeleton() {
  return (
    <Loading label={strings.resumeSkeleton.loadingRSumSettings}>
      <Skeleton width="30%" height={14} />
      <SkeletonChips count={8} />
      <Skeleton width={160} height={40} radius={999} />
    </Loading>
  )
}
