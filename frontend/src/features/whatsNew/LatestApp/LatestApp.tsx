import type { AppDetails } from '../../../services/api'
import { formatDate } from '../../../utils/formatDate'
import { AppDetailsView } from '../../apps/AppDetailsView/AppDetailsView'
import { CategoryLabels } from '../../apps/CategoryLabels/CategoryLabels'
import { WhatsNewCard } from '../WhatsNewCard/WhatsNewCard'

/** The newest app, in full: its categories, slider, description, platforms and store links, dated when it was added. */
export function LatestApp({ app }: { app: AppDetails }) {
  return (
    <WhatsNewCard kind="New app" date={formatDate(app.createdAt)} dateTime={app.createdAt} title={app.title} labels={<CategoryLabels categories={app.categories} />}>
      <AppDetailsView app={app} />
    </WhatsNewCard>
  )
}
