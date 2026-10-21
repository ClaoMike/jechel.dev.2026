/**
 * Stubs for everything the visitor-facing views ask the API, with realistic answers. Tests change
 * what they need: `const api = stubApi(); api.about.get.mockRejectedValue(new ApiError(…, 500))`.
 * The real API is never called.
 */
import { vi } from 'vitest'
import { api, type CurrentUser } from '../services/api'
import { ABOUT } from './fixtures/about'
import { APPS, CATEGORIES, pageOf } from './fixtures/apps'
import { LEETCODE, pageOfVideos, RESUME, SITE, SUPPORT_URL, TERMS, VIDEOS } from './fixtures/site'

export function stubApi({ user = null }: { user?: CurrentUser | null } = {}) {
  return {
    auth: {
      me: vi.spyOn(api.auth, 'me').mockResolvedValue(user),
      logout: vi.spyOn(api.auth, 'logout').mockResolvedValue(),
    },
    site: { status: vi.spyOn(api.site, 'status').mockResolvedValue(structuredClone(SITE)) },
    terms: { get: vi.spyOn(api.terms, 'get').mockResolvedValue(structuredClone(TERMS)) },
    support: { get: vi.spyOn(api.support, 'get').mockResolvedValue({ url: SUPPORT_URL }) },
    apps: {
      list: vi.spyOn(api.apps, 'list').mockResolvedValue(pageOf(APPS)),
      listCategories: vi.spyOn(api.apps, 'listCategories').mockResolvedValue(CATEGORIES),
    },
    youtube: {
      listVideos: vi.spyOn(api.youtube, 'listVideos').mockResolvedValue(pageOfVideos()),
      refreshVideos: vi.spyOn(api.youtube, 'refreshVideos').mockResolvedValue(VIDEOS.length),
    },
    about: {
      get: vi.spyOn(api.about, 'get').mockResolvedValue(structuredClone(ABOUT)),
      update: vi.spyOn(api.about, 'update').mockImplementation(async (content) => structuredClone(content)),
    },
    leetcode: { get: vi.spyOn(api.leetcode, 'get').mockResolvedValue(structuredClone(LEETCODE)) },
    resume: {
      getSettings: vi.spyOn(api.resume, 'getSettings').mockResolvedValue(structuredClone(RESUME)),
      saveContact: vi.spyOn(api.resume, 'saveContact').mockImplementation(async (contact) => ({ ...structuredClone(RESUME), ...contact })),
    },
    places: { searchCities: vi.spyOn(api.places, 'searchCities').mockResolvedValue([]) },
    updates: {
      subscribe: vi.spyOn(api.updates, 'subscribe').mockResolvedValue('sent'),
      confirm: vi.spyOn(api.updates, 'confirm').mockResolvedValue('reader@example.com'),
      unsubscribe: vi.spyOn(api.updates, 'unsubscribe').mockResolvedValue(),
    },
    analytics: {
      send: vi.spyOn(api.analytics, 'send').mockResolvedValue(),
      beacon: vi.spyOn(api.analytics, 'beacon').mockReturnValue(true),
    },
  }
}

export type ApiStubs = ReturnType<typeof stubApi>
