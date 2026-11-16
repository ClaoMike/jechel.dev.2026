import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { failureOf } from '@/shared/api'
import { trackEvent } from '@/shared/lib/analytics'
import { useConfirmSubscriptionMutation, useUnsubscribeMutation } from '../api/subscriptionApi'

export type TokenState = { status: 'working' } | { status: 'done'; email?: string } | { status: 'unknown' } | { status: 'test' } | { status: 'error' }

/** The code in a test email's links (Community → Preview update emails) when the admin isn't subscribed: the API's UpdateEmailsEndpoints.TestToken. */
export const TEST_TOKEN = 'test'

/**
 * Confirms or unsubscribes once per token in the link (both are idempotent); a missing token or a 404 is "unknown".
 * A test email's code is "test": nothing to do, and nothing recorded.
 */
export function useTokenAction(action: 'confirm' | 'unsubscribe'): TokenState {
  const token = useSearchParams()[0].get('token') ?? ''
  const [state, setState] = useState<TokenState>(token === TEST_TOKEN ? { status: 'test' } : token ? { status: 'working' } : { status: 'unknown' })
  const [confirm] = useConfirmSubscriptionMutation()
  const [unsubscribe] = useUnsubscribeMutation()

  useEffect(() => {
    if (!token || token === TEST_TOKEN) return
    let current = true
    const run =
      action === 'confirm'
        ? confirm(token)
            .unwrap()
            .then((email) => ({ email }))
        : unsubscribe(token)
            .unwrap()
            .then(() => ({}))
    run
      .then((result) => {
        trackEvent(action === 'confirm' ? 'Subscription confirmed' : 'Unsubscribed')
        if (current) setState({ status: 'done', ...result })
      })
      .catch((error: unknown) => current && setState(failureOf(error).status === 404 ? { status: 'unknown' } : { status: 'error' }))
    return () => {
      current = false
    }
  }, [action, token, confirm, unsubscribe])

  return state
}
