import { Loading, Skeleton, SkeletonCard, SkeletonChips } from '../../../components/Skeleton'

/** About Me's shape while it loads: the profile card (photo, name, labels, links), then sections. */
export function AboutSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label} className="about">
      <div className="card">
        <div className="skeleton-profile">
          <Skeleton width={120} height={120} radius="50%" />
          <div className="skeleton-profile-text">
            <Skeleton width="45%" height={26} />
            <SkeletonChips count={2} />
            <SkeletonChips count={4} />
          </div>
        </div>
      </div>
      <SkeletonCard lines={6} />
      <SkeletonCard lines={3} />
      <SkeletonCard lines={4} />
    </Loading>
  )
}
