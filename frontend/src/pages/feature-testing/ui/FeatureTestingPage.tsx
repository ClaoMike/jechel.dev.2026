import { Navigate, NavLink, useParams } from 'react-router'
import { AdminOnly } from '@/entities/session'
import { EmptyState } from '@/shared/ui/EmptyState'
import { FlaskIcon } from '@/shared/ui/icons'
import { TEST_FEATURES, type TestFeature } from '../config/testFeatures'
import { strings } from '@/shared/i18n'

/**
 * Feature Testing (an admin-only tab, BETA): new features, tried out here on the real site before visitors get them
 * (pages/feature-testing/config/testFeatures.ts), with a navigation between them. Visitors who open the URL go home.
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
      <h2 className="visually-hidden">{strings.featureTestingPage.featureTesting}</h2>
      {current ? (
        <>
          <nav className="pill-nav" aria-label={strings.featureTestingPage.features}>
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
          <EmptyState icon={<FlaskIcon size={40} />} message={strings.featureTestingPage.noFeaturesTestRight} hint={strings.featureTestingPage.newFeaturesShowUp} />
        </section>
      )}
    </div>
  )
}
