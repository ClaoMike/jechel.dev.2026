# Admin

Signing in and running the site: Google sign-in, phone alerts, notifications and Settings. Part of the [README](../README.md).

## Authentication (Google, admin only)

Only the site owner signs in, to reach the admin parts of the site. There are no public accounts.

```
 You, on /admin             API (jechel.dev/api, through the Cloudflare proxy)              Google
 ──────────────             ──────────────────────────────────────────────                  ──────
 "Sign in with Google" ───▶ GET /api/auth/login?returnUrl=/
                            correlation cookie + state, PKCE; redirect ─────────────────────▶ choose account
                            GET /api/auth/signin-google?code=… ◀───────────────────────────── redirect back
                            1. correlation cookie and state checked (no forged sign-ins)
                            2. code swapped for the profile, server to server (no token reaches the browser)
                            3. GoogleSignIn: email verified, on Auth:AdminEmails (and Auth:AdminGoogleIds, if set)?
                                 no  → /admin?error=not_authorized, no cookie, phone alert "Sign-in refused"
                                 yes → a session for this device (admin_sessions: the token's hash, device, IP,
                                       country), cookie __Host-portfolio.auth with the token, phone alert
                                       "Signed in to jechel.dev"
 signed in ◀─────────────── redirect to returnUrl (local paths only)

 every later request with the cookie: token hash looked up → not expired, not past 12 hours, email still allowed?
   yes → the request is the admin's (expiry pushed to now + 10 min, at most once a minute, never past 12 hours)
   no  → a visitor's (the cookie is cleared; an account taken off the list loses its sessions for good)
```

**Flow**: the visitor opens `/admin` and clicks **Sign in with Google**, a plain link to `/api/auth/login?returnUrl=/`. The API
redirects to Google (authorization code flow with PKCE, a `state` parameter and a correlation cookie), Google redirects back to
`/api/auth/signin-google`, ASP.NET Core swaps the code for the profile, and `GoogleSignIn.OnTicketReceivedAsync` decides:

- **allowed** (the email is verified by Google, is in `Auth:AdminEmails`, and, if `Auth:AdminGoogleIds` is set, the account's
  permanent Google id is in it): a new session for this device, the cookie, a phone alert, and a redirect to `returnUrl`
