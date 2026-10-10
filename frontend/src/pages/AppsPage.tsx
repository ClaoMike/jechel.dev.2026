import { useEffect, useState } from 'react'
import { useAuth } from '../auth'
import { PlusIcon } from '../components/icons'
import { MediaCard } from '../components/MediaCard'
import { PagedGrid } from '../components/PagedGrid'
import { plainText } from '../features/about/textLinks'
import { CategoryLabels } from '../features/apps/AppFields'
import { AppDialog } from '../features/apps/AppDialog'
import { CategoriesDialog } from '../features/apps/CategoriesDialog'
import { api, type AppCategory, type AppDetails } from '../services/api'

/**
 * My apps in a grid, newest first. A tile opens the app's details in a popup. The admin's
 * first tile adds an app, and each app's popup has an Edit button.
 */
export function AppsPage() {
  const { isAuthenticated } = useAuth()
  // Undefined: no popup. Null: adding an app.
  const [open, setOpen] = useState<AppDetails | null | undefined>(undefined)
  const [reloads, setReloads] = useState(0)
  const [categories, setCategories] = useState<AppCategory[]>([])
  const [editingCategories, setEditingCategories] = useState(false)

  // Only the admin needs the list, to choose from; visitors get each app's own.
  useEffect(() => {
    if (!isAuthenticated) return
    const controller = new AbortController()
    api.apps
      .listCategories(controller.signal)
      .then(setCategories)
      .catch(() => undefined)
    return () => controller.abort()
  }, [isAuthenticated])

  return (
    <section className="apps" aria-labelledby="apps-title">
      <div className="page-title-row">
        <h2 id="apps-title" className="page-title">
          Apps
        </h2>
        {isAuthenticated && (
          <button type="button" className="button button-secondary button-small" onClick={() => setEditingCategories(true)}>
            Categories
          </button>
        )}
      </div>
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
          <MediaCard
            onClick={() => setOpen(app)}
            imageUrl={app.media.find((m) => m.kind === 'image')?.url}
            title={app.title}
            meta={app.categories.length > 0 && <CategoryLabels categories={app.categories} />}
            description={plainText(app.description)}
          />
        )}
      />
      {open !== undefined && (
        <AppDialog
          // A new app becomes an existing one once saved: start that popup afresh.
          key={open?.id ?? 'new'}
          app={open}
          categories={categories}
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
      {editingCategories && (
        <CategoriesDialog
          categories={categories}
          onClose={() => setEditingCategories(false)}
          onSaved={(saved) => {
            setCategories(saved)
            setEditingCategories(false)
            // Apps show the new names, and lose deleted ones.
            setReloads((n) => n + 1)
          }}
        />
      )}
    </section>
  )
}
