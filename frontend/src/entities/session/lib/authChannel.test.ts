import { describe, expect, it, vi } from 'vitest'

describe('the tabs channel in a browser without BroadcastChannel', () => {
  it('quietly does nothing', async () => {
    vi.resetModules()
    vi.stubGlobal('BroadcastChannel', undefined)
    const { listenToOtherTabs, tellOtherTabs } = await import('./authChannel')
    const heard: string[] = []

    expect(() => tellOtherTabs('signedOut')).not.toThrow()
    const stop = listenToOtherTabs((message) => heard.push(message))
    stop()

    expect(heard).toEqual([])
  })
})
