import { useEffect } from 'react'
import { useAuth } from '@/entities/session/@x/site'
import type { SiteFeature, SitePage } from '@/shared/api'
import { useAppDispatch, useAppSelector } from '@/shared/lib/store'
import { fetchSite } from './siteSlice'

/** While the API can't be reached, how often to ask again (the maintenance screen goes once it answers). */
export const RETRY_MS = 30_000

/** Loads what visitors see once, and again every RETRY_MS while the API is unreachable. */
export function useLoadSite() {
  const dispatch = useAppDispatch()
  const unreachable = useAppSelector((state) => state.site.status === 'unreachable')

  useEffect(() => {
    const request = dispatch(fetchSite())
    return () => request.abort()
  }, [dispatch])

  useEffect(() => {
    if (!unreachable) return
    const timer = setInterval(() => void dispatch(fetchSite()), RETRY_MS)
    return () => clearInterval(timer)
  }, [unreachable, dispatch])
}

/**
 * Whether a visitor may see a page: always for the signed-in admin; null while that isn't known
 * yet (the session or /api/site still loading).
 */
export function usePageVisible(page: SitePage): boolean | null {
  const { status: auth } = useAuth()
  const site = useAppSelector((state) => state.site)
  if (auth === 'authenticated') return true
  if (auth === 'loading' || site.status !== 'loaded') return null
  return site.site.pages[page]
}

/** Whether a feature is on (for everyone, the admin too: it's switched on once it's set up). False until known. */
export function useFeature(feature: SiteFeature): boolean {
  return useAppSelector((state) => state.site.status === 'loaded' && state.site.site.features[feature])
}