- **anyone else**: no cookie, a redirect to `/admin?error=not_authorized`, and a phone alert (throttled per email)
- **cancelled or failed on Google** (or a callback without this browser's correlation cookie): `/admin?error=login_failed`

The frontend (`useSessionKeeper`, into the store's `auth` slice) calls `/api/auth/me` on load. Signed in, the admin bar shows
"Signed in as ... · Sign out", and the admin's tabs and editing appear.

### Sessions (one per device, in the database)

Each device signed in has its own row in `admin_sessions` (`AdminSessionService`): the SHA-256 of a random 256-bit token (the
encrypted cookie carries the token itself), the email, when it signed in and was last active, its idle expiry and its absolute
end, the browser (User-Agent), IP address and country.

- **Idle timeout, 10 minutes** (`Auth:SessionIdleTimeout`). Any request is activity: at most once a minute, the expiry moves to
  now + 10 minutes and the cookie is re-issued.
- **Absolute limit, 12 hours** (`Auth:SessionMaxLifetime`): however active, a session ends 12 hours after signing in; then it's
  Google again. Activity never pushes the expiry past it.
- **Sign out** (the admin bar) ends this device's session. **Settings → Signed-in devices** lists every device (this one marked)
  with its address, country and times, and signs one out (`DELETE /api/auth/sessions/{id}`) or all the others
  (`POST /api/auth/sessions/end-others`). Anonymous calls to `/api/auth/logout` only clear their own cookie.
- **Other tabs**: signing out in one tab signs this browser's other tabs out at once, and signing in makes them check
  (`auth/authChannel.ts`, a BroadcastChannel). Activity in one tab keeps them all going (they share the cookie).
- **Taken off the list**: removing an email from `Auth:AdminEmails` (or its id from `Auth:AdminGoogleIds`) ends its sessions on
  their next request, for good.
- Ended sessions are cleared out of the table whenever someone signs in.
- **No answer isn't "signed out":** only the API's answer decides (signed in, or 401). If the first check gets no answer (the API
  down or restarting, a network error, a 5xx), the page keeps waiting and asks again (after 2, 4, 8, then every 15 seconds), so
  restarting the API doesn't sign the admin out of an open page.
- **Frontend** (`src/auth/useSessionKeeper.ts`): while signed in, clicks, key presses, scrolling and mouse movement call
  `/api/auth/me` (at most once a minute) to keep the session alive. A timer re-checks just after `sessionExpiresInSeconds`, so the
  UI shows you as signed out once the session ends. The expiry is sent as *seconds remaining*, not a timestamp, so the browser's
  clock doesn't matter.

### Protections

- **The cookie**: `__Host-portfolio.auth` in production (browsers keep it only if it's Secure, for the whole site, and for
  exactly this host: a subdomain can't set or overwrite it), HttpOnly (scripts can't read it), SameSite=Lax. Locally
  `portfolio.auth`, over http.
- **Cross-site writes** (`SameOriginWrites`): a POST, PUT, PATCH or DELETE carrying the cookie must come from the site itself
  (its `Origin` header); otherwise **403**. A second guard after SameSite. Requests without the cookie (visitors, webhooks) aren't
  checked.
- **The keys** that encrypt the cookie and the Settings secrets (ASP.NET Core Data Protection) are kept in the database
  (`data_protection_keys`), and encrypted there with AES-256-GCM when `DataProtection:KeyEncryptionKey` is set (production;
  `KeyRingEncryption.cs`). Locally they're stored as they are.
- **Headers**: the site's pages (`frontend/public/_headers`, Cloudflare Pages) get a Content-Security-Policy (only the site's own
  scripts run; only YouTube can be framed; the site can't be framed), HSTS, a Permissions-Policy
  (no camera, microphone or location), `nosniff` and a Referrer-Policy. The API's own responses get `nosniff`,
  `X-Frame-Options: DENY` and the Referrer-Policy.
- `returnUrl` must be a local path (`/...`); anything else falls back to `/` (no open redirects).
- API calls without a valid cookie get a plain **401** (or **403**), never a redirect to a login page. To protect a new endpoint,
  add `.RequireAuthorization()`.
- If Google credentials aren't configured, the API still runs and `/api/auth/login` returns **503**.
- **Your Google account is the gate**: give it 2-step verification or a passkey.

### Setting up Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/), create (or pick) a project.
2. **Google Auth Platform → Branding** (or "OAuth consent screen"): app name, support email, developer contact. Audience **External**. While in *Testing*, add your Google account under **Audience → Test users**.
3. **Google Auth Platform → Clients → Create client**, type **Web application**:
   - Authorized JavaScript origins: `http://localhost:5173`
   - Authorized redirect URIs: `http://localhost:5173/api/auth/signin-google`
   - Later, for production, add `https://<your-domain>` and `https://<your-domain>/api/auth/signin-google`.
4. Store the credentials and your admin email as user secrets (never in appsettings):

   ```bash
   cd backend/src/Portfolio.Api
   dotnet user-secrets set "Authentication:Google:ClientId" "<client-id>.apps.googleusercontent.com"
   dotnet user-secrets set "Authentication:Google:ClientSecret" "<client-secret>"
   dotnet user-secrets set "Auth:AdminEmails:0" "<your-google-email>"
   dotnet user-secrets list
   ```

5. Restart the API, open http://localhost:5173/admin and sign in.

Production: set the same keys as environment variables (`Authentication__Google__ClientId`, `Authentication__Google__ClientSecret`, `Auth__AdminEmails__0`).

## Phone alerts

The API pushes a notification to the admin's phone for a **new message**, a **coffee**, a **new subscriber**, a **new app** (with
**Send email** / **Ignore** buttons), each **update email sent**, and **crashes**: errors visitors' browsers hit (from the Engagement
recorder) and exceptions the API didn't catch (`CrashAlertHandler`, which still answers with a 500 problem). Crashes are throttled:
the same error once an hour, and at most 10 error alerts an hour in all. Tapping an alert opens the matching page on the site.

They're sent with **[ntfy](https://ntfy.sh)** (free, open source, iOS and Android apps), queued and sent in the background
(`PhoneAlerts`, `AlertWorker`, `NtfySender`), so a slow or broken ntfy never slows a request down. Until a topic is set, alerts only go
to the log. Setting it up (Settings tab, ntfy card):

1. Press **Generate** for a long random topic name, and **Save**. (On the public server anyone who knows a topic can read it.)
2. In the ntfy app tap **+**, type the same topic, keep the server `ntfy.sh`, and **Subscribe**.
3. Press **Send a test alert**.

