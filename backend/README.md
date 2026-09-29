# Backend

The server behind the app. It turns a document into a course of bite-sized, game-like daily lessons, and tracks each learner's progress (XP, streaks, spaced repetition).

- **Stack:** TypeScript on Node 22, [Fastify](https://fastify.dev) for the HTTP API, SQLite for storage, and the Claude API for content generation.
- **Offline mode:** without an Anthropic API key, a simple built-in generator stands in for Claude, so everything still runs and can be tested. The games it makes are basic; real ones need Claude.
- **Test playground:** the server also serves a small mobile-sized web page at `/` for playing lessons in a browser. It's a test harness, not the real app. The iOS app will call the same API.

## Run it

```bash
cd backend
npm install
cp .env.example .env        # optional: add ANTHROPIC_API_KEY for real Claude-generated games
npm run dev                 # starts on http://localhost:3000
```

Open http://localhost:3000, tap **Add the sample course**, and play a lesson. To try your own material, paste text or upload a PDF/TXT/MD file.

```bash
npm test                    # run the test suite
npm run typecheck           # TypeScript type check
```

## How it works

```
Upload ─► extract text ─► split into units ─► Claude: knowledge model + challenges ─► daily sessions ─► grading ─► mastery / XP / streak
 (PDF,     (unpdf)         (by headings,       (structured JSON, validated,            (reviews + new    (instant for   (spaced repetition)
  TXT, MD)                  ~1,800 words)       generated lazily, 2 units ahead)        material)          most games)
```

1. **Ingest** (`src/ingest/`). The server pulls text out of the upload and splits it into units using the document's own headings ("# ...", "Chapter 3", ...). Very long sections are split further and tiny ones merged.
2. **Generate** (`src/ai/`). For each unit, one Claude call returns:
   - a **knowledge model**: the 3–7 key ideas, each typed (concept, process, cause/effect, framework, misconception, ...) and backed by a verbatim quote from the source;
   - **6–10 challenges**, each using the game mechanic that fits the idea's type.

   The output is constrained to a JSON schema (`src/ai/schemas.ts`), and cross-field rules are checked afterwards; a broken challenge is dropped rather than failing the whole unit. Units are generated **lazily**: the first 2 up front, then always 2 ahead of the learner. Long books therefore only cost money for the parts someone actually studies.
3. **Play** (`src/game/`, `src/services/learning.ts`). A daily session holds 8 challenges: up to 2 reviews of ideas that are due (spaced repetition), then new challenges from the current unit, ending with "Teach the NPC". The app gets a **client view** of each challenge, with answer keys stripped and options shuffled under opaque ids, so answers can't be read from the network traffic.
4. **Grade and progress.** Most mechanics are graded instantly on the server. Free-text explanations ("Teach the NPC") are graded by Claude against the source. Each idea moves through Leitner boxes (reviewed after 0 → 1 → 3 → 7 → 16 → 35 → 90 days) and shows as 0–5 stars. XP, levels, a daily XP goal, and a streak make the Duolingo-style habit loop. A unit is complete once every idea in it has been answered correctly, which unlocks the next unit.

### Game mechanics

| Mechanic (`mechanic`) | In-game name | Player does | Answer payload (`response`) |
|---|---|---|---|
| `swipe` | True or False | Swipe statement cards true/false | `{ "answers": { "<cardId>": true } }` |
| `sequence` | Assembly Line | Put process steps in order | `{ "order": ["<itemId>", ...] }` |
| `chain` | Chain Reaction | Fill the missing link in a cause→effect chain | `{ "optionId": "<id>" }` |
| `sort` | Sorter | Drop items into buckets | `{ "placements": { "<itemId>": "<bucket name>" } }` |
| `match` | Constellation | Connect pairs | `{ "pairs": { "<leftId>": "<rightId>" } }` |
| `scenario` | Scenario Sim | Make a choice in a role-play; see the consequence | `{ "optionId": "<id>" }` |
| `spot_error` | Detective | Find the one wrong statement | `{ "statementId": "<id>" }` |
| `estimate` | Estimation | Guess a number on a slider | `{ "value": 42 }` |
| `teach_back` | Teach the NPC | Explain the idea in your own words | `{ "text": "..." }` |

## API

Every request except `POST /users` and `GET /health` needs an `x-user-id` header containing the id returned by `POST /users`. This is a stand-in until real sign-in (e.g. Sign in with Apple) is added.

| Method & path | What it does |
|---|---|
| `GET /health` | Server status and which generator is active (`anthropic` or `mock`). |
| `POST /users` `{ name }` | Create a learner. Returns `{ id, ... }`. |
| `GET /me` | XP, level, streak, and daily goal progress. |
| `GET /courses` | The learner's courses with progress. |
| `POST /courses` `{ title, text }` | Create a course from pasted text. Returns the course path. |
| `POST /courses/upload` (multipart: `file`, optional `title`) | Create a course from a PDF/TXT/MD file. |
| `POST /courses/sample` | Add the built-in sample course (hand-written content, no API key needed). |
| `GET /courses/:id` | The course path: units with `state` (`completed`/`current`/`locked`), generation `status`, ideas learned, and stars. |
| `GET /courses/:id/knowledge` | The "idea cards": every extracted idea with its source quote and mastery. |
| `POST /courses/:id/units/:idx/retry` | Retry a unit whose generation failed. |
| `POST /courses/:id/sessions` | Start a daily session. Returns its challenges (client view). `409` if the unit is still being generated. |
| `GET /sessions/:id` | Resume a session. |
| `POST /sessions/:id/answers` `{ challengeId, response }` | Grade one answer. Returns `correct`, `score`, `xp`, `explanation`, a mechanic-specific `reveal` (e.g. the scenario's consequence, the Teach-the-NPC reply), source quotes, and updated stars. |
| `POST /sessions/:id/complete` | Finish the session. Returns XP earned, accuracy, streak, units completed, and the unlocked next unit. |

## Configuration (`.env`)

| Variable | Default | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables real Claude generation. |
| `LLM_PROVIDER` | `anthropic` if a key is set, else `mock` | Force a generator. |
| `CLAUDE_MODEL` | `claude-opus-5-5` | Model for generation and grading. |
| `GENERATION_EFFORT` / `GRADING_EFFORT` | `medium` / `low` | How much the model thinks. Higher effort costs more and gives better games. |
| `GENERATE_AHEAD` | `2` | Units generated ahead of the learner. |
| `SESSION_SIZE` | `8` | Challenges per daily session. |
| `DAILY_XP_GOAL` | `50` | XP needed to hit the daily goal. |
| `DATABASE_PATH` | `./data/app.db` | SQLite file location. |

## Cost ballpark (Claude Opus 5.5 at $4 / $20 per million input/output tokens)

These are rough estimates to be confirmed with real usage:
- **One unit** (~1,800 words of source → knowledge model + ~8 challenges): roughly 4k input and 8–12k output tokens, so **about $0.15–0.25**.
- **One "Teach the NPC" grade**: about **$0.02–0.04**.
- **A 300-page book** (~50 units) fully played: **about $10**. Because generation is lazy, a book someone abandons after chapter 3 costs well under $1.

Setting `CLAUDE_MODEL=claude-sonnet-5-5` roughly halves the cost. Whether game quality holds up at that level is worth testing before switching. Requests use prompt caching for the shared instructions, and they opt into the API's server-side fallback, so a request declined by a safety classifier is retried on Anthropic's recommended fallback model.

## Project layout

```
src/
  index.ts              server entry point
  server.ts             HTTP routes
  config.ts             environment settings
  db.ts                 SQLite schema and row types
  ai/
    schemas.ts          knowledge-model and challenge schemas (the contract with Claude and with the app)
    prompts.ts          the game-designer and grader prompts
    claudeGenerator.ts  Claude API calls (structured outputs)
    mockGenerator.ts    offline stand-in
  ingest/               text extraction (PDF/TXT/MD) and chunking into units
  game/                 client views + grading, spaced repetition, XP/levels/streaks
  services/             course generation pipeline, sessions and progress
public/index.html       browser test playground
fixtures/habits.ts      sample course with hand-written content
test/                   API and logic tests (run in offline mode)
```

## Known limitations / next steps

- **Auth:** the `x-user-id` header is a placeholder; real sign-in is needed before launch.
- **Day boundaries** for streaks and the daily goal use UTC, not the learner's time zone.
- **EPUB** isn't supported yet; scanned PDFs (images with no text layer) would need OCR.
- **Storage** is SQLite on a single server. That's fine for testing, but it should move to Postgres before real users arrive.
- **Content quality** is only exercised by the offline generator in tests. Run the real Claude generator on a few books you know well, and judge the games before building the iOS screens.
