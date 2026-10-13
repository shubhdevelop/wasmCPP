# Local C++ Lab

A production-oriented, browser-only C++ workspace. Clang runs as WebAssembly inside a dedicated Web Worker, and the generated WASI module executes in the same isolated worker. Source code and project files never need a compilation backend.

## Run it

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. Use `npm run build` to create the static production bundle in `dist/`.

```bash
npm test       # unit tests
npm run check  # tests + typecheck + production build
```

## Included in the prototype

- C++11, C++14, C++17, C++20, and C++23 compilation modes with `browsercc`
- Debug, release, fast, and size optimization profiles
- Browser-side WASI execution with stdin, stdout, stderr, and program arguments
- A project file explorer for C++ sources, headers, and text/data files
- A writable in-memory `/workspace` mount available through standard C++ file APIs
- Runtime-created and modified files synchronized back into the explorer
- CodeMirror editor with full-project local draft persistence
- Compiler diagnostics and compile/run timings
- Example programs and current-file download
- Web Worker isolation with separate five-minute compiler-preparation and 30-second program-execution cutoffs
- File-count and byte limits at the UI and worker trust boundaries
- Versioned, validated local-project storage with safe fallback defaults
- Responsive desktop and mobile layouts

## Architecture

- `src/main.ts` owns UI state and coordinates editor, project, and runtime modules.
- `src/lib/project.ts` is the project-domain boundary: path normalization, size limits, entry-point selection, and storage migration.
- `src/runtime-client.ts` owns the compiler worker lifecycle, cancellation, crash recovery, and execution timeout.
- `src/compiler.worker.ts` is the untrusted execution boundary. It validates inputs, compiles, mounts `/workspace`, runs WASI, and validates the returned filesystem.
- `src/types.ts` defines the messages crossing the worker boundary.

Keep new language/toolchain behavior inside the worker and new project rules inside `src/lib/project.ts`. This lets the UI evolve without coupling it to compiler internals.

## Deploy to Vercel

Import the repository in Vercel and use the detected Vite settings, or run `vercel` from the project directory. `vercel.json` supplies immutable caching for hashed assets and production security headers. The app has no server functions, database, or secrets; hosting is static.

The production bundle intentionally removes browsercc's unused precompiled-header artifact. The remaining first-load toolchain is still large, so place the deployment behind a CDN (Vercel does this automatically) and expect the first compile to take longer than repeat visits. Content-hashed compiler assets remain immutable; the small worker bootstrap revalidates so updated security headers cannot be stranded in a browser cache.

## Production controls

- Content Security Policy, cross-origin isolation, clickjacking protection, MIME sniffing protection, and a restrictive Permissions Policy
- Worker cancellation, a first-load-aware timeout policy, and automatic worker replacement after failure
- Maximum 100 files, 512 KB per file, and 2 MB total project text
- CI on pushes and pull requests using Node.js 22
- No analytics, accounts, cookies, backend code execution, or host filesystem access

## Current constraints

- The compiler, linker, and sysroot assets are large (roughly 90 MB uncompressed), so the first visit is noticeably slower. Browser caching improves subsequent visits.
- One `.cpp` entry point is compiled at a time. Reusable project code can live in headers; separate translation-unit linking is not included in `browsercc`'s high-level compile API.
- C++ exceptions and native threads are disabled in this toolchain configuration. Sockets, dynamic libraries, and access to the host filesystem are also unavailable in the WASI sandbox.
- Workspace files are text-oriented and stored in browser local storage. They do not map to files elsewhere on the user's computer.
- The timeout can terminate CPU-bound code because execution lives in a worker. Browser memory limits remain platform-dependent, so this static app should not be represented as a hardened multi-tenant compute service.

## SQL WASM labs

Open **SQLite Lab**, **DuckDB Lab**, or **PGlite Lab** from the sidebar (direct routes: `/labs/sqlite`, `/labs/duckdb`, `/labs/pglite`). Click **Load engine**, **Load sample sales**, **Import dataset**, or **Run SQL** to initialize only that engine. Switching between the three SQL labs keeps their separate workers/databases alive. C++ keeps its existing workspace.

- Engines use `@sqlite.org/sqlite-wasm`, `@duckdb/duckdb-wasm`, and `@electric-sql/pglite`. All binaries and worker scripts are hosted with the app; no runtime CDN is required.
- Engine WASM binaries (and PGlite's filesystem bundle) use a versioned browser Cache API cache with content-hashed URLs. Denied storage or quota errors fall back to HTTP caching. JavaScript modules use normal browser caching. Unvisited engines are not downloaded.
- Import local CSV with a header row or JSON arrays of objects into a named table. Headers become quoted SQL identifiers; values use bound parameters. Numeric columns become `DOUBLE PRECISION`, other values become `TEXT`, and missing values become SQL `NULL`. Nested JSON values are stored as JSON text. Imports are transactional and reject existing table names rather than overwriting data.
- DuckDB additionally imports local Parquet files. CSV/JSON imports allow 20,000 rows and 100 columns; all uploaded files allow up to 20 MB.
- Execute the selected SQL or the full editor document with **Run SQL** / **Cmd/Ctrl+Enter**. The table explorer refreshes after commands. Scripts can include DDL, inserts, updates, and queries. SQLite displays the first result set in a script, DuckDB the last, and PGlite every result set. Run a selection to inspect a specific query.
- Result grids display up to 1,000 rows. **Export CSV** exports the last displayed result set (up to that same limit).
- SQL drafts persist per engine in local storage. Databases/datasets stay in memory and are cleared by reload, leaving the SQL labs, **Reset sandbox**, **Stop & clear**, or timeout. Resetting retains cached engine downloads.
- Preparation allows five minutes for the initial engine download; queries and imports allow 30 seconds before the worker is terminated. Browser memory limits still apply.
