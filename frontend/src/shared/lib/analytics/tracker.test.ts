import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { api, ApiError, type VisitBatch, type VisitEventInput } from '../../api'
import { fakeHttp } from '@/test/http'
import { createTracker, describe as describeElement, FLUSH_DELAY_MS, type Tracker } from './tracker'

// The tracker on its own, against a fake transport: what each thing a visitor does becomes.
// Waiting (the default) keeps events without sending them, so `queued` shows what was recorded.

type Recorded = Omit<VisitEventInput, 'ageMs'>

let tracker: Tracker
let uninstall: () => void
let transport: { send: ReturnType<typeof vi.fn<(batch: VisitBatch) => Promise<void>>>; beacon: ReturnType<typeof vi.fn<(batch: VisitBatch) => boolean>> }
let host: HTMLDivElement

const queued = (): Recorded[] => tracker.state.queued
const types = () => queued().map((e) => e.type)
const last = () => queued().at(-1)!

beforeEach(() => {
  sessionStorage.removeItem('analytics.session')
  transport = { send: vi.fn(async () => {}), beacon: vi.fn(() => true) }
  tracker = createTracker(transport)
  uninstall = tracker.install()
  tracker.pageview('/apps')
  host = document.createElement('div')
  document.body.append(host)
})

afterEach(() => {
  uninstall()
  host.remove()
  vi.useRealTimers()
})

function add<T extends HTMLElement>(html: string): T {
  host.innerHTML = html
  return host.firstElementChild as T
}

describe('the pages opened', () => {
  it('records each page with its query, the same one twice in a row once', () => {
    tracker.pageview('/apps')
    tracker.pageview('/youtube?page=2')
    tracker.pageview('/apps')
    expect(queued().map((e) => `${e.type} ${e.path}`)).toEqual(['pageview /apps', 'pageview /youtube?page=2', 'pageview /apps'])
    expect(queued().map((e) => e.seq)).toEqual([1, 2, 3])
  })

  it('dates every event on the page it happened on', () => {
    add('<button>Play</button>').click()
    tracker.pageview('/about')
    add('<button>Zoom in</button>').click()
    expect(queued().map((e) => `${e.type} ${e.path}`)).toEqual(['pageview /apps', 'click /apps', 'pageview /about', 'click /about'])
  })

  it('keeps counting across a reload of the tab (session storage), and starts again in a new tab', () => {
    add('<button>One</button>').click()
    const sessionId = tracker.state.sessionId
    uninstall()
    tracker = createTracker(transport)
    uninstall = tracker.install()
    tracker.pageview('/apps')
    expect(tracker.state.sessionId).toBe(sessionId)
    expect(queued()[0].seq).toBe(3)

    uninstall()
    sessionStorage.removeItem('analytics.session')
    tracker = createTracker(transport)
    uninstall = tracker.install()
    expect(tracker.state.sessionId).not.toBe(sessionId)
  })
})

