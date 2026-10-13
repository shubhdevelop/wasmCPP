# Authoring learning modules

Edit `src/learning/content/*.json`. Each file is one track. Tracks contain modules; modules contain Markdown lessons, exercises, and resources. The hub discovers new JSON files automatically. No UI changes or database are required.

The initial curriculum is a starter: ten tracks, one module per track, two lessons per module and twelve exercises across the tracks. Extend these arrays as your curriculum grows. Keep IDs stable: URLs, saved reading progress, exercise notes, and isolated lab drafts use them.

## Track and module format

```json
{
  "id": "my-topic",
  "title": "My topic",
  "shortLabel": "TOP",
  "category": "Computer science",
  "description": "What learners will understand.",
  "modules": [
    {
      "id": "foundations",
      "title": "Foundations",
      "description": "The focus of this module.",
      "lessons": [
        {
          "id": "first-concept",
          "title": "First concept",
          "minutes": 8,
          "body": "### The idea\nExplain the concept.\n\n### Try it\nGive a concrete example."
        }
      ],
      "exercises": [
        {
          "id": "my-topic-first-exercise",
          "title": "Apply the concept",
          "difficulty": "Beginner",
          "prompt": "Describe the task and assumptions.",
          "hints": ["One hint at a time."],
          "answer": "A reference approach, with reasoning."
        }
      ],
      "resources": [
        {
          "title": "My notes",
          "url": "/resources/my-notes.pdf",
          "kind": "Notes"
        }
      ]
    }
  ]
}
```

Categories: `Programming`, `Databases`, `Computer science`, `System design`.

Difficulty: `Beginner`, `Intermediate`, `Advanced`.

Resource kinds: `Documentation`, `Article`, `Video`, `Book`, `Notes`. Use an absolute HTTP/HTTPS URL, or place files under `public/resources/` and reference `/resources/filename.pdf`. Prefer local URLs for Markdown images because the app's CSP restricts images to its own origin. Lesson bodies, prompts, hints, and answers support Markdown, including code fences. JSON multiline text must use escaped `\n` characters.

IDs use lowercase letters, numbers, and single hyphens. Track IDs are unique. Module IDs are unique within a track, lesson IDs within a module, and exercise IDs across the entire curriculum.

## Runnable lab exercises

Set a track's `lab` to `cpp`, `sqlite`, `duckdb`, or `pglite`. A runnable exercise must use the same `lab` and provide `starter` text. Add optional `expected` output, `setup` SQL, or `stdin` for C++.

```json
{
  "id": "sqlite-my-exercise",
  "title": "Filter people",
  "difficulty": "Beginner",
  "lab": "sqlite",
  "prompt": "Return people aged 18 or older.",
  "starter": "-- TODO: add a WHERE clause.\nSELECT * FROM exercise_people;",
  "setup": "CREATE TABLE exercise_people (name TEXT, age INTEGER);\nINSERT INTO exercise_people VALUES ('Ada', 25), ('Lin', 16);",
  "expected": "Ada | 25",
  "hints": ["Use age >= 18."],
  "answer": "```sql\nSELECT * FROM exercise_people WHERE age >= 18;\n```"
}
```

The exercise opens with its own persisted draft; it does not overwrite the regular C++ project or SQL draft. SQL setup runs only when the learner clicks **Load exercise data**, inside a transaction. Use exercise-specific table names. Duplicate setup fails without replacing existing tables; reset the sandbox to start fresh. Setup SQL must not contain its own BEGIN/COMMIT because the loader supplies the transaction.

Theory and design exercises omit `lab`, `starter`, and `setup`. Learners can write notes, reveal hints/reference approaches, and mark completion. Completion is self-reported, not an automated correctness verdict.

## Routes and persistence

- Hub: `/learn`
- Module: `/learn/<track-id>/<module-id>`
- Lesson: `/learn/<track-id>/<module-id>?lesson=<lesson-id>`
- Exercise: `/learn/<track-id>/<module-id>?exercise=<exercise-id>`
- C++ exercise: `/?exercise=<exercise-id>`
- SQL exercise: `/labs/<engine>?exercise=<exercise-id>`

Content is shared through the repository/build. Progress, notes, and drafts are private to each browser and can be removed by site-data cleanup. SQL databases and exercise data stay in memory and do not survive a reload.

Run `npm run check` after editing content. Curriculum checks catch duplicate IDs, unsafe resource URL schemes, missing required fields, and invalid exercise-to-lab links.

## Design practice labs

LLD and Design Patterns use the C++ lab. The parking lot, shipping Strategy, sensor Adapter, and inventory Observer exercises include compiling TODO starters, deterministic sample scenarios, expected stdout, hints, and complete reference implementations in the module reader. Follow the same fields to add more examples. Sample output is a comparison aid; completion remains self-reported.
