import { Loading, Skeleton } from '@/shared/ui/Skeleton'
import { strings } from '@/shared/i18n'

/** The sign-in card's shape while the session is checked. */
export function SignInSkeleton() {
  return (
    <Loading label={strings.common.loading} className="login-card">
      <Skeleton width="60%" height={28} />
      <Skeleton height={44} radius={999} />
    </Loading>
  )
}
