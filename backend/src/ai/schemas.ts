import { z } from "zod";

/**
 * The shape Claude fills in for each unit (section) of a document.
 *
 * This schema is sent to the API as a structured-output format, so it sticks to
 * features structured outputs support: no min/max constraints and no recursion.
 * Size limits live in the prompt instead.
 */

export const KNOWLEDGE_TYPES = [
  "concept",
  "process",
  "cause_effect",
  "comparison",
  "framework",
  "claim",
  "misconception",
  "fact",
  "event",
] as const;

export const KnowledgeItemSchema = z.object({
  key: z.string().describe('Short unique id within this unit, e.g. "k1"'),
  type: z.enum(KNOWLEDGE_TYPES),
  title: z.string().describe("2-6 word name of the idea"),
  explanation: z.string().describe("One or two plain-language sentences a learner sees after answering"),
  source_quote: z.string().describe("A short verbatim quote from the source text that backs this item"),
});

const base = {
  knowledge_keys: z.array(z.string()).describe("Keys of the knowledge items this challenge practises"),
  difficulty: z.enum(["easy", "medium", "hard"]),
  explanation: z.string().describe("Shown after the player answers: why the answer is right, in one or two sentences"),
};

export const SequenceChallengeSchema = z.object({
  mechanic: z.literal("sequence"),
  title: z.string().describe('Game-style title, e.g. "Build the Machine"'),
  prompt: z.string(),
  steps: z.array(z.string()).describe("3-6 steps in the CORRECT order; the app shuffles them"),
  ...base,
});

export const ChainChallengeSchema = z.object({
  mechanic: z.literal("chain"),
  title: z.string(),
  prompt: z.string(),
  links: z.array(z.string()).describe("3-5 cause-and-effect links in order, each one causing the next"),
  missing_index: z.number().int().describe("0-based index of the link the player must supply"),
  distractors: z.array(z.string()).describe("2-3 plausible but wrong links"),
  ...base,
});

export const SortChallengeSchema = z.object({
  mechanic: z.literal("sort"),
  title: z.string(),
  prompt: z.string(),
  buckets: z.array(z.string()).describe("2-3 category names"),
  items: z
    .array(z.object({ text: z.string(), bucket: z.string().describe("Must exactly equal one of the bucket names") }))
    .describe("4-8 items"),
  ...base,
});

export const MatchChallengeSchema = z.object({
  mechanic: z.literal("match"),
  title: z.string(),
  prompt: z.string(),
  pairs: z
    .array(z.object({ left: z.string(), right: z.string() }))
    .describe("3-5 pairs, e.g. term -> meaning, cause -> effect, person -> idea"),
  ...base,
});

export const ScenarioChallengeSchema = z.object({
  mechanic: z.literal("scenario"),
  title: z.string(),
  character: z.string().describe("Who the player is, e.g. 'You are a new team lead'"),
  situation: z.string().describe("A concrete, realistic situation in 2-4 sentences"),
  question: z.string(),
  options: z
    .array(
      z.object({
        text: z.string(),
        correct: z.boolean(),
        consequence: z.string().describe("What happens if the player picks this, told as a short story beat"),
      }),
    )
    .describe("3-4 options, exactly one correct"),
  ...base,
});

export const SpotErrorChallengeSchema = z.object({
  mechanic: z.literal("spot_error"),
  title: z.string(),
  speaker: z.string().describe("Name of the character who is (subtly) wrong"),
  statements: z.array(z.string()).describe("3-5 statements the speaker makes, exactly one of them wrong"),
  wrong_index: z.number().int(),
  correction: z.string().describe("The corrected version of the wrong statement"),
  ...base,
});

export const EstimateChallengeSchema = z.object({
  mechanic: z.literal("estimate"),
  title: z.string(),
  question: z.string(),
  answer: z.number(),
  min: z.number().describe("Slider minimum"),
  max: z.number().describe("Slider maximum"),
  unit: z.string().describe('Unit label, e.g. "%", "years", "" if none'),
  tolerance: z.number().describe("How far from the answer still counts as correct"),
  ...base,
});

export const SwipeChallengeSchema = z.object({
  mechanic: z.literal("swipe"),
  title: z.string(),
  prompt: z.string(),
  cards: z
    .array(z.object({ text: z.string(), is_true: z.boolean(), why: z.string() }))
    .describe("4-6 statements to swipe true/false; mix of true and false"),
  ...base,
});

