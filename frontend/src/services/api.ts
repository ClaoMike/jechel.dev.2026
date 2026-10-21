/**
 * The single entry point for every backend call. Components never call `fetch` or axios directly:
 *
 *   import { api } from './api'
 *   const firstName = await api.profile.getFirstName()
 *
 * Each feature's endpoints and types live in services/endpoints/<feature>.ts, mirroring the backend's
 * `Features/<Feature>` folders; the plumbing under them in services/http.ts. This file puts them
 * together: import from here, never from those files.
 */

import { aboutEndpoints } from './endpoints/about'
import { analyticsEndpoints } from './endpoints/analytics'
import { appsEndpoints } from './endpoints/apps'
import { authEndpoints } from './endpoints/auth'
import { contactEndpoints } from './endpoints/contact'
import { filesEndpoints } from './endpoints/files'
import { leetcodeEndpoints } from './endpoints/leetcode'
import { meetingsEndpoints } from './endpoints/meetings'
import { placesEndpoints } from './endpoints/places'
import { profileEndpoints } from './endpoints/profile'
import { resumeEndpoints } from './endpoints/resume'
import { settingsEndpoints } from './endpoints/settings'
import { siteEndpoints } from './endpoints/site'
import { supportEndpoints } from './endpoints/support'
import { termsEndpoints } from './endpoints/terms'
import { updatesEndpoints } from './endpoints/updates'
import { youtubeEndpoints } from './endpoints/youtube'

export { ApiError, failureOf, onRequestFailed, setRequestPreview } from './http'
export type { ApiFailure, FailedRequest, Page, RequestPreview, ValidationErrors } from './http'
export * from './endpoints/about'
export * from './endpoints/analytics'
export * from './endpoints/apps'
export * from './endpoints/auth'
export * from './endpoints/contact'
export * from './endpoints/files'
export * from './endpoints/leetcode'
export * from './endpoints/meetings'
export * from './endpoints/places'
export * from './endpoints/profile'
export * from './endpoints/resume'
export * from './endpoints/settings'
export * from './endpoints/site'
export * from './endpoints/support'
export * from './endpoints/terms'
export * from './endpoints/updates'
export * from './endpoints/youtube'

export const api = {
  about: aboutEndpoints,
  terms: termsEndpoints,
  files: filesEndpoints,
  leetcode: leetcodeEndpoints,
  youtube: youtubeEndpoints,
  apps: appsEndpoints,
  places: placesEndpoints,
  auth: authEndpoints,
  contact: contactEndpoints,
  analytics: analyticsEndpoints,
  support: supportEndpoints,
  updates: updatesEndpoints,
  resume: resumeEndpoints,
  meetings: meetingsEndpoints,
  site: siteEndpoints,
  settings: settingsEndpoints,
  profile: profileEndpoints,
}
