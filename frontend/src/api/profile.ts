import { getJson } from './client'

export interface FirstNameResponse {
  firstName: string
}

export async function getFirstName(signal?: AbortSignal): Promise<string> {
  const { firstName } = await getJson<FirstNameResponse>('/api/firstname', signal)
  return firstName
}
