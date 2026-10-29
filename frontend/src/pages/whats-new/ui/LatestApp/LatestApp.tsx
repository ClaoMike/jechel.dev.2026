import type { AppDetails } from '@/shared/api'
import { formatDate } from '@/shared/lib/format'
import { AppDetailsView } from '@/entities/app'
import { CategoryLabels } from '@/entities/app'
import { WhatsNewCard } from '../WhatsNewCard/WhatsNewCard'
import { strings } from '@/shared/i18n'

/** The newest app, in full: its categories, slider, description, platforms and store links, dated when it was added. */
export function LatestApp({ app }: { app: AppDetails }) {
  return (
    <WhatsNewCard
      kind={strings.latestApp.newApp}
      date={formatDate(app.createdAt)}
      dateTime={app.createdAt}
      title={app.title}
      labels={<CategoryLabels categories={app.categories} />}
    >
      <AppDetailsView app={app} />
    </WhatsNewCard>
  )
}
