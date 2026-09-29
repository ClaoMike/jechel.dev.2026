# repomap

An interactive 3D architecture map of a repository. Frontend, backend and database are stacked planes;
every route, component, API call, endpoint, service, entity, table and column is a node; edges show how
they connect — inside a layer and across layers. Click anything to trace its full chain, e.g.
`HomePage → api.profile.getFirstName → GET /api/firstname → Profile.FirstName → profiles.first_name`.

It runs in the browser (a static site — deployable anywhere) and is self-contained: nothing here imports
the app it maps.

```
tools/repomap/
  src/cli.ts                 CLI: build · serve · validate · diff · build-viewer
  src/core/                  config, file rules, plugin runner, cache, merge, serve
  src/shared/                graph types, layout, route matching (used by CLI, plugins and viewer)
  plugins/
    extract-dotnet/          C# (Roslyn): endpoints, services, DI, entities, tests…  + EF Core snapshot/migrations
    extract-ts/              TypeScript/React (ts-morph): routes, pages, components, hooks, API client, tests
    extract-files/           any file no other plugin claimed (config, CI, docs, scripts)
    link-http/               calls/mocks/requests/links → endpoints and routes
    link-contracts/          frontend types ↔ backend DTOs
  presets/                   stack presets: vocabulary, detection rules, filter presets, plugins
  schema/                    JSON Schemas of graph.json and of plugin output
  viewer/                    Vite + React + three.js (react-three-fiber) web app
  samples/synthetic.ts       demo/stress graph generator
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
| `npm run map` | Build `.out/graph.json` (`-- --relayout` to lay out from scratch, `-- --no-cache` to re-run every plugin) |
| `npm run view` | Serve the viewer + the last graph on http://127.0.0.1:5199 |
| `npm start` | `map` + `view` + watch the repo and live-reload the browser |
| `npm run dev` | Viewer development (Vite, port 5198), serving the last built graph |
| `npm run build:viewer` | Static site in `viewer/dist` (deploy anywhere) |
| `npm run demo` | Regenerate the bundled demo graph |
| `npm run diff` | Structural diff of the last two builds |
| `npm test` · `npm run test:e2e` · `npm run typecheck` | Unit + whole-repo pipeline tests · browser tests · types |

The CLI is `node src/cli.ts <command>` (`node src/cli.ts help` lists the options).

## Reading the map

- **Planes are layers** (from config): Frontend, Backend, Database, Infra & tooling. Tests, config, migrations
  and generated code of a layer float on thin sub-planes just **below** it, right under what they test or
  configure — so hiding them never leaves holes.
- **Shapes and colours are kinds** (◆ routes/endpoints, ● pages/components, ▲ hooks/API calls, ■ services,
  classes, cylinders for tables, rings for tests…). The side menu doubles as the legend.
- **Edges between planes** are S-curves: when you look from the side (`S`), a chain reads top to bottom.
  Translucent nodes are generated code; dashed lines are rolled-up edges of hidden children; red stubs are
  calls that point at nothing (e.g. a frontend call to a route that doesn't exist).
- **Trace**: click a node. Everything it depends on (↓ downstream) and everything that depends on it
  (↑ upstream) lights up, with particles flowing along the dependency direction; the details panel lists the
  chain per layer. Tests, migrations and config appear one hop around the selection (tick *tests* to include
  test code).
- **Filters** (left): every layer, kind, role and edge type is shown, dimmed (half-moon button) or hidden.
  ⌥/Alt-click a row = solo. Presets: *Everything*, *Architecture* (production only), *Tests*, *Data model*,
  *API surface*. Nodes never move when you filter. The view is kept in the URL, so links are shareable.
- **Keys**: `/` or `⌘K` search · `F` fit · `S` side view · `1`–`9` top view of a layer · `R` reset ·
  `C` colour by kind/layer/role/feature · `L` labels · `[` filters · `?` help · `Esc` clear.
- **Changes**: nodes added since the previous build glow green (*Display → Highlight changes*).

## How it works

```
git ls-files ─► classify (layer + role per file, from config rules)
            ─► extractors (separate processes, cached)  ─► nodes, edges, facts, claims
            ─► file refs ─► linkers (see the merged graph + facts) ─► more edges, unresolved links
            ─► merge + validate ─► layered layout (warm-started) ─► .out/graph.json ─► viewer
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
  found automatically, as are wrappers of wrappers, so `api.auth.me()` → `GET /api/auth/me`; links,
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

- `layers` (top to bottom), `roles` (tree via `parent`; `planeOffset` = sub-plane depth, `style: "ghost"`),
  `kinds` (colour, `shape`, size, label priority), `edgeTypes` (`flow` = followed by traces, `context` =
  shown one hop around the selection), `presets` (filters; `"*"` wildcards; parent roles cover children).
- `layerRules` (globs, or `marker`: every file under a folder containing e.g. a `package.json` with React) and
  `roleRules` (ordered globs, first match wins; each node records *why* it got its role).
- `plugins`: `command`, optional `build` step, `include`/`exclude` globs, `layers`, `requires`, `options`.
  In a child config, `{ "id": "dotnet", "enabled": false }` removes a plugin; arrays with ids merge by id.

Values that plugins produce but the config doesn't declare still appear in the viewer (with generated
colours), so new categories show up automatically.

## Output, cache and history

- `.out/graph.json` — one node/edge per line (diff-friendly). Schema: `schema/graph.schema.json`.
- `.out/cache/` — one entry per extractor, keyed by plugin source + options + the exact files it read (paths
  and contents). Unchanged plugins are skipped; a rebuild after editing one file takes about a second for
  the frontend, ~4 s when C# changed. Linkers always run.
- `.out/history/` — the last 30 graphs that differ; `npm run diff` compares the last two. `meta.changes` in
  graph.json records what was added/removed since the previous build (the viewer highlights it).
- Layout positions are baked into graph.json and warm-started from the previous build, so the picture stays
  put as the code evolves. `--relayout` starts fresh.

## Putting it on the web

`npm run build:viewer` produces a static site in `viewer/dist` (relative paths — works from any folder of
any static host). The viewer loads, in order: `?graph=<url>`, a `graph.json` next to `index.html`, or the
bundled demo. Anyone can also drop or open a `graph.json` in the page. Build with `--public` to leave your
local absolute path out of graph.json (it is only used for "Open in VS Code" links).

## Tests

- `npm test` — unit tests (routes, layout, config, file rules, merge, the viewer's filters/trace/search on a
  hand-written graph) and an end-to-end run of every plugin on this repository that checks the facts that
  matter (every endpoint of the README's API table, the HomePage → `profiles.first_name` chain, DI, migrations,
  test tagging, no unresolved links).
- `npm run test:e2e` — Playwright against the demo graph: renders, presets, dim/hide, search + trace, URL state,
  help; fails on any page error.

## Limitations and next steps

- Routes built at runtime (loops, reflection, assembly scanning) can't be seen statically; an OpenAPI-based
  route source would cover them.
- The database layer comes from the EF Core snapshot. A PostgreSQL catalog extractor would support non-EF
  projects and detect drift.
- Not yet built: an optional LLM enrichment plugin (descriptions for undocumented nodes, classifying files of
  unknown stacks, suggested edges marked `source: "llm"`) — the schema and viewer already support it.
- Standalone packaging (an `npx` CLI + a published .NET tool + `repomap init`) comes when this moves out of the repo.
