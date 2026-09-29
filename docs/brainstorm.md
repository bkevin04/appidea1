# Brainstorm: Books → Games

_Living document. Last updated 2026-09-29._

## 1. The problem

- Lots of people never finish books even though they *want* the knowledge inside them.
- The usual "interactive" fix is flashcards and quizzes. They test recall but they're boring, and they break ideas into disconnected facts.
- People learn fastest by **doing**: manipulating things, making decisions, seeing consequences, building something.

**Goal:** turn a document into an experience where playing the game *is* the learning, and you finish knowing the material without feeling like you studied it.

## 2. Design principles

1. **The mechanic is the content.** The game action has to *be* the idea. If the book says "A causes B causes C", you build the chain yourself. Research on educational games ("intrinsic integration", Habgood & Ainsworth 2011) finds this works much better than "answer a quiz question, then get to shoot an alien".
2. **Do first, read second.** Text shows up in small pieces, only when needed (a tooltip, a character's line, a "source" button). The default mode is interaction.
3. **Grounded in the source.** Every game element links back to the passage it came from. No invented facts.
4. **Retrieval and application, not recognition.** Favor building, predicting, deciding, and explaining over multiple-choice.
5. **Spaced repetition you don't notice.** Old concepts come back as returning enemies, decaying buildings, or ingredients in new puzzles, not as a "review deck".
6. **Short sessions, visible progress.** 5–10 minute runs and a map that fills in as you master the book.

> Note on "learning styles": the research doesn't support fixed visual/auditory/kinesthetic *types*. It does strongly support active learning, retrieval practice, and pairing words with visuals ("dual coding") **for everyone**. That's good news: the pitch is "everyone learns better by doing", not a niche.

## 3. How it works (pipeline)

```
Document ──► Ingest ──► Knowledge Model ──► Game Plan ──► Play ──► Mastery tracking
 (PDF/EPUB/   (chunk by   (concepts, links,   (map knowledge     (engine renders   (per-concept,
  text/URL)    chapter)    processes, claims)  to mechanics)      templates)        feeds back in)
```

### 3a. Knowledge Model (the key intermediate layer)

An LLM reads each chapter and extracts *typed* knowledge, with a source citation on every item:

| Knowledge type | Example (from a business book) |
|---|---|
| Concept + definition | "Opportunity cost" |
| Relationship | X *causes* Y, X *is part of* Y, X *contrasts with* Y |
| Process / steps | The 5 steps of a sales call |
| Causal chain | Low prices → more volume → economies of scale → lower costs |
| Framework / decision rule | "Use A when…, use B when…" |
| Claim + evidence | Author's argument and what backs it up |
| Timeline / event | Historical sequence |
| Quantity / number | "~80% of results come from ~20% of causes" |
| Common misconception | What people *think* vs what the book argues |
| Example / story | A case study that illustrates a concept |

This layer matters more than anything else in the system. Good extraction makes good games.

### 3b. Game Plan: knowledge types → mechanics

**Key architecture decision:** the AI does **not** write new game code for each book. We build a library of polished, reusable **mechanic templates**, and the AI fills them with structured data (JSON). That keeps quality high, costs low, and bugs rare.

## 4. Mechanic catalog (first draft)

| Knowledge type | Mechanic | What the player does |
|---|---|---|
| Process / steps | **Assembly Line** | Drag machine parts (steps) into the right order. The machine runs, and wrong order makes it jam and shows why. |
| Causal chain | **Chain Reaction** | Place dominoes / Rube Goldberg pieces so one cause triggers the next. Predict what happens if one link is removed. |
| Concept relationships | **Constellation** | Connect stars (concepts) with the right link type. Finished constellations light up the chapter's region on the map. |
| Framework / decision rule | **Scenario Sim** | You're the manager / doctor / investor. Make choices in a branching situation and see consequences play out. |
| Claims + evidence | **Debate Boss** | A rival states a claim. Play cards from your collection (concepts you've earned) to counter it. Essentially a card battler. |
| Contrasting ideas | **Bouncer / Sorter** | Items fly in fast. Swipe each into the right bucket (Keynes vs Hayek, System 1 vs System 2). |
| Misconceptions | **Detective / Impostor** | An NPC explains something with one subtle error. Find it and fix it. |
| Timeline | **Time Rift** | Place events on a timeline to repair a broken history. |
| Numbers | **Estimation** | Set a slider to guess the value. Closer guesses score more, and the reveal sticks in memory. |
| Any concept | **Teach the NPC** | Explain the idea in your own words (typed or spoken) to a confused character. AI grades it against the source (the Feynman technique). |

Ideas for later: city-builder (each mastered concept unlocks a building, and neglected ones decay, which is spaced repetition), roguelike "runs" that mix concepts across chapters (interleaving), co-op/versus modes, fiction mode (role-play as a character and make their choices).

## 5. Meta-game / progression

- **Book = world map. Chapter = region. Concept = collectible card/ability.**
- Mastery meter per concept (e.g. 0–5 stars), driven by performance across *different* mechanics, not just one.
- Concepts you haven't mastered come back automatically in later levels (spacing plus interleaving).
- End-of-book **final boss**: a scenario that needs ideas from the whole book.
- Short daily "runs" with streaks, Duolingo-style habit loop (use carefully, without cheap dark patterns).
- A "Read the source" button everywhere, for the moments you *want* the depth.

## 6. MVP proposal (smallest thing that proves the idea)

**Question to answer:** is learning a chapter through 3–4 mechanics more fun *and* more effective than reading it?

- Web app (works on phone and tablet, since touch drag feels kinetic).
- Input: paste text or upload a PDF/EPUB. One chapter at a time.
- Knowledge extraction via an LLM (Claude) with structured JSON output and source citations.
- 3 mechanics to start: **Assembly Line**, **Chain Reaction / Constellation**, **Scenario Sim**.
- Simple chapter map plus per-concept mastery.
- Test with 5–10 people: have them play a chapter, then take a short quiz a few days later, compared against reading the same chapter.

**Suggested stack (open for discussion):**
- Frontend: Next.js + TypeScript + React. Drag and drop with `dnd-kit`, animation with Framer Motion. Use a canvas/game library (PixiJS or Phaser) only if a mechanic needs it.
- Backend: Next.js API routes or a small Python/Node service for ingestion (PDF/EPUB parsing, chunking).
- AI: Claude API for extraction, game-plan generation, and grading "teach the NPC" answers. Use a bigger model for extraction and a small, cheap model for real-time grading.
- DB: Postgres (Supabase) for users, books, knowledge models, and mastery.
- Cache generated games per chapter so each book is only processed once.

## 7. Risks & hard problems

| Risk | Mitigation |
|---|---|
| AI extracts wrong or shallow knowledge | Citations on every item, a validation pass, and "report an issue" in the game. Test on books you know well. |
| Games feel like dressed-up quizzes | Stick to intrinsic integration. Every mechanic has to pass the test "would removing the content break the game?" |
| Generating a whole game per book is expensive and slow | Template engine plus JSON; process chapters lazily as the player reaches them. |
| Copyright | Users upload their own books for personal use. Don't publish or share games built from copyrighted books. Public-domain and user-owned documents can be showcased. |
| Not all books fit | Start with **nonfiction** (business, self-help, science, textbooks), where the structure is clearer. Fiction comes later. |
| Fun wears off | Variety of mechanics, roguelike remixing, social features. |

## 8. Possible markets

1. **Consumers**: "I want the knowledge from books but I won't read them" (competes with Blinkist-style summaries, but you *do* the book instead of skimming it).
2. **Students**: turn textbook chapters and lecture notes into study games.
3. **Companies (B2B)**: turn onboarding docs, SOPs, compliance manuals, and product docs into training games. Compliance training is famously boring and companies already pay for it. This may be the strongest business.

## 9. Open questions

- [ ] Who is the first user: you and people like you, students, or companies?
- [ ] What kind of content first: nonfiction books, textbooks, or work documents?
- [ ] Web-first or mobile app?
- [ ] Session style: quick daily runs or longer deep-dive sessions?
- [ ] How much building will you do yourself, and how comfortable are you with code?
- [ ] Name ideas: *Unbook*, *Playbook*, *Lorecraft*, *Quest Reader*, *Kinetic*…

## 10. Suggested next steps

1. Pick **one real book chapter** you know well as the test case.
2. Hand-design the Knowledge Model for that chapter (what *should* be extracted).
3. Paper-prototype or mock up the 3 MVP mechanics using that chapter.
4. Build the extraction prompt and check it against your hand-made version.
5. Build the first playable mechanic end to end.
