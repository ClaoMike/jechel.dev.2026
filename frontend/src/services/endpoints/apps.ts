/** Apps: the apps on the Apps page, their categories, and their images and videos. */

import { type Page, get, http, post } from '../http'

/** An uploaded or linked image or video, or a YouTube video (e.g. a trailer). */
export const APP_MEDIA_KINDS = ['image', 'video', 'youtube'] as const
export type AppMediaKind = (typeof APP_MEDIA_KINDS)[number]

/** An image or video of an app. */
export interface AppMedia {
  /** An upload (/api/files/…), an http(s) link elsewhere, or for YouTube the video's watch link. */
  url: string
  kind: AppMediaKind
}

/** A kind of app the admin defined, e.g. "Mobile app". */
export interface AppCategory {
  id: number
  name: string
}

/** Where to get an app: shown as "Check it on {label}". */
export interface AppLink {
  /** E.g. "App Store", "Google Play", "Steam". */
  label: string
  /** An http(s) link. */
  url: string
}

/** An app on the Apps page. */
export interface AppDetails {
  id: number
  title: string
  /** May contain [text](https://…) links. */
  description: string
  /** Shown as labels under the title, in the categories' order. */
  categories: AppCategory[]
  /** What it runs on, e.g. "iOS"; shown in the popup only. */
  platforms: string[]
  links: AppLink[]
  /** In the order the admin chose; the tile shows the first image. */
  media: AppMedia[]
  createdAt: string
}

export interface AppRequest {
  title: string
  description: string
  categoryIds: number[]
  platforms: string[]
  links: AppLink[]
  media: AppMedia[]
}

/** One category in the admin's list; no id means a new one. */
export interface AppCategoryRequest {
  id: number | null
  name: string
}

export const appsEndpoints = {
  /** Public. Newest first. */
  list(page = 1, pageSize = 9, signal?: AbortSignal): Promise<Page<AppDetails>> {
    return get<Page<AppDetails>>('/api/apps', { params: { page, pageSize }, signal })
  },

  /** Admin only. Rejects with validationErrors keyed by path, e.g. "media[0].url". */
  create(app: AppRequest): Promise<AppDetails> {
    return post<AppDetails>('/api/apps', app)
  },

  /** Admin only. */
  async update(id: number, app: AppRequest): Promise<AppDetails> {
    const response = await http.put<AppDetails>(`/api/apps/${id}`, app)
    return response.data
  },

  /** Admin only. */
  async delete(id: number): Promise<void> {
    await http.delete(`/api/apps/${id}`)
  },

  /** Public. In the admin's order. */
  listCategories(signal?: AbortSignal): Promise<AppCategory[]> {
    return get<AppCategory[]>('/api/apps/categories', { signal })
  },

  /**
   * Admin only. Replaces the list: ids are kept (renamed, reordered), no id adds one, and those left
   * out are deleted and taken off every app. Rejects with validationErrors keyed like "[2].name".
   */
  async saveCategories(categories: AppCategoryRequest[]): Promise<AppCategory[]> {
    const response = await http.put<AppCategory[]>('/api/apps/categories', categories)
    return response.data
  },
}
