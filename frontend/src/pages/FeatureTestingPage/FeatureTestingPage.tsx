import { Navigate, NavLink } from 'react-router'
import { AdminOnly } from '../../components/AdminOnly/AdminOnly'
import { EmptyState } from '../../components/EmptyState/EmptyState'
import { FlaskIcon } from '../../components/icons/icons'
import { TEST_FEATURES, type TestFeature } from '../../features/featureTesting/testFeatures'
import { useFeatureTestingPageViewModel } from './FeatureTestingPage.viewModel'

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

function FeatureTesting({ features }: { features: readonly TestFeature[] }) {
  const vm = useFeatureTestingPageViewModel(features)
  if (vm.redirectTo) return <Navigate to={vm.redirectTo} replace />

  return (
    <div className="feature-testing">
      <h2 className="visually-hidden">Feature Testing</h2>
      {vm.current ? (
        <>
          <nav className="feature-nav" aria-label="Features">
            <ul>
              {vm.links.map((link) => (
                <li key={link.key}>
                  <NavLink to={link.to} className="feature-nav-link">
                    {link.title}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <section className="card feature-testing-card" aria-label={vm.current.title}>
            <vm.current.Component />
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
