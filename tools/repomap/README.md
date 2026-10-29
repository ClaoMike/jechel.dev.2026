# repomap

An architecture map of a repository. Every route, component, API call, endpoint, service, entity, table and
column is a node, and edges show how they connect — inside a layer and across layers, e.g.
`HomePage → api.profile.getFirstName → GET /api/firstname → Profile.FirstName → profiles.first_name`.

The **Board** shows it as circuit boards you zoom through: the app → its tiers (frontend, backend, database) → a
tier's features → a feature's chips → one chip, whose pins are its functions, props, state and fields, wired to the
chips they call. Code that follows a layered architecture (Feature-Sliced Design, vertical slices) is drawn in its
layers, and you always see where you are in it. Claude summarizes every level, a review mode lights up what a change
touches and what depends on it, and architecture rules mark the wires that break them. It works on a phone too
(`npm run phone`).

A second tab shows the **git history** as a graph: every branch, merge, tag and pull request, the
uncommitted changes, and for any commit the files it changed — linked both ways with the Board. Served
from your checkout, it is also a git client (commit, push, pull, fetch, branches, merges, stashes…),
the code panel is an editor that saves as you type, a file explorer creates, renames and deletes
files — the map is rebuilt and the Board opens on them — and an AI assistant (Claude) works in the
repository from a chat docked under everything, like Claude Code.

It runs in the browser (a static site — deployable anywhere) and is self-contained: nothing here imports
the app it maps.

```
tools/repomap/
  src/cli.ts                 CLI: build · history · serve · validate · diff · build-viewer
  src/core/                  config, file rules, plugin runner, cache, merge, git history, serve
  src/shared/                graph types, the Board's model and rules, route matching (used by CLI, plugins and viewer)
  plugins/
    extract-dotnet/          C# (Roslyn): endpoints, services, DI, entities, tests…  + EF Core snapshot/migrations
    extract-ts/              TypeScript/React (ts-morph): routes, pages, components, hooks, API client, Redux, tests
    extract-files/           any file no other plugin claimed (config, CI, docs, scripts)
    link-http/               calls/mocks/requests/links → endpoints and routes
    link-contracts/          frontend types ↔ backend DTOs
  presets/                   stack presets: vocabulary, detection rules, plugins
  schema/                    JSON Schemas of graph.json and of plugin output
  viewer/                    Vite + React web app (viewer/src/board: the Board, viewer/src/git: the history tab)
  samples/                   demo/stress graph generator, demo git history generator
  repomap.config.json        config for this repository
```

## Quick start

Requirements: Node 22.18+ (for the .NET plugin: the .NET SDK; it is skipped with a warning without it).

```bash
cd tools/repomap
npm install
npm start          # build the graph, open the viewer, rebuild on every change (live reload)
```

Other commands:

| Command | What it does |
| --- | --- |
| `npm run map` | Build `.out/graph.json` and `.out/git.json` (`-- --no-cache` to re-run every plugin) |
| `npm run history` | Only re-read the git history (`.out/git.json`) |
| `npm run view` | Serve the viewer + the last graph on http://127.0.0.1:5199 (`-- --read-only`: no editing, no git commands) |
| `npm start` | `map` + `view` + watch the repo and live-reload the browser |
| `npm run dev` | Viewer development (Vite, port 5198), serving the last built graph (no assistant: use `npm start`) |
| `npm run build:viewer` | Static site in `viewer/dist` (deploy anywhere) |
| `npm run phone` | `start` on your network, read-only, behind a token: open the printed link (or scan the QR code) on a phone on the same Wi-Fi |
| `npm run summarize` | AI: place unplaced chips in features, then summarize chips → features → tiers → app, only what changed (`-- --limit 50`) |
| `npm run check` | Build, then list the architecture rules' violations (exit 1 on an `error` rule) |
| `npm run review` | Where the uncommitted changes land, per feature (`-- <base> <head>`, `-- --brief` for the AI briefing) |
| `npm run demo` | Regenerate the bundled demo graph and demo history |
| `npm run diff` | Structural diff of the last two builds |
| `npm test` · `npm run test:e2e` · `npm run typecheck` | Unit + whole-repo pipeline tests · browser tests · types |