describe('clicks', () => {
  it("records a button's or link's words, never a field's value", () => {
    add('<button><span>Send <b>message</b></span></button>').querySelector('b')!.click()
    expect(last()).toMatchObject({ type: 'click', label: 'Send message', detail: { element: 'button' } })

    const field = add<HTMLInputElement>('<label>Email <input name="email" value="me@example.com"></label>').querySelector('input')!
    field.click()
    expect(last()).toMatchObject({ type: 'click', label: 'Email', detail: { element: 'input[type=text]' } })
    expect(JSON.stringify(queued())).not.toContain('me@example.com')
  })

  it('names things by their accessible name first: aria-label, aria-labelledby, then the text', () => {
    expect(describeElement(add('<button aria-label="Close">×</button>'))).toBe('Close')
    host.innerHTML = '<span id="t1">Delete</span><span id="t2">visit</span><button aria-labelledby="t1 t2">🗑</button>'
    expect(describeElement(host.querySelector('button')!)).toBe('Delete visit')
    expect(describeElement(add('<a href="/x"><img alt="GitHub"></a>'))).toBe('GitHub')
    expect(describeElement(add('<button title="Edit"></button>'))).toBe('Edit')
    expect(describeElement(add('<input placeholder="Search">'))).toBe('Search')
  })

  it("records a link's address: this site's with its query, another site's without (it can hold tokens)", () => {
    add<HTMLAnchorElement>('<a href="/youtube?page=2">Next</a>').addEventListener('click', (e) => e.preventDefault())
    host.querySelector('a')!.click()
    expect(last().detail).toMatchObject({ href: '/youtube?page=2' })

    add<HTMLAnchorElement>('<a href="https://github.com/jechel?token=secret">GitHub</a>').addEventListener('click', (e) => e.preventDefault())
    host.querySelector('a')!.click()
    expect(last().detail).toMatchObject({ href: 'https://github.com/jechel' })
  })

  it('records a tick with its new state once, through its label too', () => {
    const box = add('<label><input type="checkbox"> I agree</label>').querySelector('input')!
    host.querySelector('label')!.click()
    expect(queued().filter((e) => e.type === 'click')).toHaveLength(1)
    expect(last()).toMatchObject({ type: 'click', label: 'I agree', detail: { element: 'input[type=checkbox]', checked: 'true' } })
    box.click()
    expect(last().detail).toMatchObject({ checked: 'false' })
  })

  it('records roles that act like buttons, and ignores clicks on plain text', () => {
    add('<div role="tab">Skills</div>').click()
    expect(last()).toMatchObject({ type: 'click', label: 'Skills', detail: { element: 'div[role=tab]' } })
    const before = queued().length
    add('<p>Just text</p>').click()
    expect(queued()).toHaveLength(before)
  })

  it('cuts very long labels', () => {
    add(`<button>${'a'.repeat(300)}</button>`).click()
    expect(last().label).toHaveLength(120)
    expect(last().label!.endsWith('…')).toBe(true)
  })
})

describe('fields and forms', () => {
  const change = (element: Element) => element.dispatchEvent(new Event('change', { bubbles: true }))

  it("records a list's chosen option", () => {
    const select = add<HTMLSelectElement>('<label>Flag <select><option>Romania</option><option>United Kingdom</option></select></label>').querySelector('select')!
    select.selectedIndex = 1
    change(select)
    expect(last()).toEqual(expect.objectContaining({ type: 'change', label: 'Flag', detail: { element: 'select', value: 'United Kingdom' } }))
  })

  it('records that a text field was edited, never what was typed', () => {
    const input = add<HTMLInputElement>('<label>Your message <textarea></textarea></label>').querySelector('textarea')!
    input.value = 'A very private message'
    change(input)
    expect(last()).toEqual(expect.objectContaining({ type: 'change', label: 'Your message', detail: { element: 'textarea' } }))

    const email = add<HTMLInputElement>('<input type="email" aria-label="Email">')
    email.value = 'me@example.com'
    change(email)
    expect(last()).toEqual(expect.objectContaining({ type: 'change', label: 'Email', detail: { element: 'input[type=email]' } }))
    expect(JSON.stringify(queued())).not.toMatch(/private|me@example/)
  })

  it("records a slider's or colour's value and how many files were picked (not their names)", () => {
    const range = add<HTMLInputElement>('<input type="range" aria-label="Volume" min="0" max="10">')
    range.value = '7'
    change(range)
    expect(last().detail).toEqual({ element: 'input[type=range]', value: '7' })

    const file = add<HTMLInputElement>('<input type="file" aria-label="Photo file">')
    const transfer = new DataTransfer()
    transfer.items.add(new File(['x'], 'holiday.png'))
    file.files = transfer.files
    change(file)
    expect(last().detail).toEqual({ element: 'input[type=file]', files: '1' })
    expect(JSON.stringify(queued())).not.toContain('holiday')
  })

  it('leaves ticks to their clicks', () => {
    const before = queued().length
    change(add('<input type="checkbox">'))
    change(add('<input type="radio">'))
    expect(queued()).toHaveLength(before)
  })

  it('records a form sent with Enter or with a button, by its name', () => {
    const form = add<HTMLFormElement>('<form aria-label="Get updates"><input name="email"><button>Subscribe</button></form>')
    form.addEventListener('submit', (e) => e.preventDefault())
    form.requestSubmit()
    expect(last()).toEqual(expect.objectContaining({ type: 'submit', label: 'Get updates', detail: { via: 'Enter' } }))
    form.querySelector('button')!.click()
    expect(
      queued()
        .slice(-2)
        .map((e) => `${e.type} ${e.label}`),
    ).toEqual(['click Subscribe', 'submit Get updates'])
    expect(last().detail).toEqual({ via: 'button' })
  })

  it("names a form by its heading when it has no label, and never by its fields' text", () => {
    const form = add<HTMLFormElement>('<form><h2>Contact</h2><textarea>secret</textarea></form>')
    form.addEventListener('submit', (e) => e.preventDefault())
    form.requestSubmit()
    expect(last().label).toBe('Contact')
    const bare = add<HTMLFormElement>('<form><input value="secret"></form>')
    bare.addEventListener('submit', (e) => e.preventDefault())
    bare.requestSubmit()
    expect(last().label).toBe('(form)')
  })
})

