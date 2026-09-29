# Project notes for Claude

An app that turns documents and books into Duolingo-style daily game lessons. The founder does not code: Claude builds everything, so explain decisions in plain language and keep the docs current.

- `docs/brainstorm.md`: product vision, mechanic catalog, decisions.
- `backend/`: TypeScript API (Fastify + SQLite + Claude API). See `backend/README.md` for architecture and API.
  - `cd backend && npm install && npm test && npm run typecheck` before every commit.
  - `npm run dev` serves the API and a test playground on http://localhost:3000.
  - Tests run with the offline mock generator; no API key is needed.
  - `src/ai/schemas.ts` is the contract for both Claude's output and the future iOS app. Change it deliberately.
- Next milestone: the iOS app (SwiftUI) that calls the backend API.