Optionally reserve the topic with an ntfy account (access token), or use your own server, under "Your own ntfy server".

**Or the site's own notifications** (Web Push, `WebPushSender`), with no app to install: on an iPhone (iOS 16.4 or later),
add the admin to the Home Screen (on jechel.dev/admin, or any page while signed in: Safari → Share → **Add to Home Screen**),
open it from there, sign in, and in Notifications →
**Where they go** press **Get them on this device**, then **Allow**. A computer's browser can get them the same way. Each
device is listed there, with **Send a test** and **Remove**. How it works:

- The page has a web app manifest (`public/manifest.webmanifest`: opened from the Home Screen, it's an app of its own, which
  is what an iPhone needs for notifications). The sign-in page and the signed-in admin link the admin's own instead
  (`public/admin.webmanifest`, `layout/manifest.ts`): a phone saves the manifest's start page, not the page on show, so that
  one opens on /admin (the sign-in, or home when still signed in), a separate app from the visitors' and a service worker (`public/sw.js`, registered only when you allow them here): it
  shows each notification, and opens its page when tapped. It handles nothing else (no caching).
- The API encrypts each alert for each device and signs it with the site's own key pair (VAPID, made the first time it's
  needed and kept in `web_push_keys`: a new pair would cut off every device), then posts it to the device's push service
  (Apple's, Google's, Mozilla's), which delivers it. A device its push service no longer knows (removed from the Home Screen,
  notifications turned off) is forgotten at the next alert.
- Unlike ntfy: no buttons on the notification (iPhones don't show them: a new app's Send / Ignore is in the Community tab) and
  no priorities (a high one is only marked urgent for the push service).

**Both, either or neither**: Notifications → **Where they go** has a switch for each way (`alert_channels`; both on to start
with). An alert goes every way that's on; it counts as sent when any took it, and the history says which.

## Notifications (phone alerts, on or off)

