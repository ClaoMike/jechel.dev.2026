/**
 * The admin's tabs in this browser tell each other when they sign in or out, so the others change at
 * once instead of at their next request. (They share the cookie, so they share the session.)
 */

export type AuthMessage = 'signedIn' | 'signedOut'

export const AUTH_CHANNEL = 'jechel.dev:auth'

let channel: BroadcastChannel | null | undefined

function open(): BroadcastChannel | null {
  if (channel === undefined) channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel(AUTH_CHANNEL) : null
  return channel
}

/** Tells this browser's other tabs (not this one). */
export function tellOtherTabs(message: AuthMessage) {
  open()?.postMessage(message)
}

/** Calls `listener` with what the other tabs say. Returns the unsubscribe. */
export function listenToOtherTabs(listener: (message: AuthMessage) => void): () => void {
  const tabs = open()
  if (!tabs) return () => {}
  const onMessage = (event: MessageEvent) => {
    if (event.data === 'signedIn' || event.data === 'signedOut') listener(event.data)
  }
  tabs.addEventListener('message', onMessage)
  return () => tabs.removeEventListener('message', onMessage)
}