describe('keys, copying, videos and embedded players', () => {
  it('records Escape, and no other key', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(types().filter((t) => t === 'key')).toHaveLength(1)
    expect(last()).toMatchObject({ type: 'key', label: 'Escape' })
  })

  it('records copying text, not what was copied', () => {
    document.dispatchEvent(new Event('copy'))
    expect(last()).toEqual(expect.objectContaining({ type: 'event', label: 'Copied text' }))
    expect(last().detail).toBeUndefined()
  })

  it('records a video played, paused and watched to the end, with its address and the time', () => {
    const video = add<HTMLVideoElement>('<video preload="none" src="/api/files/1/demo.mp4"></video>')
    video.dispatchEvent(new Event('play'))
    expect(last()).toEqual(expect.objectContaining({ type: 'event', label: 'Played a video', detail: { src: '/api/files/1/demo.mp4', at: '0s' } }))
    video.dispatchEvent(new Event('pause'))
    expect(last().label).toBe('Paused a video')
    video.dispatchEvent(new Event('ended'))
    expect(last().label).toBe('Watched a video to the end')
  })

  it('records a click into an embedded player, by its title and address', async () => {
    const frame = add<HTMLIFrameElement>('<iframe title="Building a game in a weekend" src="about:blank"></iframe>')
    frame.setAttribute('src', 'https://www.youtube-nocookie.com/embed/abc?autoplay=1')
    frame.focus()
    window.dispatchEvent(new Event('blur'))
    await expect.poll(() => last().type).toBe('click')
    expect(last()).toEqual(expect.objectContaining({ label: 'Building a game in a weekend', detail: { element: 'iframe', href: 'https://www.youtube-nocookie.com/embed/abc' } }))
  })

  it('ignores the window losing focus to anything but a frame (another app or tab)', async () => {
    const before = queued().length
    ;(document.activeElement as HTMLElement | null)?.blur()
    window.dispatchEvent(new Event('blur'))
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(queued()).toHaveLength(before)
  })
})

