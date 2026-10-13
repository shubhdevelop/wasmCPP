# Guide: add learning content

Learning content lives in `src/learning/content/*.json`. Edit these files to add lessons, exercises, and resource links. The app loads the catalog automatically when it builds; you do not need a database or UI changes for existing tracks.

## 1. Choose the content file

| Track | File | Runnable lab |
| --- | --- | --- |
| C++ / DSA | `src/learning/content/cpp.json` | C++ |
| DBMS theory | `src/learning/content/dbms.json` | None |
| Networking | `src/learning/content/networking.json` | None |
| Operating systems | `src/learning/content/os.json` | None |
| SQLite | `src/learning/content/sqlite.json` | SQLite |
| DuckDB | `src/learning/content/duckdb.json` | DuckDB |
| PostgreSQL | `src/learning/content/pglite.json` | PGlite |
| Low-level design | `src/learning/content/lld.json` | C++ |
| High-level design | `src/learning/content/hld.json` | None |
| Design Patterns | `src/learning/content/design-patterns.json` | C++ |

The structure is **track → modules → lessons / exercises / resources**. Each file contains one track. The order of each array controls its display order.

To extend an existing module, add an object to the relevant array in that module. Put a comma between objects, but no trailing comma after the last object. JSON does not allow comments.

## 2. Add a lesson to an existing module

For example, open `src/learning/content/lld.json`, find the `lld-foundations` module, and append this object to its `lessons` array:

```json
{
  "id": "ticket-lifecycle",
  "title": "Model a ticket lifecycle",
  "minutes": 6,
  "body": "### States\nA parking ticket starts active and becomes closed after a successful exit.\n\n### Invariant\nA closed ticket cannot be used to release a spot again.\n\n### Practice\nList the checks that must succeed before closing a ticket."
}
```

Open `/learn/lld/lld-foundations?lesson=ticket-lifecycle` to read it.

`body` is Markdown: headings, lists, links, tables, and fenced code blocks are supported. `minutes` is a positive reading-time estimate. For images, place the file in `public/resources/` and use a local path, such as `![Ticket lifecycle](/resources/ticket-lifecycle.png)`. The app's content security policy restricts images to its own origin.

## 3. Add a written exercise

Append this to a module's `exercises` array:

```json
{
  "id": "lld-ticket-invariants",
  "title": "Review ticket invariants",
  "difficulty": "Beginner",
  "prompt": "Describe how exit should behave for an unknown ticket, a closed ticket, and an exit time earlier than entry. Which state changes must be avoided?",
  "hints": [
    "Validate before releasing the assigned spot.",
    "A failed exit should leave the ticket active."
  ],
  "expected": "All three invalid exits are rejected without changing ticket or spot state.",
  "answer": "Look up the ticket, check that it is active, and validate the exit time. Only after these checks should the service calculate the fee, close the ticket, and release its spot."
}
```

Omit `lab`, `starter`, `setup`, and `stdin` for written exercises. A written exercise can live in a track that also has runnable labs.

The reader supports Markdown in prompts, hints, and answers. The lab sidebar displays prompts and hints as plain text, so keep those readable without Markdown formatting. `expected` is displayed as literal text. The reference answer is revealed in the module reader.

## 4. Add a runnable C++ exercise

C++, LLD, and Design Patterns already have `"lab": "cpp"` at track level. Append an exercise with the same lab and a compiling starter:

```json
{
  "id": "patterns-celsius-adapter",
  "title": "Adapter: convert a legacy reading",
  "difficulty": "Beginner",
  "lab": "cpp",
  "prompt": "Complete FahrenheitAdapter.read using F = C × 9 / 5 + 32. Keep LegacySensor unchanged. Run the program and compare stdout with the expected result.",
  "starter": "#include <iostream>\nstruct LegacySensor { double celsius() const { return 20; } };\nstruct FahrenheitAdapter {\n    const LegacySensor& sensor;\n    double read() const { /* TODO: convert the reading */ return 0; }\n};\nint main() {\n    LegacySensor sensor;\n    FahrenheitAdapter adapter{sensor};\n    std::cout << adapter.read() << \" F\\n\";\n}\n",
  "expected": "68 F\n",
  "hints": ["Delegate to sensor.celsius() and use floating-point arithmetic."],
  "answer": "The adapter translates the legacy reading into the caller's expected unit.\n\n```cpp\ndouble read() const { return sensor.celsius() * 9.0 / 5.0 + 32; }\n```"
}
```

