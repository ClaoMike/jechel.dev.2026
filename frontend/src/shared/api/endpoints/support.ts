/** Buy me a coffee: the button's link, and the donations it reported. */

import { type Page, get } from '../http'

export interface SupportInfo {
  /** Where the "Buy me a coffee" button goes; empty hides it. */
  url: string
}

/** A payment Buy Me a Coffee reported (admin only). */
export interface Donation {
  id: number
  /** The event, e.g. "donation.created", "donation.refunded", "membership.started". */
  type: string
  fromName: string
  message: string | null
  /** As the service sent it, e.g. "3.00". */
  amount: string
  currency: string
  email: string | null
  /** ISO 8601 timestamp. */
  receivedAt: string
  /** Sent with Buy Me a Coffee's "Send test": no money moved. */
  isTest: boolean
}

/** What a Buy Me a Coffee event was, in a few words; null for a plain coffee, which needs none. */
export function donationKind(type: string): string | null {
  switch (type) {
    case 'donation.created':
    case 'coffee-purchase':
      return null
    case 'donation.refunded':
      return 'refunded'
    case 'membership.started':
      return 'membership started'
    case 'membership.updated':
      return 'membership changed'
    case 'membership.cancelled':
      return 'membership cancelled'
    case 'extra_purchase.created':
      return 'extra'
    default:
      return type
  }
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
