import type { AppDetails } from '../../../services/api'
import { AppDetailsView } from '../../apps/AppDetailsView/AppDetailsView'
import { CategoryLabels } from '../../apps/CategoryLabels/CategoryLabels'
import { WhatsNewCard } from '../WhatsNewCard/WhatsNewCard'
import { useLatestAppViewModel } from './LatestApp.viewModel'

/** The newest app, in full: its categories, slider, description, platforms and store links. */
export function LatestApp(props: { app: AppDetails }) {
  const vm = useLatestAppViewModel(props)
  return (
    <WhatsNewCard {...vm} labels={<CategoryLabels categories={props.app.categories} />}>
      <AppDetailsView app={props.app} />
    </WhatsNewCard>
  )
}
