import { createHash } from "node:crypto";
import { z } from "zod";
import type { ContentGenerator } from "../ai/generator.js";
import type { ChallengeSpec, Mechanic } from "../ai/schemas.js";
import type { Challenge, KnowledgeRow } from "../db.js";

/**
 * Challenges are stored with their answer keys. The app only ever receives a
 * "client view": answers removed, options shuffled and given opaque ids. The
 * ids and shuffle are derived from a seed (session id + challenge id), so the
 * same session always shows the same order and grading can rebuild the mapping.
 */

export const MECHANIC_LABELS: Record<Mechanic, string> = {
  sequence: "Assembly Line",
  chain: "Chain Reaction",
  sort: "Sorter",
  match: "Constellation",
  scenario: "Scenario Sim",
  spot_error: "Detective",
  estimate: "Estimation",
  swipe: "True or False",
  teach_back: "Teach the NPC",
};

const MAX_XP: Record<ChallengeSpec["difficulty"], number> = { easy: 10, medium: 15, hard: 20 };

function optionId(seed: string, tag: string): string {
  return createHash("sha256").update(`${seed}:${tag}`).digest("hex").slice(0, 10);
}

function shuffled<T>(items: T[], seed: string): T[] {
  const hash = createHash("sha256").update(seed).digest();
  let state = hash.readUInt32LE(0) || 1;
  const rand = () => {
    // mulberry32
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  // Never hand out a sequence that is already solved.
  if (out.length > 1 && out.every((v, i) => v === items[i])) out.push(out.shift()!);
  return out;
}

export function challengeSeed(sessionId: string, challengeId: string): string {
  return `${sessionId}:${challengeId}`;
}

export function clientView(challenge: Challenge, seed: string) {
  const s = challenge.spec;
  const common = {
    id: challenge.id,
    mechanicLabel: MECHANIC_LABELS[s.mechanic],
    title: s.title,
    difficulty: s.difficulty,
    maxXp: MAX_XP[s.difficulty],
  };
  switch (s.mechanic) {
    case "sequence":
      return {
        ...common,
        mechanic: s.mechanic,
        prompt: s.prompt,
        items: shuffled(
          s.steps.map((text, i) => ({ id: optionId(seed, `s${i}`), text })),
          seed,
        ),
      };
    case "chain":
      return {
        ...common,
        mechanic: s.mechanic,
        prompt: s.prompt,
        links: s.links.map((text, i) => (i === s.missing_index ? null : text)),
        options: shuffled(
          [
            { id: optionId(seed, "correct"), text: s.links[s.missing_index]! },
            ...s.distractors.map((text, i) => ({ id: optionId(seed, `d${i}`), text })),
          ],
          seed,
        ),
      };
    case "sort":
      return {
        ...common,
        mechanic: s.mechanic,
        prompt: s.prompt,
        buckets: s.buckets,
        items: shuffled(
          s.items.map((it, i) => ({ id: optionId(seed, `i${i}`), text: it.text })),
          seed,
        ),
      };
    case "match":
      return {
        ...common,
        mechanic: s.mechanic,
        prompt: s.prompt,
        left: s.pairs.map((p, i) => ({ id: optionId(seed, `l${i}`), text: p.left })),
        right: shuffled(
          s.pairs.map((p, i) => ({ id: optionId(seed, `r${i}`), text: p.right })),
          seed,
        ),
      };
    case "scenario":
      return {
        ...common,
        mechanic: s.mechanic,
        character: s.character,
        situation: s.situation,
        question: s.question,
        options: shuffled(
          s.options.map((o, i) => ({ id: optionId(seed, `o${i}`), text: o.text })),
          seed,
        ),
      };
    case "spot_error":
      return {
        ...common,
        mechanic: s.mechanic,
        speaker: s.speaker,
        statements: s.statements.map((text, i) => ({ id: optionId(seed, `st${i}`), text })),
      };
    case "estimate":
      return { ...common, mechanic: s.mechanic, question: s.question, min: s.min, max: s.max, unit: s.unit };
    case "swipe":
      return {
        ...common,
        mechanic: s.mechanic,
        prompt: s.prompt,
        cards: shuffled(
          s.cards.map((c, i) => ({ id: optionId(seed, `c${i}`), text: c.text })),
          seed,
        ),
      };
    case "teach_back":
      return { ...common, mechanic: s.mechanic, npcName: s.npc_name, npcQuestion: s.npc_question };
  }
}

export type ClientChallenge = ReturnType<typeof clientView>;

const ResponseSchemas = {
  sequence: z.object({ order: z.array(z.string()) }),
  chain: z.object({ optionId: z.string() }),
  sort: z.object({ placements: z.record(z.string(), z.string()) }),
  match: z.object({ pairs: z.record(z.string(), z.string()) }),
  scenario: z.object({ optionId: z.string() }),
  spot_error: z.object({ statementId: z.string() }),
  estimate: z.object({ value: z.number() }),
  swipe: z.object({ answers: z.record(z.string(), z.boolean()) }),
  teach_back: z.object({ text: z.string().min(1).max(4000) }),
} satisfies Record<Mechanic, z.ZodType>;

export class InvalidResponseError extends Error {}

export interface GradeResult {
  correct: boolean;
  score: number;
  xp: number;
  explanation: string;
  /** Mechanic-specific reveal of the right answer, for the feedback screen. */
  reveal: Record<string, unknown>;
  sources: { title: string; quote: string }[];
}

export async function gradeChallenge(
  challenge: Challenge,
  seed: string,
  rawResponse: unknown,
  knowledge: KnowledgeRow[],
  generator: ContentGenerator,
): Promise<GradeResult> {
  const s = challenge.spec;
  const parsed = ResponseSchemas[s.mechanic].safeParse(rawResponse);
  if (!parsed.success) {
    throw new InvalidResponseError(`Invalid response for ${s.mechanic}: ${parsed.error.issues[0]?.message ?? "bad shape"}`);
  }
  const r = parsed.data as never;
  const { score, correct, reveal } = await gradeSpec(s, seed, r, knowledge, generator);
  return {
    correct,
    score,
    xp: Math.round(MAX_XP[s.difficulty] * score),
    explanation: s.explanation,
    reveal,
    sources: knowledge.map((k) => ({ title: k.title, quote: k.source_quote })),
  };
}

type Graded = { score: number; correct: boolean; reveal: Record<string, unknown> };

function fraction(hits: number, total: number): number {
  return total === 0 ? 0 : hits / total;
}

async function gradeSpec(
  s: ChallengeSpec,
  seed: string,
  r: never,
  knowledge: KnowledgeRow[],
  generator: ContentGenerator,
): Promise<Graded> {
  switch (s.mechanic) {
    case "sequence": {
      const { order } = r as z.infer<typeof ResponseSchemas.sequence>;
      const expected = s.steps.map((_, i) => optionId(seed, `s${i}`));
      const hits = expected.filter((id, i) => order[i] === id).length;
      const score = order.length === expected.length ? fraction(hits, expected.length) : 0;
      return { score, correct: score === 1, reveal: { correctOrder: s.steps } };
    }
    case "chain": {
      const { optionId: chosen } = r as z.infer<typeof ResponseSchemas.chain>;
      const correct = chosen === optionId(seed, "correct");
      return { score: correct ? 1 : 0, correct, reveal: { missingLink: s.links[s.missing_index], links: s.links } };
    }
    case "sort": {
      const { placements } = r as z.infer<typeof ResponseSchemas.sort>;
      const hits = s.items.filter((it, i) => placements[optionId(seed, `i${i}`)] === it.bucket).length;
      const score = fraction(hits, s.items.length);
      return {
        score,
        correct: score >= 0.8,
        reveal: { answers: s.items.map((it, i) => ({ id: optionId(seed, `i${i}`), text: it.text, bucket: it.bucket })) },
      };
    }
    case "match": {
      const { pairs } = r as z.infer<typeof ResponseSchemas.match>;
      const hits = s.pairs.filter((_, i) => pairs[optionId(seed, `l${i}`)] === optionId(seed, `r${i}`)).length;
      const score = fraction(hits, s.pairs.length);
      return { score, correct: score >= 0.8, reveal: { pairs: s.pairs } };
    }
    case "scenario": {
      const { optionId: chosen } = r as z.infer<typeof ResponseSchemas.scenario>;
      const idx = s.options.findIndex((_, i) => optionId(seed, `o${i}`) === chosen);
      if (idx === -1) throw new InvalidResponseError("Unknown option id");
      const picked = s.options[idx]!;
      const best = s.options.find((o) => o.correct)!;
      return {
        score: picked.correct ? 1 : 0,
        correct: picked.correct,
        reveal: { consequence: picked.consequence, bestOption: best.text, bestConsequence: best.consequence },
      };
    }
    case "spot_error": {
      const { statementId } = r as z.infer<typeof ResponseSchemas.spot_error>;
      const correct = statementId === optionId(seed, `st${s.wrong_index}`);
      return {
        score: correct ? 1 : 0,
        correct,
        reveal: { wrongStatement: s.statements[s.wrong_index], correction: s.correction },
      };
    }
    case "estimate": {
      const { value } = r as z.infer<typeof ResponseSchemas.estimate>;
      const diff = Math.abs(value - s.answer);
      const correct = diff <= s.tolerance;
      const range = Math.max(s.max - s.min, 1e-9);
      const score = correct ? 1 : Math.max(0, 1 - diff / (range / 2)) * 0.5;
      return { score, correct, reveal: { answer: s.answer, unit: s.unit, tolerance: s.tolerance } };
    }
    case "swipe": {
      const { answers } = r as z.infer<typeof ResponseSchemas.swipe>;
      const cards = s.cards.map((c, i) => ({ id: optionId(seed, `c${i}`), ...c }));
      const hits = cards.filter((c) => answers[c.id] === c.is_true).length;
      const score = fraction(hits, cards.length);
      return {
        score,
        correct: score >= 0.8,
        reveal: { cards: cards.map((c) => ({ id: c.id, text: c.text, isTrue: c.is_true, why: c.why })) },
      };
    }
    case "teach_back": {
      const { text } = r as z.infer<typeof ResponseSchemas.teach_back>;
      const grade = await generator.gradeTeachBack({
        npcName: s.npc_name,
        npcQuestion: s.npc_question,
        keyPoints: s.key_points,
        sourceQuotes: knowledge.map((k) => k.source_quote),
        answer: text,
      });
      const score = Math.min(1, Math.max(0, grade.score));
      return {
        score,
        correct: score >= 0.7,
        reveal: {
          npcReply: grade.npc_reply,
          coveredPoints: grade.covered_points,
          missedPoints: grade.missed_points,
          misconceptions: grade.misconceptions,
          keyPoints: s.key_points,
        },
      };
    }
  }
}
