# The site

What visitors see and how it behaves: the pages, the theme, phones, performance and accessibility. Part of the [README](../README.md).

## The "j" (Vice title and tab icon)

Mr Dafoe's own j has a long, thin tail loop that closes up when small (in a browser tab it looked like a
banana), so the site draws its own: `scripts/build_brand_j.py` traces a brush stroke (thick going down,
thin going up, with a wide, open loop) in the font's units and writes two weights of it:

- `frontend/src/assets/brand-j.svg`: the Vice title's j. `glass.css` (`.brand-j::before`) masks the neon gradient and the purple shadow layer with it, where the font's j would be; the letter stays in the page (at size 0) and the title link is named "jechel.dev", so screen readers still read the name. Other themes show the plain j.
- `frontend/public/favicon.svg`: the tab icon, a bolder j on a dark tile. `favicon.ico` (16, 32, 48 px, for Safari and old browsers) and `apple-touch-icon.png` (180 px) are renders of it.

After changing the drawing, re-run the script, re-render the PNG copies (e.g. a Playwright screenshot of
favicon.svg), update the bounds in `.brand-j::before` if the script prints new ones, and bump the `?v=`
on the icon links in `index.html` (browsers keep tab icons cached).

## Site sections and the contact feature

The site is a header (for the admin, a bar on top with who's signed in and **Sign out**; then the name, **Buy me a coffee**, **Get updates** and the theme switch, whose icon turns once when picked: the sun's rays go round it, the moon flips over the X axis, the Vice mark over the Y axis; not on load, nor with reduced motion) above five tabs (nine for the signed-in admin, whose own four are written in the jechel.dev pink to violet, the same in every theme: `.tab-admin` in `glass.css`), each a route rendered inside `src/layout/AppLayout/AppLayout.tsx`:

