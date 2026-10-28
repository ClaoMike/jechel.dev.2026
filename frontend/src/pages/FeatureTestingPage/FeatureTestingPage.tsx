import { Navigate, NavLink, useParams } from 'react-router'
import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { EmptyState } from '../../components/EmptyState/EmptyState'
import { FlaskIcon } from '../../components/icons/icons'
import { TEST_FEATURES, type TestFeature } from '../../features/featureTesting/testFeatures'

/**
 * Feature Testing (an admin-only tab, BETA): new features, tried out here on the real site before visitors get them
 * (features/featureTesting/testFeatures.ts), with a navigation between them. Visitors who open the URL go home.
 */
export function FeatureTestingPage({ features = TEST_FEATURES }: { features?: readonly TestFeature[] }) {
  return (
    <AdminOnly>
      <FeatureTesting features={features} />
    </AdminOnly>
  )
}

/**
 * Which feature is open (/features/:feature), and the features' navigation. /features opens the first; an address of
 * a feature that isn't on the list (any more) goes back to /features.
 */
function FeatureTesting({ features }: { features: readonly TestFeature[] }) {
  const { feature: slug } = useParams()
  const current = slug === undefined ? features[0] : features.find((feature) => feature.slug === slug)
  if (current && slug === undefined) return <Navigate to={`/features/${current.slug}`} replace />
  if (!current && slug !== undefined) return <Navigate to="/features" replace />

  return (
    <div className="feature-testing">
      <h2 className="visually-hidden">Feature Testing</h2>
      {current ? (
        <>
          <nav className="pill-nav" aria-label="Features">
            <ul>
              {features.map((feature) => (
                <li key={feature.slug}>
                  <NavLink to={`/features/${feature.slug}`} className="pill-nav-link">
                    {feature.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <section className="card feature-testing-card" aria-label={current.title}>
            <current.Component />
          </section>
        </>
      ) : (
        <section className="card">
          <EmptyState
            icon={<FlaskIcon size={40} />}
            message="No features to test right now"
            hint="New features show up here first, for you to try on the site before visitors see them."
          />
        </section>
      )}
    </div>
  )
}
