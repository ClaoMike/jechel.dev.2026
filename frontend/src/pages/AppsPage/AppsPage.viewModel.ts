import { useState } from 'react'
import { useAuth } from '../../auth'
import type { AppDetails } from '../../services/api'
import type { PagedGridTexts } from '../../components/PagedGrid/PagedGrid.viewModel'
import { useListAppCategoriesQuery } from '../../store/api/appsApi'

const TEXTS: PagedGridTexts = {
  label: 'Apps',
  loading: 'Loading apps…',
  empty: 'No apps yet.',
  error: "The apps can't be loaded right now.",
}

export function useAppsPageViewModel() {
  const { isAuthenticated } = useAuth()
  // Undefined: no popup. Null: adding an app.
  const [open, setOpen] = useState<AppDetails | null | undefined>(undefined)
  // Only the admin needs the list, to choose from; visitors get each app's own.
  const { data: categories = [] } = useListAppCategoriesQuery(undefined, { skip: !isAuthenticated })

  return {
    texts: TEXTS,
    canEdit: isAuthenticated,
    // The admin's "Add" tile takes one place, so the first page is still 3 × 3.
    pageSize: isAuthenticated ? 8 : 9,
    categories,
    open,
    openApp: (app: AppDetails) => setOpen(app),
    addApp: () => setOpen(null),
    closeApp: () => setOpen(undefined),
    // A new app becomes an existing one once saved: its popup shows it.
    saved: (app: AppDetails) => setOpen(app),
  }
}