Learners open the module exercise, select **Open exercise in lab**, complete the TODO, and select **Run**. The C++ route for this example is `/?exercise=patterns-celsius-adapter`.

For better examples:

- Make the starter compile and run, even before the TODO is solved.
- Include a deterministic `main()` that demonstrates normal behavior and relevant edge cases.
- Give exact expected stdout, including line breaks; avoid random values and timing-dependent results.
- Explain responsibilities, assumptions, and tradeoffs in the answer. A complete reference program is useful for larger examples.
- Add optional `stdin` when the program reads input: `"stdin": "5\n"`.
- Use browser-compatible C++ features. The sandbox does not provide native networking, threads, or exceptions; consult the C++ lab's capabilities before building an exercise around platform features.

Each exercise has its own persisted project draft. Opening an exercise does not overwrite the regular C++ project. Expected output is a comparison aid; the app does not automatically judge correctness.

## 5. Add a database lab exercise

Use the engine matching the track's `lab`: `sqlite`, `duckdb`, or `pglite`. Append this example to the SQLite track's module:

```json
{
  "id": "sqlite-adult-people",
  "title": "Filter adult people",
  "difficulty": "Beginner",
  "lab": "sqlite",
  "prompt": "Return the name and age of people aged 18 or older, ordered by name.",
  "starter": "-- TODO: filter and sort the results.\nSELECT name, age FROM exercise_adult_people;",
  "setup": "CREATE TABLE exercise_adult_people (name TEXT, age INTEGER);\nINSERT INTO exercise_adult_people VALUES ('Ada', 25), ('Lin', 16), ('Grace', 30);",
  "expected": "name | age\nAda | 25\nGrace | 30",
  "hints": ["Use WHERE age >= 18 and ORDER BY name."],
  "answer": "```sql\nSELECT name, age FROM exercise_adult_people WHERE age >= 18 ORDER BY name;\n```"
}
```

Learners select **Open exercise in lab**, then **Load exercise data**, then run their query. Setup does not run automatically. Use `ORDER BY` whenever the expected result depends on row order.

Setup runs inside a transaction. Use exercise-specific table names and omit explicit `BEGIN` / `COMMIT`. If setup is loaded twice, an existing table can cause it to fail; reset the sandbox for a fresh attempt. Databases stay in memory and do not survive reload. The SQL draft is saved separately per exercise.

The example's direct route is `/labs/sqlite?exercise=sqlite-adult-people`. Use the engine's own SQL dialect for DuckDB and PGlite examples. `expected` describes the table result; it is not an automatic result assertion.

## 6. Add resource links or local files

Append a resource to the module's `resources` array:

```json
{
  "title": "Parking lot design notes",
  "url": "/resources/parking-lot-notes.pdf",
  "kind": "Notes"
}
```

Save the corresponding file at `public/resources/parking-lot-notes.pdf`. Files in `public/` are served from the site root, so omit `public` from the URL. These assets ship with the website: only add material intended to be public.

External resources use a complete `https://...` or `http://...` URL. Resource kinds are `Documentation`, `Article`, `Video`, `Book`, or `Notes`.

Resources belong to the module, so they appear in its **Further reading** section. To link a resource from a particular lesson, also add a Markdown link in that lesson's body.

## 7. Create another module in an existing track

Append this object to the track's `modules` array, then replace the sample content:

```json
{
  "id": "object-lifetimes",
  "title": "Object lifetimes & ownership",
  "description": "Choose which object owns each collaborator and how long it lives.",
  "lessons": [
    {
      "id": "ownership",
      "title": "Make ownership explicit",
      "minutes": 5,
      "body": "### Ownership\nIdentify the owner of every object and the lifetime of every reference."
    }
  ],
  "exercises": [
    {
      "id": "lld-object-lifetimes",
      "title": "Review a reference lifetime",
      "difficulty": "Beginner",
      "prompt": "A service stores a reference to a policy. Explain what happens if the policy is destroyed first and how you would prevent it.",
      "hints": ["A reference does not own the policy."],
      "answer": "The reference becomes dangling. Keep the policy alive longer than the service, or use an ownership model that makes their lifetimes explicit."
    }
  ],
  "resources": []
}
```

