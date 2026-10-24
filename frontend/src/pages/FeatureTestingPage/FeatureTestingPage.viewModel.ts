import { useParams } from 'react-router'
import type { TestFeature } from '../../features/featureTesting/testFeatures'

/**
 * Which feature is open (/features/:feature), and the features' navigation. /features opens the first; an address of
 * a feature that isn't on the list (any more) goes back to /features.
 */
export function useFeatureTestingPageViewModel(features: readonly TestFeature[]) {
  const { feature: slug } = useParams()
  const current = slug === undefined ? features[0] : features.find((feature) => feature.slug === slug)

  return {
    links: features.map((feature) => ({ key: feature.slug, to: `/features/${feature.slug}`, title: feature.title })),
    current: current ?? null,
    redirectTo: current && slug === undefined ? `/features/${current.slug}` : !current && slug !== undefined ? '/features' : null,
  }
}