export const TeachBackChallengeSchema = z.object({
  mechanic: z.literal("teach_back"),
  title: z.string(),
  npc_name: z.string(),
  npc_question: z.string().describe("A curious, slightly confused question from the character"),
  key_points: z.array(z.string()).describe("2-4 points a good explanation must cover"),
  ...base,
});

export const ChallengeSpecSchema = z.discriminatedUnion("mechanic", [
  SequenceChallengeSchema,
  ChainChallengeSchema,
  SortChallengeSchema,
  MatchChallengeSchema,
  ScenarioChallengeSchema,
  SpotErrorChallengeSchema,
  EstimateChallengeSchema,
  SwipeChallengeSchema,
  TeachBackChallengeSchema,
]);

export const UnitContentSchema = z.object({
  unit_title: z.string().describe("Catchy 2-5 word title for this unit"),
  hook: z.string().describe("One sentence that makes the learner curious about this unit"),
  knowledge: z.array(KnowledgeItemSchema),
  challenges: z.array(ChallengeSpecSchema),
});

export const TeachBackGradeSchema = z.object({
  score: z.number().describe("0 to 1: how well the explanation covers the key points accurately"),
  covered_points: z.array(z.string()),
  missed_points: z.array(z.string()),
  misconceptions: z.array(z.string()).describe("Anything the learner said that contradicts the source"),
  npc_reply: z.string().describe("The character's short, warm reply in their own voice"),
});

export type KnowledgeItemSpec = z.infer<typeof KnowledgeItemSchema>;
export type ChallengeSpec = z.infer<typeof ChallengeSpecSchema>;
export type Mechanic = ChallengeSpec["mechanic"];
export type UnitContent = z.infer<typeof UnitContentSchema>;
export type TeachBackGrade = z.infer<typeof TeachBackGradeSchema>;

/**
 * Checks what the schema can't express (cross-field rules) and drops broken
 * challenges instead of failing the whole unit.
 */
export function sanitizeUnitContent(content: UnitContent): { content: UnitContent; dropped: string[] } {
  const dropped: string[] = [];
  const keys = new Set(content.knowledge.map((k) => k.key));
  const challenges = content.challenges.filter((c) => {
    const problem = challengeProblem(c, keys);
    if (problem) dropped.push(`${c.mechanic} "${c.title}": ${problem}`);
    return !problem;
  });
  return { content: { ...content, challenges }, dropped };
}

function challengeProblem(c: ChallengeSpec, keys: Set<string>): string | null {
  if (c.knowledge_keys.length === 0) return "no knowledge keys";
  if (c.knowledge_keys.some((k) => !keys.has(k))) return "unknown knowledge key";
  switch (c.mechanic) {
    case "sequence":
      return c.steps.length >= 3 ? null : "needs at least 3 steps";
    case "chain":
      if (c.links.length < 3) return "needs at least 3 links";
      if (c.missing_index < 0 || c.missing_index >= c.links.length) return "missing_index out of range";
      return c.distractors.length >= 1 ? null : "needs distractors";
    case "sort": {
      if (c.buckets.length < 2 || c.items.length < 3) return "needs 2+ buckets and 3+ items";
      const buckets = new Set(c.buckets);
      return c.items.every((i) => buckets.has(i.bucket)) ? null : "item assigned to unknown bucket";
    }
    case "match":
      return c.pairs.length >= 3 ? null : "needs at least 3 pairs";
    case "scenario":
      return c.options.length >= 2 && c.options.filter((o) => o.correct).length === 1
        ? null
        : "needs exactly one correct option";
    case "spot_error":
      return c.statements.length >= 3 && c.wrong_index >= 0 && c.wrong_index < c.statements.length
        ? null
        : "wrong_index out of range";
    case "estimate":
      return c.min < c.max && c.answer >= c.min && c.answer <= c.max && c.tolerance >= 0
        ? null
        : "answer outside slider range";
    case "swipe":
      return c.cards.length >= 3 ? null : "needs at least 3 cards";
    case "teach_back":
      return c.key_points.length >= 1 ? null : "needs key points";
  }
}
