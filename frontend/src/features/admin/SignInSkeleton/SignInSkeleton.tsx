import { Loading, Skeleton } from '../../../components/Skeleton'

/** The sign-in card's shape while the session is checked. */
export function SignInSkeleton() {
  return (
    <Loading label="Loading…" className="login-card">
      <Skeleton width="60%" height={28} />
      <Skeleton height={44} radius={999} />
    </Loading>
  )
}