describe('scrolling, the tab and leaving', () => {
  const tall = () => {
    const spacer = document.createElement('div')
    spacer.style.height = '5000px'
    host.append(spacer)
  }
  const scrollTo = async (fraction: number) => {
    window.scrollTo(0, Math.round((document.documentElement.scrollHeight - window.innerHeight) * fraction))
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
  }

  afterEach(() => window.scrollTo(0, 0))

  it('records how far down a page was read, in quarters, when leaving it', async () => {
    tall()
    await scrollTo(0.6)
    await scrollTo(0.2)
    tracker.pageview('/about')
    expect(
      queued()
        .slice(-2)
        .map((e) => `${e.type} ${e.label ?? ''} ${e.path}`),
    ).toEqual(['scroll 50% /apps', 'pageview  /about'])
  })

  it('records nothing for a page that was barely scrolled', async () => {
    tall()
    await scrollTo(0.1)
    tracker.pageview('/about')
    expect(types()).not.toContain('scroll')
  })

  it('records the tab hidden (with how far it was read) and back, and sends everything as it hides', async () => {
    tracker.setMode('on')
    tall()
    await scrollTo(1)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    const sent = transport.beacon.mock.calls.flatMap(([batch]) => batch.events.map((e) => `${e.type} ${e.label ?? ''}`.trim()))
    expect(sent.slice(-2)).toEqual(['scroll 100%', 'tab Hidden'])

    visibility.mockReturnValue('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    expect(last()).toMatchObject({ type: 'tab', label: 'Back' })
  })

  it("doesn't record the same depth twice for a page", async () => {
    tracker.setMode('on')
    tall()
    await scrollTo(1)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    const scrolls = transport.beacon.mock.calls.flatMap(([batch]) => batch.events).filter((e) => e.type === 'scroll')
    expect(scrolls).toHaveLength(1)
  })

  it('records leaving the site and hands it all to the browser', () => {
    tracker.setMode('on')
    window.dispatchEvent(new Event('pagehide'))
    const events = transport.beacon.mock.calls.flatMap(([batch]) => batch.events)
    expect(events.at(-1)!.type).toBe('leave')
    expect(transport.send).not.toHaveBeenCalled()
  })

  it('sends a closing tab in pieces small enough for a beacon, and falls back when it refuses', () => {
    tracker.setMode('on')
    for (let i = 0; i < 40; i++) tracker.event(`Step ${i}`)
    transport.beacon.mockReturnValueOnce(false)
    window.dispatchEvent(new Event('pagehide'))
    expect(transport.beacon.mock.calls.map(([batch]) => batch.events.length)).toEqual([15, 15, 12])
    expect(transport.send).toHaveBeenCalledTimes(1)
    expect(transport.send.mock.calls[0][0].events).toHaveLength(15)
  })
})

describe('errors', () => {
  it('records a failed request (no answer or 5xx) with its address, but not expected 4xx answers or its own', async () => {
    fakeHttp((request) =>
      request.url.includes('missing')
        ? { status: 404 }
        : request.url.startsWith('/api/analytics')
          ? { status: 500 }
          : request.url.includes('down')
            ? 'network-error'
            : { status: 503 },
    )
    await api.about.get().catch(() => {})
    await api.leetcode.get().catch(() => {})
    await api.analytics.send({ sessionId: 'x', session: {} as VisitBatch['session'], events: [] }).catch(() => {})
    await api.places.searchCities('missing').catch(() => {})
    const errors = queued().filter((e) => e.type === 'error')
    expect(errors.map((e) => e.label)).toEqual(['GET /api/about failed (503)', 'GET /api/leetcode failed (503)'])
    expect(errors[0].detail).toEqual({ kind: 'request', status: '503' })
  })

  it("records a file that didn't load", () => {
    const image = add<HTMLImageElement>('<img alt="">')
    image.setAttribute('src', '/missing.png')
    image.dispatchEvent(new Event('error'))
    expect(last()).toMatchObject({ type: 'error', label: "Couldn't load an image", detail: { kind: 'resource', src: '/missing.png' } })
  })

  it('records a React crash with its component stack, and the same error at most five times', () => {
    for (let i = 0; i < 8; i++) tracker.reactError(new TypeError('x is undefined'), '\n    at Skills\n    at About', false)
    const errors = queued().filter((e) => e.type === 'error')
    expect(errors).toHaveLength(5)
    expect(errors[0]).toMatchObject({ label: 'TypeError: x is undefined', detail: { kind: 'react-crash', componentStack: 'at Skills\n    at About' } })
    tracker.reactError('caught', undefined, true)
    expect(last()).toMatchObject({ label: 'caught', detail: { kind: 'react-caught' } })
  })
})

describe('sending', () => {
  it('sends every few seconds once on, with the visit and how long ago each event happened', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    tracker.event('Message sent', { fields: '' })
    tracker.setMode('on')
    expect(transport.send).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)
    expect(transport.send).toHaveBeenCalledTimes(1)
    const batch = transport.send.mock.calls[0][0]
    expect(batch.sessionId).toBe(tracker.state.sessionId)
    expect(batch.session).toMatchObject({ path: '/apps', language: navigator.language })
    expect(batch.events.map((e) => e.type)).toEqual(['pageview', 'event'])
    // Empty details are left out.
    expect(batch.events[1].detail).toBeUndefined()
    expect(batch.events.every((e) => e.ageMs >= 0)).toBe(true)
    expect(tracker.state.queued).toEqual([])
  })

  it('tries a failed batch again (three times), then drops it', async () => {
    transport.send.mockRejectedValue(new Error('offline'))
    tracker.setMode('on')
    for (let i = 0; i < 4; i++) await tracker.flush()
    expect(transport.send).toHaveBeenCalledTimes(4)
    expect(tracker.state.queued).toEqual([])
  })

  it('sends at most 50 events a batch', async () => {
    for (let i = 0; i < 70; i++) tracker.event(`Step ${i}`)
    tracker.setMode('on')
    await tracker.flush()
    await tracker.flush()
    expect(transport.send.mock.calls.map(([batch]) => batch.events.length)).toEqual([50, 21])
  })

  it('stops recording at 1,000 events a page load', () => {
    for (let i = 0; i < 1100; i++) tracker.event('Loop')
    // The queue keeps the newest 500; the counter says how many were taken.
    expect(queued()).toHaveLength(500)
    expect(last().seq).toBe(1000)
  })
})

