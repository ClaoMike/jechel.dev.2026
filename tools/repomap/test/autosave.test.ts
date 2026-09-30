/**
 * The code panel's autosave: when it saves, that the newest text always wins, and what happens when
 * a save fails or the file changed on disk. Timers are mocked; `save` is a stub.
 */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'
import { Autosaver, type AutosaveState, type SaveStatus } from '../viewer/src/model/autosave.ts'
import { SaveConflictError } from '../viewer/src/model/source.ts'

interface Call {
  text: string
  etag: string | null
  keepalive: boolean
}

/** An editor stand-in: its text, the saves made, the states shown. */
function harness(options: { fail?: (call: Call) => Error | undefined; slow?: boolean } = {}) {
  const editor = { text: 'v0' }
  const calls: Call[] = []
  const states: SaveStatus[] = []
  let version = 0
  const pending: (() => void)[] = []
  const saver = new Autosaver({
    etag: 'e0',
    read: () => editor.text,
    save: async (text, etag, keepalive) => {
      const call = { text, etag, keepalive }
      calls.push(call)
      if (options.slow) await new Promise<void>((resolveSave) => pending.push(resolveSave))
      const error = options.fail?.(call)
      if (error) throw error
      return `e${++version}`
    },
    onState: (state: AutosaveState) => states.push(state.status),
    delay: 800,
    retryDelay: 4000,
  })
  const type = (text: string) => {
    editor.text = text
    saver.change()
  }
  const settle = () => new Promise((resolveSettle) => setImmediate(resolveSettle))
  return { editor, calls, states, saver, type, settle, finishSave: () => pending.shift()?.() }
}

describe('autosave', () => {
  beforeEach(() => mock.timers.enable({ apis: ['setTimeout'] }))
  afterEach(() => mock.timers.reset())

  it('saves once, a moment after the last keystroke, with the loaded version', async () => {
    const { calls, states, saver, type, settle } = harness()
    type('v1')
    mock.timers.tick(500)
    type('v2')
    mock.timers.tick(500)
    type('v3')
    mock.timers.tick(799)
    await settle()
    assert.equal(calls.length, 0, 'still typing')
    assert.ok(saver.dirty)
    mock.timers.tick(1)
    await settle()
    assert.deepEqual(calls, [{ text: 'v3', etag: 'e0', keepalive: false }])
    assert.equal(saver.status, 'saved')
    assert.equal(saver.dirty, false)
    assert.equal(saver.etag, 'e1', 'the next save sends the new version')
    assert.deepEqual(states, ['pending', 'pending', 'pending', 'saving', 'saved'])
  })

  it('saves right away on flush (⌘S, closing) and skips the timer', async () => {
    const { calls, saver, type, settle } = harness()
    type('v1')
    assert.equal(await saver.flush(), true)
    mock.timers.tick(5000)
    await settle()
    assert.equal(calls.length, 1)
    assert.equal(await saver.flush(), true, 'nothing left to save')
    assert.equal(calls.length, 1)
  })

  it('never loses what was typed during a save', async () => {
    const { calls, saver, type, settle, finishSave } = harness({ slow: true })
    type('v1')
    const done = saver.flush()
    await settle()
    type('v2') // while v1 is being written
    assert.equal(saver.status, 'saving')
    finishSave()
    await settle()
    finishSave()
    assert.equal(await done, true)
    assert.deepEqual(calls.map((c) => [c.text, c.etag]), [['v1', 'e0'], ['v2', 'e1']])
    assert.equal(saver.dirty, false)
  })

  it('retries a failed save, and keeps the text until it works', async () => {
    let down = true
    const { calls, saver, type, settle } = harness({ fail: () => (down ? new Error('The server could not be reached.') : undefined) })
    type('v1')
    assert.equal(await saver.flush(), false)
    assert.equal(saver.status, 'error')
    assert.ok(saver.dirty)
    down = false
    mock.timers.tick(4000)
    await settle()
    assert.equal(saver.status, 'saved')
    assert.deepEqual(calls.map((c) => c.text), ['v1', 'v1'])
  })

  it('stops at a conflict: no more saves until the user chooses', async () => {
    const { calls, saver, type, settle } = harness({ fail: (call) => (call.etag === 'e0' ? new SaveConflictError('changed on disk', 'disk') : undefined) })
    type('mine')
    assert.equal(await saver.flush(), false)
    assert.equal(saver.status, 'conflict')
    type('more of mine')
    mock.timers.tick(10_000)
    await settle()
    assert.equal(calls.length, 1, 'nothing is written over the other version')
    assert.equal(saver.status, 'conflict')
    // "Keep mine": written without a version check.
    assert.equal(await saver.overwrite(), true)
    assert.deepEqual(calls.at(-1), { text: 'more of mine', etag: null, keepalive: false })
    assert.equal(saver.status, 'saved')
  })

  it('after a reload from disk, has nothing to save', async () => {
    const { calls, saver, type, settle } = harness({ fail: (call) => (call.etag === 'e0' ? new SaveConflictError('changed on disk', 'disk') : undefined) })
    type('mine')
    await saver.flush()
    saver.reloaded('disk')
    assert.equal(saver.status, 'saved')
    assert.equal(saver.dirty, false)
    type('edit after reload')
    mock.timers.tick(800)
    await settle()
    assert.deepEqual(calls.at(-1), { text: 'edit after reload', etag: 'disk', keepalive: false })
  })

  it('passes keepalive when the page is closing, and stops its timers when disposed', async () => {
    const { calls, saver, type, settle } = harness()
    type('v1')
    await saver.flush(true)
    assert.equal(calls[0].keepalive, true)
    type('v2')
    saver.dispose()
    mock.timers.tick(10_000)
    await settle()
    assert.equal(calls.length, 1, 'no timer after dispose')
    assert.equal(await saver.flush(), true, 'an explicit flush still saves')
    assert.equal(calls.length, 2)
  })
})
