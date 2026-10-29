/** The profile's first name (the greeting). */

import { get } from '../http'

interface FirstNameResponse {
  firstName: string
}

export const profileEndpoints = {
  async getFirstName(signal?: AbortSignal): Promise<string> {
    const { firstName } = await get<FirstNameResponse>('/api/firstname', { signal })
    return firstName
  },
}