describe('who is recorded', () => {
  it('records nothing while off and keeps nothing for later', async () => {
    add('<button>Before</button>').click()
    tracker.setMode('off')
    add('<button>Under the welcome popup</button>').click()
    tracker.event('Copied text')
    expect(queued()).toEqual([])
    tracker.setMode('on')
    await tracker.flush()
    const sent = transport.send.mock.calls.flatMap(([batch]) => batch.events.map((e) => `${e.type} ${e.label ?? e.path}`))
    // Turned on, the visit starts with the page on show.
    expect(sent).toEqual(['pageview /apps'])
  })

  it('starts with the page on show when turned on, even if it was opened while off', async () => {
    tracker.setMode('off')
    tracker.pageview('/about')
    tracker.setMode('on')
    await tracker.flush()
    const batch = transport.send.mock.calls[0][0]
    expect(batch.events.map((e) => `${e.type} ${e.path}`)).toEqual(['pageview /about'])
    expect(batch.session.path).toBe('/about')
  })

  it("doesn't record the page twice when turned off and on again on it", async () => {
    tracker.setMode('on')
    await tracker.flush()
    tracker.setMode('waiting')
    tracker.setMode('on')
    await tracker.flush()
    expect(transport.send.mock.calls.flatMap(([batch]) => batch.events).filter((e) => e.type === 'pageview')).toHaveLength(1)
  })
})

describe('errors nobody caught', () => {
  it('records a script error with where it happened, one without a message as "Script error", and one without a file by its message', () => {
    window.dispatchEvent(
      new ErrorEvent('error', { message: 'x is not a function', filename: 'https://jechel.dev/assets/app.js', lineno: 12, colno: 4, error: new TypeError('x is not a function') }),
    )
    expect(last()).toMatchObject({ type: 'error', label: 'x is not a function', detail: { kind: 'script', source: 'https://jechel.dev/assets/app.js:12:4' } })

    window.dispatchEvent(new ErrorEvent('error', { message: '', filename: 'https://jechel.dev/assets/app.js' }))
    expect(last()).toMatchObject({ label: 'Script error', detail: { kind: 'script', source: 'https://jechel.dev/assets/app.js:0:0' } })

    window.dispatchEvent(new ErrorEvent('error', { message: 'Out of memory' }))
    expect(last()).toMatchObject({ label: 'Out of memory', detail: { kind: 'script' } })
    expect(last().detail!.source).toBeUndefined()
  })

  it('leaves out a bare "Script error." with no file: a script the browser or an extension put in the page, not the site\'s', () => {
    const before = queued().length
    window.dispatchEvent(new ErrorEvent('error', { message: 'Script error.' }))
    window.dispatchEvent(new ErrorEvent('error', { message: '' }))
    expect(queued()).toHaveLength(before)
  })

  it("leaves out an error at a page's address: the CSP runs no script in the page, so it's the browser's (Chrome on iPhone's Translate)", () => {
    const before = queued().length
    for (const page of ['/', '/apps', '/updates/confirm'])
      window.dispatchEvent(new ErrorEvent('error', { message: 'RangeError: Maximum call stack size exceeded.', filename: location.origin + page, lineno: 193, colno: 70 }))
    expect(queued()).toHaveLength(before)

    // A script file still counts, here and in dev.
    window.dispatchEvent(new ErrorEvent('error', { message: 'one', filename: `${location.origin}/assets/index-abc.js` }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'two', filename: `${location.origin}/@vite/client` }))
    expect(
      queued()
        .slice(before)
        .map((e) => e.label),
    ).toEqual(['one', 'two'])

    // Not a page of this site: a blob: script made here, or another site's page, still count.
    window.dispatchEvent(new ErrorEvent('error', { message: 'three', filename: `blob:${location.origin}/1f2e3d4c` }))
    window.dispatchEvent(new ErrorEvent('error', { message: 'four', filename: 'https://example.com/page' }))
    expect(
      queued()
        .slice(before)
        .map((e) => e.label),
    ).toEqual(['one', 'two', 'three', 'four'])
  })

  it("leaves out another site's script or stylesheet that didn't load (the CSP allows none: the browser added it), not an image", () => {
    const before = queued().length
    const link = add<HTMLLinkElement>('<link rel="stylesheet">')
    link.setAttribute('href', 'https://www.gstatic.com/_/translate_http/_/ss/k=translate_http.tr/m=el_main_css')
    link.dispatchEvent(new Event('error'))
    expect(queued()).toHaveLength(before)

    link.setAttribute('href', '/assets/index.css')
    link.dispatchEvent(new Event('error'))
    expect(last()).toMatchObject({ label: "Couldn't load a link", detail: { kind: 'resource', src: '/assets/index.css' } })
    const image = add<HTMLImageElement>('<img alt="">')
    image.setAttribute('src', 'https://example.com/app.png')
    image.dispatchEvent(new Event('error'))
    expect(last()).toMatchObject({ label: "Couldn't load an image", detail: { src: 'https://example.com/app.png' } })

    // A script from elsewhere, as Translate adds: left out too.
    const recorded = queued().length
    const script = add<HTMLScriptElement>('<script></script>')
    script.setAttribute('src', 'https://translate.googleapis.com/element.js')
    script.dispatchEvent(new Event('error'))
    expect(queued()).toHaveLength(recorded)
  })

  it('records a promise nobody waited for, whatever it failed with', () => {
    const reject = (reason: unknown) => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason }))
    const circular: Record<string, unknown> = {}
    circular.self = circular

    reject(new RangeError('too far'))
    reject('plain words')
    reject({ code: 7 })
    reject(circular)
    reject(undefined)

    expect(
      queued()
        .filter((e) => e.type === 'error')
        .map((e) => e.label),
    ).toEqual(['RangeError: too far', 'plain words', '{"code":7}', '[object Object]', 'undefined'])
    expect(last().detail).toMatchObject({ kind: 'unhandled-rejection' })
  })

  it('leaves out a request cancelled on purpose, and one that failed (it was recorded as it failed)', () => {
    const reject = (reason: unknown) => window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', { promise: Promise.resolve(), reason }))

    reject(new DOMException('The user aborted a request.', 'AbortError'))
    reject(new ApiError('/api/about', 503))
    reject(new ApiError('/api/about', 0))
    expect(queued().filter((e) => e.type === 'error')).toEqual([])

    reject(new ApiError('/api/about', 404))
    expect(last().type).toBe('error')
  })
})

