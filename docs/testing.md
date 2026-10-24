# Testing and CI

How the backend and frontend are tested, and what CI runs. Part of the [README](../README.md).

## Testing

### Backend (`backend/`)

| Project                          | Type        | How                                                         |
| -------------------------------- | ----------- | ----------------------------------------------------------- |
| `Portfolio.Api.UnitTests`        | Unit        | xUnit; calls endpoint handlers directly with the EF InMemory provider |
| `Portfolio.Api.IntegrationTests` | Integration | xUnit + `WebApplicationFactory<Program>`; spins up a throwaway `postgres:16-alpine` container via Testcontainers (one shared by all test classes via `ApiCollection`), runs migrations, sends real HTTP requests. **Needs Docker running.** |

Auth in integration tests: `PortfolioApiFactory` configures dummy Google credentials and `Auth:AdminEmails = admin@example.com`. A test-only `GET /test/sign-in?email=...` hook (registered via `IStartupFilter`) does what the Google callback does after a successful login: it starts the database session and issues the real cookie. So tests exercise the real cookie and session validation. The API's clock is a `FakeTimeProvider` (`factory.Time`); advance it to simulate idle time.

```bash
backend/test.sh                                        # everything, with coverage: backend/coverage/index.html
cd backend
dotnet test                                            # everything, no coverage
dotnet test tests/Portfolio.Api.UnitTests              # unit only
dotnet test tests/Portfolio.Api.IntegrationTests       # integration only
```

**Coverage:** `test.sh` collects coverage of the API (coverlet, `coverage.runsettings`: every source file counts,
tested or not; EF's generated migrations don't) and turns it into an HTML report with ReportGenerator (a local dotnet
tool, `dotnet-tools.json`): `backend/coverage/index.html`, plus a summary in the terminal. Written even when a test
fails. CI uploads it as the run's `backend-coverage`.

**What's tested:** since 2026-10-21 the backend tests cover the YouTube videos only (`Features/YouTube` in both
projects): the other features' tests were removed, to be written again feature by feature.

### Frontend (`frontend/`)

**Vitest in browser mode**: tests run in a real headless Chromium (Playwright), with the site's own CSS, so what a test sees
(layout, themes, screenshots) is what a visitor sees. Every run measures **coverage of all of `src/`**, tested or not, so
the report shows what isn't covered yet: `coverage/index.html` (and a summary in the terminal).

| Command                | What it runs |
| ---------------------- | ------------ |
| `npm test`             | every test once, with coverage (`coverage/`, written even when a test fails) |
| `npm run test:watch`   | re-runs the tests as files change |
| `npm run test:update`  | rewrites the reference screenshots after an intended visual change (review them before committing) |
| `npm run lint`         | oxlint |
| `npm run typecheck`    | `tsc -b` |
| `npm run build`        | typecheck + Vite build |

- **Where tests live:** next to what they test (`pages/AppsPage/AppsPage.test.tsx`). Shared helpers in `src/test/`:
  `renderView(ui, { path, user, theme })` renders a view the way the site does (store, router, `<main className="page">`,
  a theme, signed in as `ADMIN` or a visitor) and gives `location()` for URL checks; `forever()` keeps a request loading;
  `imagesLoaded()` before a screenshot; `restMouse()` moves the mouse off everything (the mouse stays where the last test
  left it, and a hovered card is drawn raised); `textOf(locator)` for text checks (poll it:
  `expect.poll(() => textOf(x)).toContain(…)`), and poll URL checks too (`expect.poll(() => view.location()).toBe(…)`): navigation
  finishes a moment after the click, later on a slower machine like CI; `a11yViolations()` runs axe (WCAG 2.1 A + AA), expect `[]`.
  Test data in `src/test/fixtures/` (apps with local images, so screenshots never depend on the network).
- **The API is never called:** `stubApi()` (`src/test/api.ts`) stubs everything the visitor-facing views ask for, with
  realistic answers from `src/test/fixtures/` (About Me, terms, site, videos, LeetCode, résumé); a test changes what it needs,
  e.g. `api.about.get.mockRejectedValue(new ApiError('/api/about', 500))`, or `forever()` for the loading state.
  `stubApi({ user: ADMIN })` signs the admin in. It's enforced (`src/test/setup.ts`): a request no test faked (XMLHttpRequest
  or `sendBeacon`) fails the test that sent it, naming it; each view is unmounted at the end of its own test, while its fakes
  are still there; and Vite's `/api` proxy is off under Vitest, so not even an image's address reaches a local API.
- **The real requests:** `fakeHttp(answer)` (`src/test/http.ts`) replaces the browser's XMLHttpRequest, so an `api`
  function runs for real (URL, query, headers, errors turned into ApiErrors, cancelling, the preview switch) without
  leaving the browser. See `services/api.youtube.test.ts`.
- **The whole site:** `renderApp({ path, theme, acceptedTerms })` renders App as main.tsx does (store, router, terms already
  accepted unless `acceptedTerms: null`), for routing, the frame, the popups and the email-link pages.
