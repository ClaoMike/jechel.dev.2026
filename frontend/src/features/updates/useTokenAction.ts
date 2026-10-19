import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { failureOf } from '../../services/api'
import { useConfirmSubscriptionMutation, useUnsubscribeMutation } from '../../store/api/communityApi'

export type TokenState = { status: 'working' } | { status: 'done'; email?: string } | { status: 'unknown' } | { status: 'error' }

/** Confirms or unsubscribes once per token in the link (both are idempotent); a missing token or a 404 is "unknown". */
export function useTokenAction(action: 'confirm' | 'unsubscribe'): TokenState {
  const token = useSearchParams()[0].get('token') ?? ''
  const [state, setState] = useState<TokenState>(token ? { status: 'working' } : { status: 'unknown' })
  const [confirm] = useConfirmSubscriptionMutation()
  const [unsubscribe] = useUnsubscribeMutation()

  useEffect(() => {
    if (!token) return
    let current = true
    const run = action === 'confirm' ? confirm(token).unwrap().then((email) => ({ email })) : unsubscribe(token).unwrap().then(() => ({}))
    run
      .then((result) => current && setState({ status: 'done', ...result }))
      .catch((error: unknown) => current && setState(failureOf(error).status === 404 ? { status: 'unknown' } : { status: 'error' }))
    return () => {
      current = false
    }
  }, [action, token, confirm, unsubscribe])

  return state
}