The CLI is `node src/cli.ts <command>` (`node src/cli.ts help` lists the options).

## The board

The Board tab (first tab) draws the map as nested circuit boards. Zoom with the wheel, a trackpad or
two fingers; zoom far into a chip and it opens (the level below), far out and you go up a level. A tap
selects a chip (the panel describes it), a second tap or **Open** goes in, Esc or the trail at the top
goes back.

| Level | Chips | Wires |
| --- | --- | --- |
| App | the repository, its tiers | — |
| Tiers | frontend, backend, database, infra (`board.tiers` groups layers) | every connection between them, by type |
| A tier | its features (folder, then config, AI or neighbours; the rest is *Shared*) | between features; connectors lead to the other tiers |
| A feature | its chips (top-level nodes); a big feature shows its folders first | pin to pin: a wire leaves from the function its code is in |
| A chip | one chip with every member (`attrs.members`: functions, props, state, values, fields, methods) | to each chip it uses or is used by |

Wire thickness is the number of connections; red wires break a rule. Tap a wire for the edges it
carries (each opens its code at the line). **Read the code** opens the chip (or a member) in the code
panel; **History** follows its file in the git history. The panel's search finds any chip.

**Where you are.** Under the trail of levels, a second line says where the level is in its tier's architecture
(`board.architectures`): *Feature-Sliced Design › Pages › Apps › ui › AppTile › AppTile.tsx* — the architecture, the
layer, the slice, then the chip's folders and file. Its steps go to the tier's board (the layers) and to the slice.

**Features.** Each node gets one: config `board.featureOverrides` (globs or ids), then its folder
(`features/<x>`, `Features/<X>`), then the AI's placement (`repomap.ai.json`), then its parent, then the
feature most of its neighbours share (≥ 60 %); the rest is `shared`. `board.featureLabels` names them,
`board.featureAliases` merges them; `board.hubFeatures` lists features everything uses (an API service), which
don't pull their neighbours in.

