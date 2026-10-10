import { useState } from 'react'
import { useAuth } from '../auth'
import { PlusIcon } from '../components/icons'
import { MediaCard } from '../components/MediaCard'
import { PagedGrid } from '../components/PagedGrid'
import { plainText } from '../features/about/textLinks'
import { AppDialog } from '../features/apps/AppDialog'
import { api, type AppDetails } from '../services/api'

/**
 * My apps in a grid, newest first. A tile opens the app's details in a popup. The admin's
 * first tile adds an app, and each app's popup has an Edit button.
 */
export function AppsPage() {
  const { isAuthenticated } = useAuth()
  // Undefined: no popup. Null: adding an app.
  const [open, setOpen] = useState<AppDetails | null | undefined>(undefined)
  const [reloads, setReloads] = useState(0)

  return (
    <section className="apps" aria-labelledby="apps-title">
      <h2 id="apps-title" className="page-title">
        Apps
      </h2>
      <PagedGrid<AppDetails>
        load={api.apps.list}
        // The admin's "Add" tile takes one place, so the first page is still 3 × 3.
        pageSize={isAuthenticated ? 8 : 9}
        reloadKey={reloads}
        itemKey={(app) => app.id}
        label="Apps"
        loading={<p>Loading apps…</p>}
        empty={<p className="muted">No apps yet.</p>}
        error={<p role="alert">The apps can't be loaded right now. Please try again later.</p>}
        leading={
          isAuthenticated && (
            <button type="button" className="media-card add-tile" onClick={() => setOpen(null)}>
              <PlusIcon size={40} />
              <span>Add an app</span>
            </button>
          )
        }
        renderItem={(app) => (
          <MediaCard onClick={() => setOpen(app)} imageUrl={app.media.find((m) => m.kind === 'image')?.url} title={app.title} description={plainText(app.description)} />
        )}
      />
      {open !== undefined && (
        <AppDialog
          // A new app becomes an existing one once saved: start that popup afresh.
          key={open?.id ?? 'new'}
          app={open}
          canEdit={isAuthenticated}
          onClose={() => setOpen(undefined)}
          onSaved={(saved) => {
            setOpen(saved)
            setReloads((n) => n + 1)
          }}
          onDeleted={() => {
            setOpen(undefined)
            setReloads((n) => n + 1)
          }}
        />
      )}
    </section>
  )
}
