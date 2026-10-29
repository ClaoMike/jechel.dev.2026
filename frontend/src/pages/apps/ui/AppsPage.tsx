import { useState } from 'react'
import { PagedGrid, type PagedGridTexts } from '@/shared/ui/PagedGrid'
import { AddAppTile } from './AddAppTile/AddAppTile'
import { AppDialog } from './AppDialog/AppDialog'
import { AppTile } from './AppTile/AppTile'
import { CategoriesButton } from './CategoriesButton/CategoriesButton'
import { OrganiseButton } from './OrganiseButton/OrganiseButton'
import { useListAppsQuery, usePrefetchApps, useListAppCategoriesQuery } from '@/entities/app'
import { useAuth } from '@/entities/session'
import type { AppDetails } from '@/shared/api'
import { strings } from '@/shared/i18n'

const TEXTS: PagedGridTexts = {
  label: strings.common.apps,
  loading: strings.appsPage.loadingApps,
  empty: strings.appsPage.noAppsYet,
  error: strings.appsPage.appsCantLoadedRight,
}

/**
 * My apps in a grid, in the order I set (Organise). A tile opens the app's details in a popup. The admin's
 * first tile adds an app, each app's popup has an Edit button, Organise orders the apps (and picks which
 * What's new? may show), and Categories edits the list of categories.
 */
export function AppsPage() {
  const { isAuthenticated } = useAuth()
  // Undefined: no popup. Null: adding an app.
  const [open, setOpen] = useState<AppDetails | null | undefined>(undefined)
  // Only the admin needs the list, to choose from; visitors get each app's own.
  const { data: categories = [] } = useListAppCategoriesQuery(undefined, { skip: !isAuthenticated })
  const tileProps = { onOpen: setOpen }
  const itemKey = (app: AppDetails) => app.id
  // The admin's "Add" tile takes one place, so the first page is still 3 × 3.
  const pageSize = isAuthenticated ? 8 : 9
  const addApp = () => setOpen(null)
  const closeApp = () => setOpen(undefined)
  // A new app becomes an existing one once saved: its popup shows it.
  const saved = (app: AppDetails) => setOpen(app)

  return (
    <section className="apps" aria-label={strings.common.apps}>
      {isAuthenticated && (
        <div className="page-actions">
          <OrganiseButton />
          <CategoriesButton />
        </div>
      )}
      <PagedGrid
        useItems={useListAppsQuery}
        usePrefetchItems={usePrefetchApps}
        pageSize={pageSize}
        itemKey={itemKey}
        texts={TEXTS}
        leading={isAuthenticated && <AddAppTile onAdd={addApp} />}
        Tile={AppTile}
        tileProps={tileProps}
      >
        {open !== undefined && (
          <AppDialog
            // A new app becomes an existing one once saved: start that popup afresh.
            key={open?.id ?? 'new'}
            app={open}
            categories={categories}
            canEdit={isAuthenticated}
            onClose={closeApp}
            onSaved={saved}
            onDeleted={closeApp}
          />
        )}
      </PagedGrid>
    </section>
  )
}