**Architectures** (`board.architectures`). Code that follows a layered architecture — Feature-Sliced Design, vertical
slices — is shown as one: the folders under its `root` are its `layers`, in dependency order, and a layer's subfolders
can be its features (`"parts": "slices"`, which don't use each other unless the layer is `open`, or `"segments"`, which
may); otherwise the whole layer is one feature. A node there gets its slice as its feature (`fsd/pages/about`,
`vsa/Features/Apps`; tests in a folder named like a slice join it), and its tier's board shows the layers as labelled
columns in their order, with what's outside them last. `crossImports` names the folder through which a slice may still
use another of its layer (FSD's `@x`). This repository's config has both: the frontend in Feature-Sliced Design, the
backend in vertical slices (every endpoint an `IEndpoint` class: the .NET plugin follows `api.MapEndpoints()` into each
slice's `Map`, so the routes keep their prefix, and shows the classes as *Endpoint slice* chips).

**AI summaries** (`npm run summarize`, or the AI panel when served with `npm start`). Claude first
places the chips nothing placed (through Claude Code or the API, as the assistant's settings say), then summarizes each chip from its code, each feature (per tier) from
its chips, each tier from its features and the app from its tiers. Results live in `repomap.ai.json`
(commit it) with a hash of what was read: a run only redoes what changed, and a summary whose code moved
on is marked *the code changed since*. Models: `ai.summaryModel` (default `claude-haiku-5-5`) and
`ai.reviewModel` (`claude-opus-5-5`); the key is the assistant's.

**Review mode** (the Review panel). Pick the uncommitted changes, a branch (against the default branch)
or a commit: changed chips turn orange, what depends on them (two steps) yellow, and the tests that
cover them are listed. **Brief me** asks Claude for a briefing — what it does, where it lands, ripple
effects, what to check, tests, questions — from the diff and the map. Without the repository (a
`--graph` file, a static site) a commit's files from git.json are used instead (whole files).

**Rules** (`rules` in the config, checked on every build, listed by `npm run check`). A rule selects
edges (`from` / `to`: tiers, layers, features, kinds, roles; `edgeTypes`) and either denies them
(`deny`) or keeps them inside one feature (`sameFeature`, with `allowFeatures` reachable from anywhere); a selector's
`notFeatures` matches every feature but those. A `layered` rule names an architecture and keeps its order: an edge to a
layer before its own, or between two slices of a layer whose slices don't use each other, breaks it (type references
count, links to a route don't).
The AI can suggest rules the code already mostly follows (Rules panel, `node src/cli.ts suggest-rules`).

**The assistant** can point at the board: its `show_on_board` tool opens the feature and lights the
chips up.

**On a phone.** `npm run phone` serves on your network (read-only: no editing, git or AI) and prints a
link with a one-time token (also as a QR code); the phone keeps it in a cookie. Anyone on the network
without the link gets a 401. `--no-token` turns that off.

## Code and files

- **Read and edit the code**: *Read the code* on a chip (or a member, a wire's connection). The file opens in an
  editor coloured like VS Code (Dark+/Light+), scrolled to the node, with its declaration highlighted; ⌘F searches
  the file. Source is served by `repomap serve` from your checkout — only files that belong to a node of the graph,
  never anything outside the repository — so a static deployment of the viewer shows "not available" instead.
- **Autosave**: when `repomap serve` maps your own repository on localhost (`npm start`), what you type is
  saved a moment after you stop, on ⌘S, and when you close the panel or leave the page; the status bar
  says *Unsaved changes* → *Saving…* → *Saved*. Undo/redo, Tab indentation and the file's own line
  endings (LF/CRLF) are kept. A file changed on disk meanwhile (a checkout, a pull, another editor) is
  reloaded when you haven't typed in it; when you have, nothing is overwritten: you choose *Keep mine* or
  *Load the disk version*. On touch screens editing starts after tapping the pencil (so reading doesn't pop
  up the keyboard). Only existing text files of the graph can be written. With `--watch` each save rebuilds
  the map; the panel stays open on the file even when the node you opened it from is renamed.
- **Files**: the Board panel's *Files* tab is an explorer of the repository (every file git lists; ignored
  ones like `.env` are left out), each file with the colour of its layer — a dashed dot means "not in the map
  (yet)". Click a file to show it on the Board, double-click to open it. Served from your checkout (`npm start`),
  the ⋯ menus (*New file here…*, *Rename or move…*, *Delete…*) create, rename, move and delete files and whole
  folders. The new-file dialog shows where the path lands — *Frontend · Production*, or "not in the map" when the
  config excludes it — from the same rules the build uses, and starts the file from a template the extractors
  recognise (a React component or hook, a module, a test, a C# class in its project's namespace…). The file opens in
  the editor; the map is rebuilt and the Board opens on the new node once it is there. Paths must stay inside the
  repository and out of `.git`, never through a symlink out; nothing is overwritten, and a folder holding another
  repository is never deleted. Deletions are uncommitted changes: the History tab can discard them.

## The AI assistant

Served from your checkout (`npm start`), a chat docked at the bottom of every view — the map, the
history, the code editor — lets you ask Claude about the repository and have it change things.
**⌘J** (Ctrl+J) shows and hides it; drag its top edge to resize it.

- **Claude Code instead of a key**: pick the provider *Claude Code (your subscription)* and repomap runs
  the `claude` CLI installed on this machine (`claude -p`, signed in as you are in the terminal; found
  on the server's PATH, or `REPOMAP_CLAUDE`). The chat then is Claude Code itself working in the
  repository with its own tools (streamed into the dock: text, each step, edited files; chats continue
  their Claude Code session), and the Board's summaries, briefings and rule suggestions go through it too
  (one-shot prompts: no tools, no session, only your user settings). It can't stop to ask: *Ask* lets it
  only read (and look in the map with `node src/cli.ts map-query`), *Accept edits* adds file edits,
  *Auto* adds shell commands — on top of your own Claude Code permissions for the repository. It points
  at the board by ending an answer with `show-on-board: <names>`.
- **Settings** (the gear in the top bar): provider (Claude Code, or the Anthropic API with a key), the API key, the
  model (listed live from the API), the effort, and what Claude may do without asking. The key is kept
  by `repomap serve` in `~/.config/repomap/settings.json` (`REPOMAP_SETTINGS` moves it), readable only by
  you; the page never sees it again (only `sk-ant-…abcd`), and it is sent only to Anthropic. Without a
  saved key, the server's `ANTHROPIC_API_KEY` is used.
- **Context**: what you are looking at is attached to each message as chips — the selected node (with
  what it uses and what uses it), the open file and your selection in the editor (**✦** in the code
  panel's header asks about it), the selected commit, or the uncommitted changes. Click a chip to leave it
  out. Claude can always look further itself.
- **What Claude can do**, like Claude Code: read files and folders, search the code (`git grep`), find
  files, query the architecture map (what calls what across layers), read git (status, diffs, log),
  edit and create files (Claude's text editor tool), run shell commands in a persistent shell in the
  repository (no input, 2-minute limit, output capped), run the History tab's git commands, delete and
  rename files, and search / read the web for current documentation.
- **Permissions** (in the chat's header too): *Ask before changes* (default — reads run, every edit, git
  and shell command shows what it will do, an edit with its diff, and waits for **Allow** / **Allow …
  in this chat** / **Deny**), *Accept edits* (file changes run by themselves), *Auto* (everything runs;
  you still see every step). **Stop** ends the work at any point; the chat can always continue.
- **Every step is visible**: reads, searches, commands with their output, edits with their diffs. The map
  rebuilds after changes and the open editor reloads a file Claude changed (with unsaved edits of your
  own, nothing is overwritten — you choose).
- **Chats** are saved in `.out/ai/conversations/` (git ignores `.out`); the chat menu reopens them.
- **Boundaries**: paths stay inside the repository and out of `.git`, never through symlinks; files git
  ignores (`.env`, build output) are neither read nor written; one message runs at most 80 steps.
- **Under the hood**: a streaming agent loop on the server (`src/core/ai/`) with the Anthropic SDK:
  adaptive thinking (its summary is shown), the chosen effort, prompt caching of the system prompt and
  the conversation, an append-only history, and `fallbacks: "default"` on the models that support it (a
  request declined by the safety classifiers is retried on the recommended model, and the chat says so).
- **Costs**: requests are billed to your API key at the model's rates; the chat shows nothing until you
  send a message, and reading the map or files costs nothing.

## The git history tab

- **The graph**: every commit of every branch, newest first. Each coloured line is a line of work; forks and
  merges bend between lines; the default branch stays on the far left. ● commit · ○ merge · a ring marks
  HEAD · a dashed circle on top is your uncommitted changes (staged, modified, untracked).
- **Badges**: local branches (a cloud when the remote has the same branch at the same commit), remote-only
  branches (dashed), tags, pull requests (open, draft, merged, closed), and the name of merged branches that
  no longer exist (italic, read from the merge message).
- **Pull requests**: merged ones are recognised from merge and squash messages (GitHub, GitLab, Bitbucket,
  Azure DevOps). When the remote is on github.com, open and closed ones come from GitHub's REST API — a
  read-only request, cached for 10 minutes, anonymous for public repositories or with `GITHUB_TOKEN` /
  `GH_TOKEN` / the `gh` CLI's login; it never fails the build (`"history": { "github": "off" }` turns it off).
- **A commit** (click it): message, author and committer, co-authors, parents and children (links), the pull
  request, the branches and tags that contain it, and the files it changed with +/− counts. The clock button
  on a file follows that file through the history; the layers button shows it in the architecture map. In
  the map, *History* on a node does the reverse.
- **Filters** (left): untick a branch, remote branch or tag to hide the commits only it reaches; ⌥-click (or
  the target button) shows one alone. **Search** matches messages, authors, files, branches, hash prefixes and
  `#12` — non-matching commits fade and `Enter` / `n` / `N` step through the matches.
- **Keys**: `↑` `↓` (`k` `j`) walk the commits · `Home` `End` · `H` HEAD · `/` search · `[` panel · `Esc`.
- **Read-only** when it isn't your checkout (a static site, a dropped git.json, the demo, `--graph`,
  `--read-only`, or a non-localhost `--host`); remote branches are as of your last fetch. With `npm start`,
  commits, checkouts, fetches and staging made anywhere refresh the tab live.

### Git commands (served from your checkout)

A bar above the graph works like GitHub Desktop:

- **Current branch** ▾ — switch to a local branch, or check out a remote one as a tracking branch; *New
  branch…*, *Merge into…*, *Squash and merge into…*, *Rebase…*, *Rename…*.
- **The sync button** does what's due: *Publish branch* (push -u), *Pull origin ↓n*, *Push origin ↑n*, else
  *Fetch origin*. The ⋯ menu has each of them, *Force push…* (with a lease), stashing, *Create pull
  request* (opens the host's compare page) and *View branch on the web*.
- **Uncommitted changes** (the button, or the dashed row) open the changes panel: every changed file with a
  checkbox (all ticked; only ticked files are committed, whatever is staged), summary + description,
  *Amend last commit*, discard (per file or ticked), stash, and the stashes to restore or drop. The pencil
  opens a file in the editor.
- **Merge conflicts**: a banner says a merge (rebase, cherry-pick, revert) is in progress; conflicted files
  are red in the changes panel — edit them in the code panel, then *Commit merge* / *Continue* (refused while
  conflict markers remain), or *Abort*.
- **A commit** (details panel → *Actions*): *New branch here…*, *Tag…* (annotated with a message),
  *Check out* (detached), *Cherry-pick onto…*, *Revert*, *Undo commit* (HEAD: its changes go back to your
  files), *Reset … to here…* (soft / mixed / hard).
- **Branches panel**: `+` makes a branch; the ⋯ on a branch, remote branch or tag switches, merges,
  squash-merges, rebases, renames, deletes (optionally on the remote too), pushes or deletes tags.
- Failures show git's reason (e.g. *The remote has commits you don't have yet: pull them first*) with its full
  output on demand. Commands that lose work ask first.

**Safety.** git runs without a shell and never prompts (no terminal, no editor; credentials come from your
credential helper or ssh agent), one command at a time. Every name must pass `git check-ref-format`,
commits must be hashes, and only files git reports as changed can be committed or discarded. The writing
endpoints (`PUT /source`, `GET /api/git/state`, `POST /api/git`, `GET`/`POST /api/files`, `/api/ai/…`, see `src/core/api.ts`) answer only
requests from the viewer itself: a localhost `Host` (no DNS rebinding), the same `Origin`, and an
`X-Repomap-Request` header that other sites can't send without a CORS preflight, which is never granted.

## How it works

```
git ls-files ─► classify (layer + role per file, from config rules)
            ─► extractors (separate processes, cached)  ─► nodes, edges, facts, claims
            ─► file refs ─► linkers (see the merged graph + facts) ─► more edges, unresolved links
            ─► merge + validate ─► the Board (features, rules, summaries) ─► .out/graph.json ─► viewer
```

Everything stack-specific is a **plugin**. A plugin is any executable: it reads a JSON request on stdin
and prints JSON on stdout (logs go to stderr). The C# extractor is a .NET console app; the others are
Node scripts. The viewer reads only `graph.json`.

**Request** (stdin): `{ protocol, repoRoot, plugin: { id, kind, options }, files: [{ path, layer, role, roleReason }], claimed, vocabulary, graph? }`
— `files` is already filtered by the plugin's `include`/`layers`; linkers also get `graph: { nodes, edges, facts }`.

**Output** (stdout, validated against `schema/plugin-output.schema.json`):

```jsonc
{
  "protocol": 1,
  "nodes": [{ "id": "backend:class:Shop.OrderService", "label": "OrderService", "kind": "service", "file": "…", "line": 12 }],
  "edges": [{ "from": "…", "to": "…", "type": "injects" }],   // source defaults to "static", confidence to 1
  "facts": [{ "type": "http", "from": "…", "edgeType": "tests", "method": "GET", "url": "/api/orders" }],
  "claims": ["src/OrderService.cs"],        // files fully represented (the generic file plugin skips them)
  "unresolved": [], "diagnostics": []
}
```

Nodes may leave out `layer`/`role`; the builder fills them from the node's file. **Facts** are things a plugin
saw but can't resolve alone (an HTTP call, a navigation, a file reference); linkers turn them into edges.

**IDs** are stable across runs: `layer:symbolType:qualifiedName`, e.g. `backend:class:Portfolio.Api.Data.Profile`,
`backend:route:GET /api/auth/me`, `frontend:symbol:frontend/src/pages/HomePage.tsx#HomePage`,
`database:column:public.profiles.first_name`. The symbol type (class, symbol, route, file…) is used rather
than the inferred kind, so re-classifying something doesn't change its id.

Every node has a **kind**, a **layer** and a **role**; every edge has a **type**, a **source**
(`static` | `llm` | `manual`) and a **confidence** (0–1). LLM or heuristic edges are drawn fainter, and a
confidence slider filters them.

### What the plugins detect (React + ASP.NET Core + EF Core + PostgreSQL)

- **.NET (Roslyn, semantic model via MSBuildWorkspace; falls back to an ad-hoc compilation)**: minimal-API
  endpoints with full routes (`MapGroup` prefixes followed through extension methods), `.WithName`,
  `.RequireAuthorization`; controllers with attribute routing; middleware routes (`Request.Path == …`) and
  OAuth callback paths; services, options, DTOs, setup classes, DbContexts, entities and their properties;
  DI (`injects` from constructors and handler parameters, `registers`, `resolves` for `GetRequiredService<T>`);
  `queries`/`reads`/`writes` on entities; `returns`; appsettings keys that configure a type; test classes
  (xUnit/NUnit/MSTest), their test methods, what they test, HTTP requests made by integration tests;
  redirects to frontend pages.
- **EF Core (syntax only — no build, no database)**: tables, columns (types, nullability, keys, identity),
  foreign keys, indexes, seed rows and schema from the model snapshot; entity → table and property → column
  mapping; which tables/columns each migration changed.
- **TypeScript/React (ts-morph)**: React Router routes (JSX and object routes), pages, components, providers,
  hooks, contexts, types; any HTTP client: functions that call `fetch`/axios/ky with a parameter as the URL are
  found automatically, as are wrappers of wrappers, so `api.auth.me()` → `GET /api/auth/me`; Redux Toolkit:
  slices and their actions, async thunks, listener middleware, and RTK Query APIs whose generated hooks
  (`export const { useGetXQuery } = xApi`) scan their endpoint, so `useGetXQuery` → `api.x.get` → the endpoint;
  `a.b.c()` on a library member (`slice.actions.x`, `baseApi.util…`) counts as a use of `a`; links,
  `<Navigate>` and `navigate()`; test files with their test names, MSW handlers (`mocks`), Playwright
  `page.goto`/`request.get`/`page.route`; `X.test.tsx` tests `X.tsx`.
- **Files**: config, CI workflows, docs, scripts; `.csproj` project references; requests in `.http` files and
  localhost URLs in scripts become links to endpoints.

## Configuration

`repomap.config.json` (JSON with comments) extends a stack preset:

```jsonc
{
  "extends": "./presets/react-aspnet-efcore-postgres.json",
  "name": "jechel.dev.2026",
  "repoRoot": "../..",            // the repository to map (relative to this file)
  "output": ".out/graph.json",
  "exclude": ["tools/repomap/**"]
}
```

The preset defines everything the viewer shows — nothing is hard-coded:

- `layers` (in order; in a child config, `"before": "<id>"` inserts a new layer before that one), `roles` (a tree
  via `parent`), `kinds` and `edgeTypes` (a label, a colour and a description each).
- `layerRules` (globs, or `marker`: every file under a folder containing e.g. a `package.json` with React) and
  `roleRules` (ordered globs, first match wins; each node records *why* it got its role).
- `plugins`: `command`, optional `build` step, `include`/`exclude` globs, `layers`, `requires`, `options`.
  In a child config, `{ "id": "dotnet", "enabled": false }` removes a plugin; arrays with ids merge by id.

Values that plugins produce but the config doesn't declare still appear in the viewer (with generated
colours), so new categories show up automatically.

The history tab has its own (optional) section; these are the defaults:

```jsonc
"history": {
  "enabled": true,
  "maxCommits": 2000,          // newest commits across all branches
  "maxFilesPerCommit": 150,    // files listed per commit (totals always count all of them)
  "github": "auto",            // "off": never ask GitHub for pull requests
  "githubCacheMinutes": 10,
  "maxPullRequests": 200
}
```

## Output, cache and history

- `.out/graph.json` — one node/edge per line (diff-friendly). Schema: `schema/graph.schema.json`.
- `.out/git.json` — the history tab. Schema: `schema/git.schema.json` (types: `src/shared/git-types.ts`).
  Rewritten only when something in it changed; commits are re-read only when a ref moved.
  `.out/cache/_github-pulls.json` holds the last GitHub answer. `npm run validate -- .out/git.json` checks it.
- `.out/cache/` — one entry per extractor, keyed by plugin source + options + the exact files it read (paths
  and contents). Unchanged plugins are skipped; a rebuild after editing one file takes about a second for
  the frontend, ~4 s when C# changed. Linkers always run.
- `.out/history/` — the last 30 graphs that differ; `npm run diff` compares the last two. `meta.changes` in
  graph.json records what was added/removed since the previous build (the viewer says so when it reloads).

## Putting it on the web

`npm run build:viewer` produces a static site in `viewer/dist` (relative paths — works from any folder of
any static host). The viewer loads, in order: `?graph=<url>`, a `graph.json` next to `index.html`, or the
bundled demo. The history comes from `?git=<url>`, else from beside the graph (`name.graph.json` →
`name.git.json`, or `git.json` in the same folder). Anyone can also drop or open a `graph.json` or
`git.json` in the page. Build with `--public` to leave your local absolute path out of graph.json (it is only
used for "Open in VS Code" links) and your uncommitted changes out of git.json.

## Tests

`npm run typecheck`, `npm test` and `npm run test:e2e` keep the tool in its current state:

- **Unit and integration** (`test/`, Node's test runner): routes, config (colours included), file rules, merge; the
  Board (features, architectures and their layers, rules, levels, lanes, the architecture trail, layout, AI); the
  viewer's graph index, search and code languages; git output parsing, pull request detection, GitHub enrichment (stubbed —
  tests never touch the network) and a real temporary repository; the history tab's lanes, ref filters and
  search; the server's routes, the source-file guard (traversal, symlinks, size, binaries) and live-reload
  events; builds with misbehaving plugins (crashing, garbage, schema violations, timeouts, missing tools),
  caching, `--public` and the CLI's `validate`/`diff`. Editing: autosave (debounce, saves during saves,
  retries, conflicts; mocked timers), saving through the source guard with ETags, and every request the
  writing API must refuse (other origins, other hosts, no header, read-only servers). Git commands against
  real temporary repositories with a bare remote and a teammate's clone: partial commits, renames,
  deletions, amend, undo, discard, push/publish/force push, fetch/pull of diverged work, branches, tracking
  checkouts, merges through a conflict, squash, rebase, cherry-pick, revert, reset, tags, stashes, and
  refused input (bad names, option injection, unchanged files). File operations: create/rename/move/delete
  of files and folders, and every path refused (outside, `.git`, symlinks out, overwrites, nested
  repositories); templates; where the real config puts a new path. The assistant, against a fake
  Anthropic API (`test/fake-anthropic.ts`, the real streaming format, no network): the request (model,
  thinking, effort, caching, fallbacks, tools, context), the tool loop with approvals and permission
  modes, everything it must not touch, refusals, fallback echoing, stopping, API errors, its shell, its
  settings (key stored owner-only, never returned) and its HTTP routes behind the guard. Plus a run of every plugin on this repository that
  checks the facts that matter (every endpoint of the README's API table, the HomePage →
  `profiles.first_name` chain, DI, migrations, test tagging, no unresolved links, a valid git.json).
- **Browser** (`e2e/`, Playwright against the demo graph and history), in Chromium and WebKit (Firefox in CI or
  with `ALL_BROWSERS=1`) and on a phone (Pixel 7): the Board (levels, zoom and pinch, the trail, search,
  review, rules, the Files tab, code, help, opening and dropping files, `?graph=`, live reload, no WebGL anywhere),
  the history tab (graph, details, keyboard, search, branch filters, pull requests, deep links, Board ↔ history),
  the phone layout (sheets, no sideways scrolling) and WCAG 2.1 AA checks (axe) of both
  tabs in both themes. Editing and git commands run against a real repository per test (`e2e/repo-fixture.ts`:
  a bare origin, a clone served by repomap, a teammate's clone): typing and autosave, ⌘S, closing, undo,
  files changed on disk, CRLF, read-only servers; committing ticked files, publishing and pushing, fetching
  and pulling, a merge conflict resolved in the editor, abort, switching and deleting branches, tags,
  revert, undo, cherry-pick, discard, stash, failures, keyboard menus, axe on all of it, and on a phone.
  With `realMap` the fixture builds the map with the real pipeline and rebuilds it after every change: a
  component created from the explorer opens the Board on it, renames and deletions from the explorer update the
  Board, a deleted folder comes back through the History tab. With `withAI` it talks to
  the fake API: settings and the key, context chips, streamed Markdown answers, approving an edit (the
  open editor shows it), declining a command, stopping, chats across tabs, and axe on the dock.
  Every test fails on page errors.
- **CI**: the `repomap` job in `.github/workflows/ci.yml` runs all of the above on every push and pull request.

## Limitations and next steps

- Routes built at runtime (loops, reflection) can't be seen statically — except endpoint discovery of the
  vertical-slice kind (`api.MapEndpoints()` mapping every `IEndpoint`), which the .NET plugin follows; an
  OpenAPI-based route source would cover the rest.
- The database layer comes from the EF Core snapshot. A PostgreSQL catalog extractor would support non-EF
  projects and detect drift.
- The AI summarizes chips and places unplaced ones in features (the Board); not yet: classifying files of
  unknown stacks, or suggesting edges marked `source: "llm"` (the schema and viewer support them).
- The pipeline test on this repository has 4 failures that predate the Board: the app gained calls the
  extractors don't resolve (dynamic URLs in tests) and a test whose `tests` edge is lost.
- Standalone packaging (an `npx` CLI + a published .NET tool + `repomap init`) comes when this moves out of the repo.