In the LLD file, this module appears at `/learn/lld/object-lifetimes`. Keep `lessons`, `exercises`, and `resources` as arrays, including when exercises or resources are empty. Every module needs at least one lesson.

For a new track, copy an existing JSON file and change its top-level `id`, `title`, `shortLabel`, `category`, `description`, and modules. Remove or change its `lab` as needed. Allowed categories are `Programming`, `Databases`, `Computer science`, and `System design`. The catalog discovers new files automatically, but the current tests assert the ten initial tracks: update `src/learning/catalog.test.ts` when intentionally adding a track. Add its ID to the ordering list in `src/learning/catalog.ts` to choose its position.

## 8. Validate and preview

From the repository root:

```sh
npm run check
npm run dev
```

Open the development URL printed by Vite, then visit `/learn` and your module. Check the lesson formatting, resource links, hints, and reference answer. For runnable exercises, open the lab and run both the starter and completed solution. In SQL labs, also load the setup data and confirm the query results.

`npm run check` runs the tests, TypeScript checks, and production build. Catalog validation catches invalid or duplicate IDs, missing required text, invalid durations, unknown categories/difficulties/resource kinds, unsafe resource URL schemes, and mismatched lab links. It does not run your C++ or SQL solution or check whether linked files exist.

Content is bundled at build time. To preview with `npm run preview`, first run `npm run build`; preview serves the built content. To publish an update, commit the content/assets and rebuild or redeploy the website through your normal workflow.

## Field and ID rules

| Object | Required fields | Optional fields |
| --- | --- | --- |
| Track | `id`, `title`, `shortLabel`, `category`, `description`, `modules` | `lab` |
| Module | `id`, `title`, `description`, `lessons`, `exercises`, `resources` | — |
| Lesson | `id`, `title`, `minutes`, `body` | — |
| Exercise | `id`, `title`, `difficulty`, `prompt`, `hints`, `answer` | `expected`, `lab`, `starter`, `setup`, `stdin` |
| Resource | `title`, `url`, `kind` | — |

A runnable exercise requires both `lab` and nonempty `starter`, and its lab must match the track's lab. Difficulty is `Beginner`, `Intermediate`, or `Advanced`.

Use IDs with lowercase letters, numbers, and single hyphens, such as `patterns-inventory-observer`. Keep exercise IDs unique across all tracks. Use distinct module IDs within a track and lesson IDs within a module. Avoid IDs that collide with another catalog entry's combined track/module/lesson identifier. Keep existing IDs stable: changing them changes URLs and disconnects saved notes, progress, and exercise drafts.

Inside JSON strings, use `\n` for a line break and `\"` for a quote. To put the C++ escape sequence `\n` inside starter code, write `\\n` in JSON. Use fenced Markdown for reference code; do not paste literal multiline strings into JSON.

## Common problems

| Problem | What to check |
| --- | --- |
| JSON fails to load | Missing commas, trailing commas, unescaped quotes, or literal line breaks inside strings. |
| Catalog reports a duplicate ID | Exercise IDs must be globally unique; module/lesson IDs also form combined catalog IDs. |
| Exercise has no lab button | Add its `lab` and `starter`; the track's `lab` must match. |
| New content is absent in preview | Rebuild; preview serves `dist`, not the source files. |
| SQL table is missing | Select **Load exercise data** before running the query. |
| SQL setup fails on an existing table | Reset the sandbox and reload setup; use exercise-specific table names. |
| Local resource returns 404 | Put it under `public/resources/` and link `/resources/...`, with matching filename case. |
| Reference answer appears only in the reader | This is the current behavior; use **Back to module** from the lab. |
| Completion does not verify the answer | Completion is self-reported; compare the actual result with `expected`. |