- **The browser is fixed for tests:** headless Chromium with reduced motion (Vice's scene draws one still frame), the en-GB
  locale and the London time zone, so dates and screenshots are the same on every machine. Tests that show "now" (the
  skills chart, timelines) fix the date with `vi.useFakeTimers({ toFake: ['Date'] })`.
- **Screenshots** (`shootWhole(locator, name)`, around `toMatchScreenshot`): the browser only paints what's inside its
  window, so the helper grows the window to fit the element first. The references are in `__screenshots__/` next to the
  test, one per browser and OS
  (`…-chromium-darwin.png`), and are committed. Animations and transitions are switched off in tests so they never catch
  one halfway. Vice is shot without its animated Riviera scene (that's the layout's, not the page's). A missing reference
  is written on the first run (that run fails: look at the new image, then run again).

### End to end (`e2e/`)

The whole site as a visitor's browser gets it, in **Chrome, Edge, Firefox and Safari** (WebKit, Safari's engine): the
production build (`vite preview`, `/api` passed on as on Cloudflare), the real API on a fresh PostgreSQL, and stand-ins
for the outside services. `./e2e/run.sh` does everything (Docker must be running); arguments go to Playwright, e.g.
`./e2e/run.sh --project chrome` or `./e2e/run.sh tests/contact.spec.ts`. The report: `npx playwright show-report` in `e2e/`.

- **Always the newest browsers, enforced.** The real **Chrome, Edge and Firefox** (Firefox driven over WebDriver BiDi,
  `channel: 'moz-firefox'`) and **WebKit**, Safari's engine (real Safari can't be automated; Playwright's WebKit is
  what Safari runs on). Every run installs the newest `@playwright/test` (no lockfile) and its WebKit; on CI also the
  current stable Chrome and Edge (`playwright install --force chrome msedge`) and Firefox (Mozilla's latest download);
  on a Mac the installed Chrome, Edge and Firefox, which update themselves. Then **`checkBrowsers.ts`** starts each one
  and compares its version with what its maker publishes as current (Google's version history for Chrome's stable
  channel, Microsoft's Edge updates feed, Mozilla's product details, npm for Playwright): one that's older stops the run
  and says what to update. `E2E_ALLOW_OUTDATED=1 ./e2e/run.sh` runs anyway, with the warning (for the day or two a new
  release takes to reach your Mac). Nothing to bump by hand.
- **What it covers** (`e2e/tests/`): the welcome popup and terms (nothing recorded before they're accepted), the tabs,
  back/forward and unknown addresses, the themes and Vice's Hide page, What's new, Apps (pages, the popup), YouTube
  (pages, thumbnails), About (folding sections, the map), Contact (checks, sending, the admin's inbox and phone alert),
  Get updates (the confirmation email, its link, the admin's list), the admin's sign-in (with Google, a refused
  account, cancelling, signing out, signing a device out) and pages, axe (WCAG 2.1 A and AA) on every page in every
  theme and the popups, a phone-sized screen, and the link previews (the tags in the page as served, the image, robots.txt, the sitemap). `*.sitewide.ts` changes the site for everyone (apps added, edited
  and deleted, pages switched off, maintenance): it runs after the rest, one browser at a time, and puts it all back.
- **The stand-ins** (`e2e/fakeServices.ts`): Google's sign-in (a "choose an account" page: the admin or a stranger),
  YouTube (12 videos, `e2e/data.ts`), Resend and ntfy (what was sent is kept: tests read the confirmation email and
  the alerts). The API runs in the `E2E` environment with `E2E:Services` pointing at them; anywhere else that setting
  is ignored (tested in `HostingTests`), and the `E2E` environment doesn't read your user secrets, so nothing real is
  ever sent. The setup (`setup.setup.ts`) accepts the terms, signs the admin in and adds 10 apps.
- **On a Mac:** Edge gets `--in-process-gpu`: started by Playwright, its separate graphics process hangs, and with it the
  Vice scene's WebGL. Playwright's typing in one go (`fill`) and taps don't reach the site in the real Firefox yet
  (WebDriver BiDi), so the tests type key by key (`typeInto`) and tap with a click there (`tap`), as a person would.
- **Without a graphics card** (CI, the Firefox container) Vice isn't the default (`isLowPowerDevice`), as for visitors:
  the tests that need it pick it. On CI (`NO_GPU` in `tests/fixtures.ts`) everything is drawn by the CPU: WebKit there
  draws the frosted glass (`backdrop-filter`) at one frame every few seconds on Apps and About, so Playwright waits forever
  for a button to hold still; the blur is left out for WebKit on CI (real Safari always has Apple's graphics). Vice's
  scene next to three other browsers is as slow, so tests in Vice ask for reduced motion there (one still frame), and CI
  runs 2 tests at a time.

## CI

`.github/workflows/ci.yml` runs on every pull request and on pushes to `develop` (the repo map tool in `tools/repomap`
isn't tested on GitHub: it will move to its own repository; run its tests locally):

1. **backend**: `backend/test.sh`, all tests with coverage (Testcontainers uses the runner's Docker); the report is
   uploaded as the run's `backend-coverage`
2. **frontend**: in Playwright's image (`mcr.microsoft.com/playwright:v1.64.1-noble`, keep it in step with the
   `playwright` package): `npm ci`, lint, build, `npm test`. On failure, the coverage report and the screenshots that
   didn't match are uploaded as the run's `frontend-test-report`.
3. **e2e**: `e2e/run.sh` on the runner (Docker for the database), the latest Playwright and browsers each run; on
   failure, Playwright's report (traces, screenshots) is uploaded as the run's `e2e-report`. Not a required check
   (`main`'s ruleset names Backend and Frontend); add it there to make it one.

**Linux screenshots.** Screenshot references are per OS: `…-chromium-darwin.png` for your Mac, `…-chromium-linux.png`
for CI. The Linux ones are taken on GitHub, never locally: Actions → **Update Linux screenshots** → Run workflow on
your branch. It runs the tests with `--update` in CI's image and commits the new references back to the branch. Run it
after an intended visual change (after `npm run test:update` locally), then re-run CI.
