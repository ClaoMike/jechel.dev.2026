/** What visitors may see: page and feature switches, and maintenance. */

import { get, http } from '../http'

/** The visitor pages that can be hidden (Settings → Visitor pages), in tab order. */
export const SITE_PAGES = ['whatsNew', 'apps', 'youtube', 'about', 'contact'] as const
export type SitePage = (typeof SITE_PAGES)[number]

/** Features that need setting up once live: Book a meeting (Contact), Buy me a coffee and Get updates (header). */
export const SITE_FEATURES = ['meetings', 'coffee', 'updates'] as const
export type SiteFeature = (typeof SITE_FEATURES)[number]

/** What visitors see. */
export interface SiteStatus {
  pages: Record<SitePage, boolean>
  features: Record<SiteFeature, boolean>
  /** Visitors get the maintenance screen (the signed-in admin still sees the site). */
  maintenance: boolean
  maintenanceMessage: string
  updatedAt: string | null
}

export interface SaveSiteRequest {
  pages?: Partial<Record<SitePage, boolean>>
  features?: Partial<Record<SiteFeature, boolean>>
  maintenance?: boolean
  maintenanceMessage?: string
}

export const siteEndpoints = {
  /** Public. Which pages and features visitors see, and whether the site is under maintenance. */
  status(signal?: AbortSignal): Promise<SiteStatus> {
    return get<SiteStatus>('/api/site', { signal })
  },

  /** Admin only. Changes what's given; the rest stays. */
  async save(changes: SaveSiteRequest): Promise<SiteStatus> {
    const response = await http.put<SiteStatus>('/api/site', changes)
    return response.data
  },
}
