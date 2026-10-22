import { PagedGrid } from '../../components/PagedGrid/PagedGrid'
import { AddAppTile } from '../../features/apps/AddAppTile/AddAppTile'
import { AppDialog } from '../../features/apps/AppDialog/AppDialog'
import { AppTile } from '../../features/apps/AppTile/AppTile'
import { CategoriesButton } from '../../features/apps/CategoriesButton/CategoriesButton'
import { OrganiseButton } from '../../features/apps/OrganiseButton/OrganiseButton'
import { useListAppsQuery, usePrefetchApps } from '../../store/api/appsApi'
import { useAppsPageViewModel } from './AppsPage.viewModel'

/**
 * My apps in a grid, in the order I set (Organise). A tile opens the app's details in a popup. The admin's
 * first tile adds an app, each app's popup has an Edit button, Organise orders the apps (and picks which
 * What's new? may show), and Categories edits the list of categories.
 */
export function AppsPage() {
  const vm = useAppsPageViewModel()

  return (
    <section className="apps" aria-label="Apps">
      {vm.canEdit && (
        <div className="page-actions">
          <OrganiseButton />
          <CategoriesButton />
        </div>
      )}
      <PagedGrid
        useItems={useListAppsQuery} usePrefetchItems={usePrefetchApps}
        pageSize={vm.pageSize}
        itemKey={vm.itemKey}
        texts={vm.texts}
        leading={vm.canEdit && <AddAppTile onAdd={vm.addApp} />}
        Tile={AppTile}
        tileProps={vm.tileProps}
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
