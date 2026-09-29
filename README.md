# appidea1 — Books → Games

> Working title. Turn any document or book into an interactive game you learn by *playing*, not by reading.

**Status:** backend prototype working and testable. The iOS app is next.

## The idea in one paragraph

Many people absorb information best by seeing and doing, not by reading pages of text. This app takes a document (a book, a PDF, a manual, a handbook), pulls out the knowledge inside it (concepts, processes, cause-and-effect chains, arguments, frameworks), and turns that knowledge into game mechanics. You rebuild a process like a machine, trigger cause-and-effect chains like dominoes, make decisions in simulated scenarios, and defeat "boss" arguments with the ideas you've collected. It's not a stack of flashcards.

## Decisions so far

- **Who it's for:** individuals who want to learn something and are willing to put in the effort: people learning for its own sake, students with textbooks, anyone with a book or document they want to actually absorb.
- **Format:** Duolingo-style **quick daily sessions** (about 5 minutes, 8 challenges), with streaks, XP, and spaced repetition, for any subject instead of just languages.
- **Platform:** an **iOS app**, built on top of the backend in [`backend/`](backend/).

## Repository

- [`backend/`](backend/README.md): the API server. It turns documents into courses of game-like lessons with Claude, and tracks progress. It includes a browser playground for testing.

## Docs

- [`docs/brainstorm.md`](docs/brainstorm.md): vision, design principles, the game-mechanic catalog, the pipeline, MVP scope, risks, and open questions.
