import { MediaCard } from '../../components/MediaCard'
import { PagedGrid } from '../../components/PagedGrid/PagedGrid'
import { plainText } from '../../features/about/textLinks'
import { CategoryLabels } from '../../features/apps/AppFields/AppFields'
import { AddAppTile } from '../../features/apps/AddAppTile/AddAppTile'
import { AppDialog } from '../../features/apps/AppDialog/AppDialog'
import { CategoriesButton } from '../../features/apps/CategoriesButton/CategoriesButton'
import { tileImage } from '../../features/apps/media'
import type { AppDetails } from '../../services/api'
import { useListAppsQuery } from '../../store/api/appsApi'
import { useAppsPageViewModel } from './AppsPage.viewModel'

/**
 * My apps in a grid, newest first. A tile opens the app's details in a popup. The admin's
 * first tile adds an app, each app's popup has an Edit button, and Categories edits the list.
 */
export function AppsPage() {
  const vm = useAppsPageViewModel()

  return (
    <section className="apps" aria-label="Apps">
      {vm.canEdit && <CategoriesButton />}
        
      <PagedGrid<AppDetails>
        useItems={useListAppsQuery}
        pageSize={vm.pageSize}
        itemKey={(app) => app.id}
        texts={vm.texts}
        leading={vm.canEdit && <AddAppTile onAdd={vm.addApp} />}
        renderItem={(app) => (
          <MediaCard
            onClick={() => vm.openApp(app)}
            imageUrl={tileImage(app)}
            title={app.title}
            meta={app.categories.length > 0 && <CategoryLabels categories={app.categories} />}
            description={plainText(app.description)}
          />
        )}
      >
        {vm.open !== undefined && (
          <AppDialog
            // A new app becomes an existing one once saved: start that popup afresh.
            key={vm.open?.id ?? 'new'}
            app={vm.open}
            categories={vm.categories}
            canEdit={vm.canEdit}
            onClose={vm.closeApp}
            onSaved={vm.saved}
            onDeleted={vm.closeApp}
          />
        )}
      </PagedGrid>
    </section>
  )
}
