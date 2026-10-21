/** Buy me a coffee: the button's link, and the donations it reported. */

import { type Page, get } from '../http'

export interface SupportInfo {
  /** Where the "Buy me a coffee" button goes; empty hides it. */
  url: string
}

/** A payment Buy Me a Coffee reported (admin only). */
export interface Donation {
  id: number
  /** The event, e.g. "donation.created". */
  type: string
  fromName: string
  message: string | null
  /** As the service sent it, e.g. "3.00". */
  amount: string
  currency: string
  email: string | null
  /** ISO 8601 timestamp. */
  receivedAt: string
}

export const supportEndpoints = {
  /** Public. Where the header's "Buy me a coffee" button goes. */
  get(signal?: AbortSignal): Promise<SupportInfo> {
    return get<SupportInfo>('/api/support', { signal })
  },

  /** Admin only. Newest first. */
  listDonations(page = 1, pageSize = 20, signal?: AbortSignal): Promise<Page<Donation>> {
    return get<Page<Donation>>('/api/support/donations', { params: { page, pageSize }, signal })
  },
}