describe('odd events', () => {
  it('ignores a submit or a media event from something that isn’t a form or a media element', () => {
    const before = queued().length
    add('<div></div>').dispatchEvent(new Event('submit', { bubbles: true }))
    add('<div></div>').dispatchEvent(new Event('play', { bubbles: true }))
    expect(queued()).toHaveLength(before)
  })

  it('names a form by what labels it, and a sound as a sound; a pause at the end is part of the end', () => {
    host.innerHTML = '<h4 id="f-title">Subscribe</h4><form aria-labelledby="f-title"><button>Go</button></form>'
    const form = host.querySelector('form')!
    form.addEventListener('submit', (e) => e.preventDefault())
    form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    expect(last()).toMatchObject({ type: 'submit', label: 'Subscribe', detail: { via: 'Enter' } })

    const sound = add<HTMLAudioElement>('<audio src="/jingle.mp3"></audio>')
    sound.dispatchEvent(new Event('play'))
    expect(last()).toMatchObject({ label: 'Played a sound', detail: { src: '/jingle.mp3' } })
    Object.defineProperty(sound, 'ended', { value: true })
    const count = queued().length
    sound.dispatchEvent(new Event('pause'))
    expect(queued()).toHaveLength(count)
  })

  it('a page too short to scroll records no depth', async () => {
    window.dispatchEvent(new Event('scroll'))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    tracker.pageview('/about')
    expect(types()).not.toContain('scroll')
  })
})

describe('the visit id', () => {
  it('is a UUID even where randomUUID isn’t there (plain http)', () => {
    uninstall()
    sessionStorage.removeItem('analytics.session')
    const randomUUID = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true })
    try {
      tracker = createTracker(transport)
      uninstall = tracker.install()
      expect(tracker.state.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: randomUUID, configurable: true })
    }
  })
})
