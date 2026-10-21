import { Loading, Skeleton, SkeletonText } from '../../../components/Skeleton'

/** The newest item's shape while it loads: the kind and date, the title, the picture, the description. */
export function WhatsNewSkeleton({ label }: { label: string }) {
  return (
    <Loading label={label}>
      <div className="card whats-new-item">
        <Skeleton width="30%" height={14} />
        <Skeleton width="65%" height={28} />
        <Skeleton height="auto" radius={16} className="skeleton-media" />
        <SkeletonText lines={4} />
      </div>
    </Loading>
  )
}