The admin's **Notifications** tab (`pages/NotificationsPage/`, API in `Features/Alerts/NotificationsEndpoints.cs` and
`PushEndpoints.cs`) starts with **Where they go** (above: the ntfy app and the site's own notifications, each on or off, and the
devices), then lists every kind of
phone alert, grouped, each with how many came in the last 30 days, when the last did, and an **On / Off** switch (the theme
switcher's look, two stops: `components/OnOffSwitch`). Below it, the **History**: every alert raised, newest first, a page at a
time, of every kind or one, with what became of it.

- **Kinds** (`AlertKinds.cs`): Visitors (new message, meeting request, meeting booked / moved / cancelled, meeting reminder),
  Community (Buy Me a Coffee, new subscriber, new app to email, update email sent), Problems (emails not going out, site error,
  API crash), Security (signed in, sign-in refused). Every `PhoneAlert` names its kind first; a test reads the API's source and
  fails if one doesn't, or if a listed kind is never raised. Settings → ntfy → **Send a test alert** goes straight out, whatever is off.
- **Switched off:** the alert isn't sent, but it's still in the history, marked **Off: not sent**. It applies to the next alert
  (`AlertPreferences`, in memory, loaded at start-up and after each change; `alert_preferences`, one row per kind switched).
  A new app with its kind off has no Send / Ignore buttons on the phone: decide in the Community tab.
- **History** (`phone_alerts`): written by `AlertWorker` after it sends (or holds back) each alert: **Sent** (and where: to ntfy,
  to this site's notifications, or both), **Off: not sent**, **Not set up: not sent** (no way that's on could send it: no ntfy
  topic, no device), **Both ways off: not sent**, or **Failed** (every way that tried failed). Kept for 90 days.
- **A switch moves at once**, before the API answers, and is never locked while saving (locking it dropped the keyboard's
  focus, so an arrow key threw you out of it). Each answer settles **its own kind only**, and only if it answers the latest click
  on it: taking the whole list from every answer let one arriving late put back a switch saved since. A failed save puts the
  switch back and says so. A save that doesn't say `true` or `false` is refused (400), never read as off.
- **Refresh** (History) loads the history and the kinds' counts again: what came while the page was open. Titles link only to
  pages on this site.

**Switching a kind, step by step:**

```
 You click Off (or press an arrow key)          Store (RTK Query)                                 API
 ─────────────────────────────────────          ─────────────────                                 ───
 switch shows Off at once ◄──── kinds cache: this kind = off (optimistic)
 still focused, still clickable                 latestSave[kind] = this request ─── PUT /api/notifications/kinds/{kind}
                                                                                     {"enabled": false}
                                                                                       │ no true/false ─► 400
                                                                                       │ unknown kind  ─► 404
                                                                                       ▼
                                                                          alert_preferences row, AlertPreferences reloaded
                                                                          (the next alert of that kind isn't sent)
                                                                                       │ every kind, as it now is
                                                ◄──────────────────────────────────────┘
                                                answer to the latest click on this kind?
                                                  yes ─► this kind = the answer's (the other kinds left alone)
                                                  no  ─► ignored (you clicked it again since)
                                                failed (and still the latest) ─► switch back + "That couldn't be saved"
```

```
 Something happens on the site                 AlertWorker (one at a time)                    You
 ─────────────────────────────                 ───────────────────────────                    ───
 new PhoneAlert(AlertKinds.Message, …) ──► queue ──► kind on? (AlertPreferences) ──no──► not sent ─┐
   (throttled ones: SendThrottled)                       │ yes                                    │
                                                         ▼                                        │
                                               a way on? (Where they go) ──no──► both ways off ────┤
                                                         │ yes: each way that's on                │
                                                         ▼                                        │
                                               ntfy: topic set? POST to ntfy ─┐                    │
                                               push: each device, encrypted ──┼─ any took it ─► 📱 sent (and where) ┤
                                                 (gone: device forgotten)     ├─ one failed ──► failed ────────────┤
                                                                              └─ none set up ─► not set up ────────┤
                                                                                                  ▼
                                               phone_alerts (90 days) ◄───────────────────────────┘
 Notifications tab ── GET /api/notifications/kinds ── switches, counts, last time
                   ── PUT /api/notifications/kinds/{kind} {enabled} ──► alert_preferences + AlertPreferences (at once)
                   ── GET /api/notifications?kind=&page= ── the history
```

## Settings (connections)

The admin's **Settings** tab (`pages/SettingsPage/SettingsPage.tsx`, API in `Features/Settings/`) has three cards: **Visitor pages** (the pages, and the
features Buy me a coffee, Get updates and Work with me),
**Signed-in devices** and **Connections**. Connections lists every service the site connects to, **A to Z**, each a folded row (an
accordion, as the skills are in the About Me editor) with links to its dashboard, its keys, the URLs to paste into it (webhook, OAuth
callback), and a test button: Buy Me a Coffee, Cal.com, Google sign-in, ntfy, Resend, YouTube Data API, plus quick links: Hosting
(Cloudflare, Sliplane) and Porkbun (the domain).

**What a change reaches, without a reload:**

```
 Settings                                   Store (RTK Query)                          On the site
 ────────                                   ─────────────────                          ───────────
 Visitor pages: a switch ──► PUT /api/site ──► site state ──────────────────────────► tabs, Get updates (at once)
                                     │         saveSite fulfilled ─► Support stale
                                     │                                   │ asked again (once nothing else is in flight)
                                     ▼                                   ▼
                       Buy me a coffee: off ─► gone at once (it reads the switch too)
                                        on  ─► GET /api/support ─► back, with the link
 Connections: a key or link ──► PUT /api/settings/{key} ──► Settings answer kept
                                     │  Support:* saved ─► Support stale ─► the header's coffee link
                                     │  Cal:* saved     ─► MeetingsLink stale ─► the reply box's booking link
                                     ▼
                       the API applies it at once (SettingsStore ─► IOptionsMonitor)
```

- **Storage:** the `site_settings` table, one row per key. Secrets are encrypted with ASP.NET Core Data Protection (the same keys as
  the session cookie; persist them in production, or saved secrets can't be read after a deploy and have to be entered again).
- **Never back to the browser:** a secret is shown as set/not set and its last 4 characters; the box only takes a new one.
- **Applies at once:** a saved value overrides the same key in the configuration (`SettingsStore`, bound into the options with
  `BindWithSettings<T>`; code reads them through `IOptionsMonitor<T>`). **Remove** goes back to the configuration's value.
- **Google sign-in** is shown, not editable: it's read when the API starts, and a wrong secret saved from a page that needs it to
  sign in would lock you out. Change it in user secrets or environment variables.
- Which keys can be set is a fixed list (`SettingsCatalog.cs`); each is checked (links, sender address, topic characters).