| Tab | Route | Status |
| --- | --- | --- |
| What's new? | `/` | the latest app (the first in my order that may show there) or the newest video, in full |
| Apps | `/apps` | my apps in a grid, each with a popup; the admin adds and edits them |
| YouTube | `/youtube` | my videos, 9 a page |
| About Me | `/about` | profile, where I've been (map), problem solving (LeetCode, NeetCode), skills timeline, experience, education, papers, qualifications, languages, licences, hackathons; editable by the admin |
| Contact | `/contact` | contact form / admin inbox |
| Engagement | `/engagement` | admin only: how visitors use the site, and every visit replayable to reproduce errors (see [Engagement](features.md#engagement-visitor-analytics)); visitors who open the URL go to `/` |
| Community | `/community` | admin only: email subscribers, the update emails (new apps wait here to be sent or ignored), and coffees (see [Email updates](features.md#email-updates) and [Buy me a coffee](features.md#buy-me-a-coffee-donations)) |
| Terms | `/terms` | admin only: the terms and conditions, editable (see [Terms and conditions](features.md#terms-and-conditions)) |
| Settings | `/settings` | admin only: the services the site connects to (folded, each with how far it's set up), their links and keys, with test buttons (see [Settings](admin.md#settings-connections)) |
| (no tab) | `/updates/confirm`, `/updates/unsubscribe` | where the links in update emails land |

**What's new?** (`src/pages/WhatsNewPage/WhatsNewPage.tsx`): an app or the newest YouTube video, whichever came last, shown in full. The app is the first in the admin's order (Apps → **Organise**) whose **Show in What's new?** is on, compared with the video by when it was added (the video by when it was published). An app switched off is skipped for the next one that's on. An app gets the popup's view (`AppDetailsView`: slider, labels, description, platforms, store links). A video gets YouTube's player (from `youtube-nocookie.com`, which sets no cookies until it's played), its full description with web addresses as links (`utils/linkify.ts`), and a **Watch on YouTube** button. It only asks the API for that one app and the newest video, and only of the sections visitors may see (**Settings → Visitor pages**: with Apps hidden, the newest video shows even if an app came later). The signed-in admin sees exactly what visitors see, with a note saying which section is left out and why; the empty and error messages name only what's shown (apps, videos, or both). If one list fails (e.g. YouTube isn't set up), the other is shown.

```
  Settings → Visitor pages (GET/PUT /api/site; site_state)
     Apps on?        YouTube on?        (the same switches for visitors and the admin)
        │                 │
        ▼                 ▼
  GET /api/apps/whats-new            GET /api/youtube/videos?page=1&pageSize=1     (only the ones switched on)
        │ the first app in the order     │ newest video (publishedAt)
        │ with Show in What's new? on    │
        │ (compared by createdAt)        │
        └──────────────┬─────────────────┘
                       ▼  getLatest (store/api/appsApi.ts): whichever came last (an app on a tie)
  What's new?   app ──▶ LatestApp (the app's popup view: slider, labels, description, platforms, store links)
                video ─▶ LatestVideo (YouTube's privacy-enhanced player, description, Watch on YouTube)
                none ──▶ "Nothing here yet. New apps / videos / apps and videos will show up here."
                one list failed, the other empty ──▶ "The newest … can't be loaded right now." + Try again
  It loads again when a switch changes, an app or the order is saved, or the admin refreshes from YouTube.

  Email updates follow the same switches (UpdatesAnnouncer, every 10 minutes or when poked):
     Get updates off ──▶ nothing is emailed (approved apps wait); new videos are recorded as not sent
     YouTube hidden ──▶ new videos are recorded as not sent (no backlog when it's switched on)
     Apps hidden ─────▶ a new app isn't offered to email; an approved one isn't sent
     otherwise ───────▶ new videos go out by themselves; a new app asks the admin's phone first (Send email / Ignore)
                         emails link to the video on YouTube, or to the Apps page
```

**Apps** (`src/pages/AppsPage/AppsPage.tsx`, `src/features/apps/`, API in `backend/.../Features/Apps/`):

```
  Admin (signed in)                         API                                       Database
  ─────────────────                         ───                                       ────────
  Upload an image or video ──▶ POST /api/files/app-media
                                 image: checked, turned upright, fitted to 1920 px,
                                        WebP without metadata (SkiaSharp)  ─────────▶ stored_files
                                 video (MP4, MOV, WebM, ≤ 200 MB): kept as it is ──▶ stored_files
                               ◀─ its /api/files/… address
  Or a link: a YouTube video, an image or video elsewhere (kept as a link)
  Save the app ──────────────▶ POST /api/apps, PUT /api/apps/{id}
                                 AppRules: title, description (≤ 5000, safe links),
                                 ≤ 30 media, categories that exist, platforms, ≤ 10 links ──▶ apps
                                 YouTube links stored as their watch link
                                 uploads no app or About Me uses any more: deleted a day later (FileCleanup)
                                 a new app: the phone asks whether to email the subscribers (AnnouncementDecisions)
  Categories ────────────────▶ PUT /api/apps/categories (rename, reorder, add, remove) ─▶ app_categories
                                 a removed one is taken off every app
  Organise ──────────────────▶ GET /api/apps/order, PUT /api/apps/order
                                 every app, each once, top first, with Show in What's new? ──▶ apps.position,
                                 numbered afresh from 0; refused if apps were added or deleted   apps.show_in_whats_new
                                 meanwhile (open it again). A new app goes first (before position 0).

  Visitor                                   API
  ───────                                   ───
  Apps page ─────────────────▶ GET /api/apps?page=&pageSize= (the admin's order; 9, or 8 next to the admin's Add tile)
     grid of tiles (PagedGrid: pages next to it loaded ahead, sliding between pages)
     a tile ──▶ its popup: the slider (MediaCarousel: uploads from /api/files, links from other sites,
                YouTube in its privacy-enhanced player), labels, description, "Runs on", store links
  What's new? ───────────────▶ GET /api/apps/whats-new: the first app in the order with Show in What's new? on,
                                 shown if it came after the newest video (and Apps is a page visitors may see).
```


- The same paged 3 × 3 grid as YouTube, in the admin's order (a new app goes first; the apps there before the order existed kept their newest-first order). A tile shows the app's first image (whatever comes before it), its title and the start of its description. Clicking it opens a popup with every image and video in a sideways slider (swipe, arrows, dots or the arrow keys; moving on pauses a video; a YouTube video gets YouTube's privacy-enhanced player on its own slide and a thumbnail elsewhere, so moving on stops it too). The tile uses the first image, or else a YouTube video's thumbnail and the full description, which may hold `[text](url)` links.
- **The admin** gets an **Add an app** tile first (the first page then holds 8 apps, so it stays 3 × 3), and an **Edit** button in each popup that turns it into the form used for adding: title, description, and the images and videos, which can be uploaded several at once, added from a link (a YouTube video such as a trailer, or an image or video file elsewhere), dragged to reorder and removed. Dragging uses pointer events (`components/useDragSort.ts`): a mouse drags a whole tile, a finger its handle (so the popup still scrolls), and the handle also takes the arrow keys. Closing with unsaved changes asks first. **Delete app** asks too.
- **Organise** (before **Categories**, above the grid) opens the admin's list of every app, in order: drag one (a mouse anywhere on its row, a finger on its handle, or the arrow keys on the handle) to move it, and switch **In What's new?** on or off for each. **Save**, top left, is on once something changed, and the popup stays open on the saved order. Only **×** closes it (not Escape, not a click beside it: `Modal`'s `dismissible={false}`), asking first if there are changes not saved. The add / edit form has the same **Show in What's new?** switch (on for a new app).
- **Categories** (e.g. Mobile app, Website, Video game, the three it starts with) are the admin's own list, edited with **Categories** above the grid (the tab bar names the page, so What's new?, Apps and YouTube have no title of their own): rename, reorder, add, remove (which takes it off every app). An app can have several; they show as labels under its title, on the tile and in the popup, in the list's order.
- **Runs on:** platforms (iOS, Android, … with one click, or typed in), shown in the popup only.
- **Check it on…:** links shown in the popup as **Check it on {name}** buttons, e.g. App Store, Google Play, Steam (suggested while typing; anything else works).
- `GET /api/apps` and `GET /api/apps/whats-new` (public), `POST /api/apps`, `PUT /api/apps/{id}`, `DELETE /api/apps/{id}`, `GET /api/apps/order` and `PUT /api/apps/order` (admin), stored in the `apps` table (media, category ids, platforms and links as `jsonb`). `GET /api/apps/categories` (public) and `PUT /api/apps/categories` (admin, the whole ordered list) use `app_categories`. `POST /api/files/app-media` takes one file: images (JPEG, PNG, WebP, GIF up to 15 MB) become a WebP of at most 1920 px without metadata; videos (MP4, MOV, WebM up to 200 MB, recognised by their first bytes) are kept as they are. Files are served with range requests, so videos can start before they're fully downloaded (Safari needs this).
- Saving About Me or an app deletes uploads that **nothing** uses any more, once a day old (`FileCleanup.cs`).
- Videos live in the database like every other upload and are read whole for each request. That's fine for a few short clips; for many or long videos, move `IFileStorage` to object storage (R2, S3) or link YouTube videos instead.

**YouTube** (`src/pages/YouTubePage/YouTubePage.tsx`, API in `backend/.../Features/YouTube/`): the channel's public videos, newest first, in a 3 × 3 grid (2 columns on tablets, 1 on phones). Each card shows the thumbnail, title, date and the start of the description (cut after three lines), and opens the video on YouTube in a new tab. More than 9 videos get Previous / Next, with the page in the URL (`?page=2`).

**The channel's page** (`GET /api/youtube/channel`, public, from **Settings → YouTube → Channel**: a handle gives
`youtube.com/@handle`, an id `youtube.com/channel/UC…`; 204 when none is set, or it's neither, such as a pasted web address, and then
the buttons below aren't shown).
Three buttons open it in a new tab (`features/youtube/YouTubeChannelButton`): **Visit my YouTube page** above the
videos, **YouTube** last among About Me's links, and, once an email subscription is confirmed, **Subscribe to my
YouTube channel** next to **See what's new** (with `?sub_confirmation=1`: YouTube asks to subscribe).

**Paged grids** (YouTube and Apps, `components/PagedGrid`): moving to another page slides the old page out and the
new one in from its side (Next: from the right; Previous: from the left), with the same motion as switching tabs
(`grid-enter` / `grid-leave` in `glass.css`), and not for visitors who ask for reduced motion (`utils/motion.ts`). The
pages next to the one on show (page − 1 and page + 1, within range) are loaded ahead with RTK Query's prefetch
(`usePrefetchApps`, `usePrefetchVideos` in `store/api/appsApi.ts`), which skips a page loaded in the last 30 seconds,
so Previous / Next show their page at once; a page that wasn't loaded ahead shows placeholders, then slides in.
While a page slides, the grid's height goes from the old page's to the new one's with the same timing (a Web
Animation from `PagedGrid.viewModel`), so Previous / Next glide up to a shorter page (or down to a taller one)
instead of jumping.

How the videos get to the page:

```
  YouTube Data API v3  (≈2 units per fetch, of 10,000 free a day)
          ▲
          │ asks for the channel's videos:
          │   · when the API starts, then every hour (YouTubeRefreshWorker; 5 min after a failure)
          │   · when the admin presses "Refresh from YouTube" (POST /api/youtube/refresh)
          │   · when a visitor comes and nothing is saved yet (the very first time)
          │
  YouTubeVideoStore ───── memory: the list on hand
          │        └───── database: youtube_videos, one row per channel (survives restarts;
          │                shown while YouTube is down)
          ▼
  GET /api/youtube/videos?page=&pageSize=   a page of the list
          │   Cache-Control: private, max-age=300 for visitors · no-store for the admin
          ▼
  Browser: RTK Query (listVideos; the pages next to the one on show loaded ahead)
          ├──▶ YouTube page (3 × 3 grid, sliding between pages)
          └──▶ What's new? (the newest video, if YouTube is a page visitors may see)

  The same store also feeds the email updates (UpdatesAnnouncer: new videos go to subscribers).
```

- `GET /api/youtube/videos?page=1&pageSize=9` (public) reads the uploads with the YouTube Data API v3. It needs `YouTube:Channel` (`@handle` or `UC…` id) and `YouTube:ApiKey`; until both are set it answers 503 and the page says the videos can't be loaded.
- The list is kept by `YouTubeVideoStore`: in memory, and in the database (`youtube_videos`, one row per channel), so a
  restart or a YouTube outage still shows the last list; visitors only wait for YouTube when there's no list at all yet.
  `YouTubeRefreshWorker` asks YouTube as the API starts and then hourly (every 5 minutes after a failure). Each refresh
  costs about 2 units of the free 10,000 a day.
- Visitors' browsers may keep a page of videos for 5 minutes (`Cache-Control: private, max-age=300`, `Vary: Cookie`);
  the signed-in admin's never do (`no-store`).
- **Refresh from YouTube** (admin only, above the grid): `POST /api/youtube/refresh` asks YouTube now, e.g. right after
  an upload, and says how many videos there are; the grid and What's new? load again. 503 when YouTube isn't set up or
  can't be reached (the saved list stays).
- **Reusable for Apps:** `src/components/PagedGrid/PagedGrid.tsx` (takes the RTK Query hook for a page, e.g. `useListAppsQuery`, and its texts as one `PagedGridTexts` object from the page's view model; shows loading / empty / error and the pagination, and renders its children after the grid, e.g. the app popup) and `src/components/MediaCard.tsx` (image, title, meta line, clamped description; the whole card is a link). `Pagination.tsx` and `usePageParam.ts` are shared with the contact inbox.

Unknown URLs redirect to `/`.

**The tab bar** (`layout/TabNav/TabNav.tsx`): when the window is too narrow for every tab (phones, small windows), a ‹ / › arrow shows
at the end that has more, over a fade, and scrolls the bar most of its width, stopping at the end (quick presses add up).
The fade is on a wrapper (`.tabs-window`), not the bar that scrolls, and the arrows and fades change only once the bar
has stopped (120 ms without scrolling): changing mid-scroll on the scrolling bar itself, they made Safari on iPhone draw
the tabs far past either end with a gap beside them. The arrows are for pointers and fingers; keyboards
reach every tab with Tab. One highlight glides to the tab that's picked. Pressing the current tab and dragging moves it
across; letting go snaps it to the nearest tab, which opens (a tap stays a tap: dragging starts after 5 px, and the click that ends a
drag is swallowed). On phones the bar still scrolls sideways when dragged anywhere else.

**Contact** (`src/pages/ContactPage/ContactPage.tsx`, `src/features/contact/`):

- **Visitors** (`<SignedOut>`) get a form: name (max 100), email, and a message of **100 to 1000 characters**, counted after trimming. Errors appear after the first submit and then update as you type. The rules are in `contactRules.ts`, mirroring the API's `ContactRules.cs`. The API has the final say, and its field errors are shown on the matching fields.
- **The admin** (`<SignedIn>`) gets the inbox: a table of conversations (name, last message, how many), 10 per page (the page is in the URL, `?page=2`). Unread messages are bold, with a blue dot. Clicking a row opens a popup with every field and a **Copy** button for each, and marks the message as read.
- Each detail has a copy-to-clipboard icon button (`src/components/CopyButton/CopyButton.tsx`); the icons are in `src/components/icons/icons.tsx`.
- **Deleting:** each row has a trash button, and the popup a **Delete** button (`DELETE /api/contact/messages/{id}`, admin only). Both ask first.
- The popup is `src/components/Modal/Modal.tsx`: it keeps focus inside (Tab wraps), closes with Escape, the × button or a click on the backdrop, and returns focus to the row's button. Keys and clicks inside a dialog stay inside it, so a dialog opened from another (or from a table row) behaves: Escape closes only the top one. Taller than the screen, only what's inside it scrolls (`.modal-body`): the frame and its glass rim stay put, and it fits the screen a phone's browser bar leaves (`100dvh`).
- **Confirming:** `src/components/DeleteButton/DeleteButton.tsx` is the one delete button for the whole site: it opens `ConfirmDialog` ("Delete …?" with Cancel focused) and only then runs `onDelete`. If that is async, the popup waits and says so when it fails. About Me uses it with `action="Remove"` for every remove button, explaining that nothing is lost until the section is saved.

**About Me** (`src/pages/AboutPage/AboutPage.tsx`, `src/features/about/`, API in `backend/.../Features/About/`):

- The page is **one JSON document** (`AboutContent`), stored in the `about_page` table (`jsonb`, one row). It's always read and saved whole, so changing its shape means changing `AboutContent.cs` and the matching types in `api.ts`, with no new migration. Until the first save, `GET` returns `AboutDefaults` (placeholders).
- **Sections:**
  - **Photo and links:** an uploaded photo (or a placeholder icon) on top, the name with the résumé's **headline** under it (for everyone; edited with the profile, see [Résumé generator](features.md#résumé-generator)), then citizenship and residence labels (`statuses`: text and a flag each, e.g. 🇬🇧 "UK Settled Status"; the editor guesses the flag from the words; with none, only the admin sees a hint where they go), then the generated résumé (download button, see [Résumé generator](features.md#résumé-generator)) and GitHub, LeetCode (when a username is set under Problem solving), LinkedIn and Instagram in their brand colours. An empty link is hidden. The admin also sees an **Only you see this** box with the résumé's email and phone, each after a copy-to-clipboard button.
  - **Where I've been:** a dotted world map with a pin per city. Each city is marked *worked*, *studied* and/or *visited*, each with an optional note. A pin with several marks is split into equal slices, one colour each. Hovering, focusing or tapping a pin shows its notes. Zoom with the buttons, a pinch, or Ctrl/⌘ + scroll; drag to move. In the editor, the places are also listed alphabetically under the map (`compareLabels`: case and accents don't matter, so "Århus" comes before "bath"); they're saved, and pinned, in the order they were added.
  - **Problem solving:** LeetCode stats (solved problems, split into Easy, Medium and Hard, out of all on LeetCode) for the username the admin sets (pasting the profile link works too), and the NeetCode lists completed (Blind 75, NeetCode 150, NeetCode 250), switched on and off like licences and shown as labels. NeetCode has no public API, so those are ticked by hand.
  - **Skills:** a timeline. In the editor each skill is folded to a row (name, experience, move and remove buttons) until clicked open; a skill with an error opens by itself. Each skill has periods, each used for *work*, *academic* and/or *personal* (several split the bar into bands). The years of experience are worked out from the periods, counting overlaps once. A skill without periods is listed without a bar. **Sort by experience** orders them by total time (applies on Save, like the sort below).
  - **Work experience:** title, company, optional location, start month (may be in the future), an end month or *ongoing*, and bullet points.
  - **Education:** the same, without bullet points.
  - **Academic papers:** a title and an uploaded PDF each. With a PDF, the title is a download link with a download icon.
  - **Qualifications:** a title, and optionally the issuer, the month obtained and a grade.
  - **Languages:** a name and a level (native, fluent, advanced, intermediate, beginner), shown as a word and five steps.
  - **Licences:** driving, flying and boating licences, shown as rounded labels grouped by kind. The admin clicks the ones they have from a built-in list (`licences.ts`: EU/UK driving categories, drone and pilot licences, boating certificates) and can add others by hand.
  - **Hackathons:** name, year and bullet points; reorderable, with **Sort by year**.
- **Colours:** the admin picks the legend colours (skill uses, map marks) with colour pickers. They're stored in the page (`colors`).
- **Collapsing:** every section has a chevron that folds it down to its heading. It's for visitors too, and is remembered per section in that browser (`localStorage`). Editing a collapsed section opens it.
- **Editing:** when signed in, each section has an **Edit** button that turns it into a form; **Save** sends the whole page with that section changed. The API validates everything (`AboutRules.cs`), trims text and drops empty bullets. The page then shows what the API stored. Field errors come back keyed by path and show under the matching input. Since the whole page is sent, a problem in another section also blocks the save: the message then names that section and item (`errorKeys` on `EditableSection` says which keys a section shows itself).
- **Order:** every list is shown in the order the admin set, with the arrow buttons. Experience and education also have **Sort by end date** (ongoing first, then the latest end): it only reorders the form, so Save keeps it and Cancel undoes it.
- **Links in text:** any text field can hold `[text](https://…)` links, e.g. a company written as `[Acme](https://acme.example)`. The **Add link** button under a field writes one at the cursor. Only http(s) links and paths on this site become links (`textLinks.ts`, and `AboutRules.LinksIn` on the API).
- **Older pages:** `AboutJson.cs` upgrades a page saved in an older shape when it's read (0–100 skill levels are dropped, qualifications as plain text get no date, a company or institution website becomes a link in its name), so changing the shape needs no data migration. Whatever it produces must pass `AboutRules`, or no section could be saved.
- **Links** must be `http(s)://…` or a path on this site (`/resume.pdf`), checked by the API and again before rendering, so a stored value can never become a `javascript:` link.
- Dates are months, stored as the 1st (`2023-01-01`). The month picker is a select plus a year box, because desktop Safari and Firefox don't support `<input type="month">`.

How About Me is put together, and who sees what:

```
                         ┌─────────────────────────── About Me (/about) ───────────────────────────┐
  GET /api/about ───────►│ one JSON page (about_page): photo, labels, links, places, skills, …      │
  (public)               │                                                                          │
  GET /api/resume/ ─────►│ Claudiu Mihai Jechel                                                     │
    headline (public)    │ Full-stack engineer · …      ◄── the headline: everyone                  │
                         │ labels · Download résumé · GitHub · LeetCode · LinkedIn                  │
  GET /api/resume/ ─────►│ ┌ Only you see this: ┐                                                   │
    settings (admin)     │ │ [⧉] email          │       ◄── admin only, each with a copy button     │
                         │ │ [⧉] phone          │                                                   │
                         │ └────────────────────┘                                                   │
  GET /api/leetcode ────►│ Problem solving (cached: memory 24 h → leetcode_stats → leetcode.com)    │
  (public)               │ Where I've been · Skills · Experience · Education · Papers · …           │
                         └──────────────────────────────────────────────────────────────────────────┘

  Admin: Edit a section ──► its form (a draft) ──► Save
        │                                            │
        │  Photo and links: PUT /api/resume/contact (phone, email, headline; table resume)
        │                   then PUT /api/about ─────┤  the headline under the name changes at once
        │  any other section: PUT /api/about ────────┤  (the whole page, that section changed)
        │                                            ▼
        │                        AboutRules: 400 + errors by path ("places[1].name") shown on the
        │                        fields, or 200 + the page as stored, which every view then shows
        │
        │  Where I've been: city search (GET /api/places/search, admin; cities.tsv.gz)
        │     pick ─► popup (worked / studied / visited + notes) ─► map + list (A→Z)
        │     a place removed from the list leaves the open popup on its own place
        │
        └► Résumé generator: POST /api/resume/generate ─► public PDF (no email or phone) at /api/resume
                                                          private PDF (phone) at /api/resume/private
                                                          "Download résumé" ─► /api/resume?v=<time>
```

**Uploaded files** (`backend/.../Features/Files/`):

- `POST /api/files/photo` and `POST /api/files/paper` (admin, multipart field `file`) return `{ url, fileName }`. The editor puts the URL in the page; it's used once the section is saved.
- Photos (JPEG, PNG, WebP or GIF, up to 15 MB) are turned upright, scaled to fit 800×800 and stored as WebP **without metadata**, so a phone photo's GPS position never reaches the site. Papers (up to 200 MB) must be PDFs and keep their file name.
- Each upload endpoint reads its own form and raises the server's request limit (Kestrel's default is 30 MB) for that request only. The editor checks the size before sending and shows the upload's progress. Limits are in `FileRules.cs` and `uploadLimits.ts`.
- Files are served publicly from `GET /api/files/{id}/{name}`. Saving the page or an app deletes uploads nothing uses any more once they're a day old (a replaced photo, or one uploaded and never saved).
- Storage is behind `IFileStorage`. `DatabaseFileStorage` keeps files in the `stored_files` table, which suits a photo and a PDF. Moving to object storage (Cloudflare R2, S3) means a new implementation and one line in `Program.cs`. Files are served with `Cache-Control: public, max-age=31536000, immutable`, since a file's URL never changes.
- Image processing uses SkiaSharp (MIT; `FileRules.PreparePhotoAsync`): JPEG, PNG, WebP or GIF (its first frame) only, at
  most 100 million pixels (checked before decoding), turned upright by its EXIF orientation, scaled to fit, re-encoded
  as WebP at quality 85 with nothing but the pixels (no EXIF, GPS or XMP). Replaced ImageSharp in October 2026, whose
  advisories were only fixed in version 4, which needs a licence key. The Linux native library comes from
  `SkiaSharp.NativeAssets.Linux.NoDependencies` (no system libraries needed in the Docker image).
- Flags come from the `flag-icons` package (MIT), as separate SVG files loaded when shown (`features/about/flags.ts`).

**LeetCode stats** (`backend/.../Features/LeetCode/`): `GET /api/leetcode` (public) returns the stats of the username saved on the page, and only that one, so the API can't be used to look anyone up. It returns 204 when no username is set, 404 when LeetCode has no such user, and 503 when LeetCode can't be reached and nothing was saved yet. The numbers come from LeetCode's GraphQL endpoint (`https://leetcode.com/graphql`), the one its own profile page uses: it needs no key, but it isn't an official API and may change. They're **cached** so visitors don't each trigger a call:

1. **In memory** (`LeetCodeMemoryCache`, a singleton): answers instantly for 24 hours. Lost on restart.
2. **In PostgreSQL** (`leetcode_stats`, one row per username): survives restarts and is the fallback. If LeetCode fails, the last saved numbers are shown (the page adds "As of <date>" once they're over 48 hours old) and LeetCode is tried again after 15 minutes.

Only one refresh runs at a time (`RefreshLock`), so visitors arriving together cause a single call. The times are in `LeetCodeStatsService.cs`. Tests replace `ILeetCodeClient` with a fake, so they never call leetcode.com.

**City search** (`backend/.../Features/Places/`): `GET /api/places/search?q=manch` (admin) searches every place with 1,000+ people (~170k, from [GeoNames](https://www.geonames.org), CC BY 4.0) by the start of its name, largest first, ignoring accents. Text after a comma narrows by region or country (`manchester, new hampshire`). The list is `cities.tsv.gz`, embedded in the API and built by `python3 scripts/build_cities.py`.

**The map's dots** are generated once by `node scripts/build-world-dots.ts` (in `frontend/`) from Natural Earth land shapes into `src/features/about/places/worldDots.ts`. Pins use the same projection (`projection.ts`), so they line up.

## Visitor pages and maintenance

**Settings → Visitor pages** (above the connections) switches each visitor page (What's new, Apps, YouTube, About Me, Contact)
and each feature that needs setting up once live (Buy me a coffee, Get updates) on or off. **Everything starts
off**, so going live shows nothing half-finished: switch each part on once it's ready. (The E2E tests and the integration tests
start with everything on: `Site:PagesVisibleByDefault`.)

**Buy me a coffee** needs its page link too (Settings → Buy Me a Coffee → Page link): switched on without one, visitors get no button, and the switch says so.

- A page that's off is gone from visitors' tabs, and its link leads to the first page that's on, or **Coming soon** when none is.
  You always see every page; hidden ones have an eye-off mark in the tabs.
- A feature that's off is off for everyone: its button goes, and the API agrees (`/api/support` answers `""`, subscribing answers 404). The page data APIs stay public: hiding a page is about what's ready, not about secrecy.
- **Under maintenance** (with an optional message) gives visitors the maintenance card in the site's usual frame (the name, the
  theme switch, Vice's scene), without the tabs, the pages, the footer or the header's other buttons; you still see
  everything, with a reminder in the admin bar. Signing in (`/admin`) and the links in emails (`/updates/confirm`,
  `/updates/unsubscribe`) keep working; the screen itself has no admin link.
- **When the API can't be reached** (down, or answering with errors), visitors get the same screen, saying so, and the page asks
  again every 30 seconds and comes back by itself.

**Hosting the frontend on Cloudflare, the API elsewhere:** the SPA is static (Cloudflare Pages), so it stays up while the API is
down, restarting or being deployed, and the maintenance screen is part of it: no second website needed. For planned work on
the frontend itself (or to take everything offline), `frontend/public/maintenance.html` is a standalone page with nothing to
load: point a Cloudflare redirect rule (or a small Worker) at it while the work lasts.

State lives in the `site_state` table (one row) and is read through `SiteEndpoints.LoadAsync` (cached, cleared on save).

## Vice on phones and on weak devices

- **Phones** (≤ 640 px): Vice's hide / show button is an icon in the header, left of **Buy me a coffee**. While the page shows it's
  rendered inside a slot there (`ContentToggle`'s `slot`, through a portal), so it scrolls and bounces with the header (an earlier
  version measured the slot and pinned the button over it, which drifted when a phone over-scrolled past the top or bottom). The
  header slides away with the page, so while the page is hidden the button waits in the bottom-right corner instead, keeping the
  focus as it moves. The neon title gets some room from the screen's edge.
- **The eye blinks** on the hide / show button (any screen) every 15 seconds, the first time 15 seconds after it appears; with the
  page hidden or shown, only the eye closes (the slash stays still), not with reduced motion, and not while nobody is using the page (`<html data-idle>`, like the neon colours; `eye-blink` in `glass.css`).
- **Reduce motion** (iPhone: Settings → Accessibility → Motion; Android: Remove animations): the scene draws one still frame, on
  purpose. Turn it off to see the scene move.
- **When the scene can't be drawn** (`riviera.ts`, `onFail`): a picture that won't load, a texture the GPU refused (the first frame
  is read back once, and a black one counts), or a lost WebGL context. The still picture shows instead of a black screen; a lost
  context the browser gives back starts the scene again.
- **Scrolling on phones** slides the browser's bars in and out, which changes the visible height. The scene is as tall as the
  screen with the bars hidden (`100lvh`, `glass.css`), so it doesn't follow them; and since resizing a WebGL canvas clears it, any
  resize that's left (turning the phone) draws it again at once (`riviera.ts`), animating or holding still. Before, the black behind it
  flashed between frames while scrolling.
- **The black behind the scene is on `<html>`, not `<body>`** (`glass.css`). The scene sits under the page (`z-index: -1`): above the
  root's background, below body's. Body's background only moves to the root while `<html>` has none, and Firefox on iPhone gives
  `<html>` one, so body's black covered the scene there. In Vice, body is transparent.

**Scrolling:** each page remembers how far down it was (for this tab, `layout/useScrollMemory.ts`): a page you haven't opened
yet starts at the top, and going back to one returns to where you were, retried while its content loads.
- **First visit, no theme chosen yet:** Vice, unless the device can't show it smoothly (`layout/device.ts`): the browser asks to save
  data or is on a slow connection, under 4 GB of memory (Chrome reports it), two cores or fewer, no WebGL 2, or WebGL drawn in
  software (SwiftShader, llvmpipe: no real graphics card). Then the device's own light or dark (`prefers-color-scheme`).
- **Too slow anyway:** the scene counts the frames it manages (it aims for ~30 a second). After a 2-second warm-up, under 20 a second
  over 4 seconds, with the tab visible and focused, it switches to light or dark, remembers that for next visits
  (`theme.slowDevice`), and says so with a **Use Vice anyway** button. Someone who picked Vice themselves is never switched.

## Performance (what the page costs to keep open)

Measured in Chromium (GPU on, 1512×945 at 2×, the home page), as CPU used by the whole browser:

| | Before | After, in use | After a minute with no input |
|---|---|---|---|
| Vice | 25% | 20% | **1%** |
| Dark / light | 7–8% | 7–8% | **0–1%** |

- **The neon colours** (the site name, the Vice mark) follow the scene's time. They were set as `--neon-shift` on the whole header
  30 times a second, which restyled everything in it each time (25 ms of style work a second). Now they're set on the neon
  elements only, 8 times a second, as the CSS animation steps in the other themes (`riviera.ts`).
- **Nobody using the page** (`layout/idle.ts`): after 60 s without a pointer, key, scroll or touch, the Vice scene stops drawing
  and the neon colours, the eye's blink, the coffee's steam and the bell pause (`<html data-idle>`); the next input carries on where they stopped, with no jump. This is the case
  that matters most: a tab left open on screen while working in another window (unfocused, the scene still drew 15 frames a
  second), where every frame also re-blurred each frosted card over it.
```
 Page open                     After 60 s with no pointer, key, scroll or touch           The next input
 ─────────                     ───────────────────────────────────────────────           ──────────────
 Vice scene: ~30 frames/s ───► stops asking for frames (idleClock holds its time) ──────► carries on where it was
   neon colours: 8 steps/s,    neon colours: paused (<html data-idle>, glass.css)        (no jump), frames again
   on the neon elements only   frosted cards: nothing behind them moves, no re-blur
 Other themes: the Vice mark's neon ───► paused too
 Every theme: the eye's blink, the coffee's steam, the bell ───► paused too
 Network: one batch of visit events after load, then nothing (no polling while the API is up)
```

- **What stays the same:** the scene's own GPU cost is small (Vice without the neon and the blur measured 8%, like dark); the
  frosted blur over the moving scene is most of what's left while it moves, and it's the look.
- **Network while open:** after loading, one batch of visit events, then nothing (no polling, unless the API is unreachable:
  then `/api/site` every 30 s).
- **API log:** EF Core's line for every SQL command is off (`Microsoft.EntityFrameworkCore.Database.Command: Warning`); its
  warnings and errors still show.

## Link previews and search

What a link to the site looks like when it's pasted into LinkedIn, Slack, WhatsApp or iMessage, and what search engines
read. They don't run the app, so it's all in `index.html` (the same for every page) and `public/`:

- **The card:** a description, and the Open Graph and Twitter tags: the title, the description, and a 1200 × 630
  image (`public/og-image.jpg`): the Riviera art with "jechel.dev" in its own font, the name, and "Apps · Videos ·
  Experience". `node scripts/build_link_preview.mjs` draws it again (in Chromium, from the art and the font), after
  changing either or the words in the script.
- **Who the site is about:** `Person` structured data (JSON-LD): the name, the site, and the profiles that are also
  theirs (GitHub, LinkedIn, Instagram), so a search for the name can find the site.
- **`robots.txt`** lets every search engine in (not `/api/` or `/admin`) and points to **`sitemap.xml`**, the visitors'
  pages. A page switched off in Settings sends visitors home, so listing it does no harm.
- Checked end to end (`e2e/tests/previews.spec.ts`): the tags in the page as served, the image, robots.txt and the
  sitemap, each of its pages opening. After a change, a site like LinkedIn's Post Inspector shows the new card
  (they keep the old one for a while otherwise).

## Accessibility

The frontend's tests check the views with [axe](https://github.com/dequelabs/axe-core) against WCAG 2.1 A and AA
(`a11yViolations()` in `src/test/a11y.ts`, in 24 test files): the pages in every theme, the popups, and the admin's panels. YouTube's
player is left out: what's inside its frame is YouTube's. (The end-to-end `e2e/a11y.spec.ts`, which also covered WebKit and
Firefox, was removed in the Redux refactor.)

Things it caught, so they stay fixed: white on the bright blue was 3.6:1 (now `--accent-fill`, 5.4:1 and up), the light theme's grey
text was 3.8:1, the pagination over the Vice scene, popup headers counting as extra page banners, a card's link named only by its
title while it held the whole card (now the title is the link, stretched over the card), the title and licence buttons speaking
differently from what they show.

**Translation:** the site is in English (`<html lang="en">`), so browsers offer to translate it (Chrome on a Romanian phone does).
Names are kept as they are with `translate="no"`: the site's name (`Brand`), the Vice mark (`ViceMark`, which a translator read as
"ViceVice"), the name on About Me, and app titles on their tiles and popups (`MediaCard`'s `translateTitle`, `AppDialogHeader`'s
`headingIsName`). Everything else, video titles included, may be translated.

## Loading and error states, and the admin's preview switch

Every view that loads data shows **placeholders shaped like its content** while it waits (no spinners), and a **red box with what
failed and "Try again"** when it can't load. Both are shared: `components/Skeleton.tsx` (`Loading` wraps the shapes in a live
region that says "Loading apps…" and hides the shapes from screen readers; `SkeletonMediaGrid`, `SkeletonTable`, `SkeletonList`,
`SkeletonCard`, `SkeletonText`, `SkeletonChips`, `PageSkeleton`) and `components/ErrorState/ErrorState.tsx`. A new view uses them too.

**Preview switch** (admin bar: Normal / Loading / Error, `features/preview/`): shows the whole site in that state, to check every
view at a glance. It works in the one place every request goes through (`api.ts`'s axios adapter): in **Loading** content requests
(GETs) never answer until the page is left; in **Error** they fail with a 500, through the same path a real failure takes. Sign-in
(`/api/auth/*`) and anything that saves are never touched. Changing it reloads the page's content (and the terms); it's
remembered for the tab (`sessionStorage`) and only applies while signed in. **Development only:** it shows on the dev server
(`npm run dev`, `import.meta.env.DEV`); a production build has no switch and never applies a stored mode (`PREVIEW_AVAILABLE` in
`store/previewSlice.ts`).
