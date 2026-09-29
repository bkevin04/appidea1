import type { ChallengeSpec } from "../src/ai/schemas.js";
import type { ClientChallenge } from "../src/game/challenges.js";

/**
 * Plays a challenge the way the app would, using the client view plus the
 * stored spec to find the right (or deliberately wrong) answer.
 */
export function solve(view: ClientChallenge, spec: ChallengeSpec, correct = true): unknown {
  const byText = (items: { id: string; text: string }[], text: string) => items.find((i) => i.text === text)!.id;
  switch (spec.mechanic) {
    case "sequence": {
      const v = view as Extract<ClientChallenge, { mechanic: "sequence" }>;
      const order = spec.steps.map((t) => byText(v.items, t));
      return { order: correct ? order : [...order].reverse() };
    }
    case "chain": {
      const v = view as Extract<ClientChallenge, { mechanic: "chain" }>;
      const right = byText(v.options, spec.links[spec.missing_index]!);
      return { optionId: correct ? right : v.options.find((o) => o.id !== right)!.id };
    }
    case "sort": {
      const v = view as Extract<ClientChallenge, { mechanic: "sort" }>;
      const placements: Record<string, string> = {};
      for (const it of spec.items) {
        const wrong = spec.buckets.find((b) => b !== it.bucket)!;
        placements[byText(v.items, it.text)] = correct ? it.bucket : wrong;
      }
      return { placements };
    }
    case "match": {
      const v = view as Extract<ClientChallenge, { mechanic: "match" }>;
      const pairs: Record<string, string> = {};
      spec.pairs.forEach((p, i) => {
        const target = correct ? p.right : spec.pairs[(i + 1) % spec.pairs.length]!.right;
        pairs[byText(v.left, p.left)] = byText(v.right, target);
      });
      return { pairs };
    }
    case "scenario": {
      const v = view as Extract<ClientChallenge, { mechanic: "scenario" }>;
      return { optionId: byText(v.options, spec.options.find((o) => o.correct === correct)!.text) };
    }
    case "spot_error": {
      const v = view as Extract<ClientChallenge, { mechanic: "spot_error" }>;
      const idx = correct ? spec.wrong_index : (spec.wrong_index + 1) % spec.statements.length;
      return { statementId: v.statements[idx]!.id };
    }
    case "estimate":
      return { value: correct ? spec.answer : spec.answer + spec.tolerance * 3 + (spec.max - spec.min) / 2 };
    case "swipe": {
      const v = view as Extract<ClientChallenge, { mechanic: "swipe" }>;
      const answers: Record<string, boolean> = {};
      for (const c of spec.cards) answers[byText(v.cards, c.text)] = correct ? c.is_true : !c.is_true;
      return { answers };
    }
    case "teach_back":
      return {
        text: correct ? spec.key_points.join(". ") : "I don't really know, sorry.",
      };
  }
}
