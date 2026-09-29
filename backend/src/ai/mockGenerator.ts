import type { ContentGenerator, TeachBackInput, UnitInput } from "./generator.js";
import type { ChallengeSpec, KnowledgeItemSpec, TeachBackGrade, UnitContent } from "./schemas.js";

/**
 * Offline stand-in for Claude. It builds playable (but simplistic) games from
 * sentence and keyword heuristics, so the whole app can run and be tested with
 * no API key. Real content quality comes from ClaudeGenerator.
 */
export class MockGenerator implements ContentGenerator {
  readonly name = "mock";

  async generateUnit(input: UnitInput): Promise<UnitContent> {
    const sentences = splitSentences(input.text);
    const freq = wordFrequencies(input.text);
    const picked = pickKeySentences(input.text, sentences, 5);
    const keyed = picked.map((s, i) => ({ sentence: s, keyword: keywordOf(s, freq) ?? `idea ${i + 1}` }));

    const knowledge: KnowledgeItemSpec[] = keyed.map((k, i) => ({
      key: `k${i + 1}`,
      type: "concept",
      title: capitalize(k.keyword),
      explanation: k.sentence,
      source_quote: k.sentence,
    }));
    const allKeys = knowledge.map((k) => k.key);
    const corrupt = (i: number) => corruptSentence(keyed, i);
    const others = sentences.filter((s) => !picked.includes(s));

    const challenges: ChallengeSpec[] = [];

    challenges.push({
      mechanic: "swipe",
      title: "Quick Check",
      prompt: "Swipe right if it's true, left if it's false.",
      cards: keyed.slice(0, 4).map((k, i) =>
        i % 2 === 0
          ? { text: k.sentence, is_true: true, why: "This is what the text says." }
          : { text: corrupt(i), is_true: false, why: `Actually: ${k.sentence}` },
      ),
      knowledge_keys: allKeys.slice(0, 4),
      difficulty: "easy",
      explanation: "Each card is either a line from the text or a subtly altered version of one.",
    });

    challenges.push({
      mechanic: "match",
      title: "Connect the Stars",
      prompt: "Link each keyword to the idea it completes.",
      pairs: keyed.slice(0, 4).map((k) => ({ left: capitalize(k.keyword), right: blankOut(k.sentence, k.keyword) })),
      knowledge_keys: allKeys.slice(0, 4),
      difficulty: "easy",
      explanation: "Each keyword fills the blank in one of the section's key ideas.",
    });

    challenges.push({
      mechanic: "sequence",
      title: "Rebuild the Story",
      prompt: "Put these ideas in the order the section builds them up.",
      steps: keyed.slice(0, 4).map((k) => k.sentence),
      knowledge_keys: allKeys.slice(0, 4),
      difficulty: "medium",
      explanation: "This is the order in which the section develops its argument.",
    });

    if (keyed.length >= 3) {
      const links = keyed.slice(0, Math.min(4, keyed.length)).map((k) => k.sentence);
      challenges.push({
        mechanic: "chain",
        title: "Missing Link",
        prompt: "One link in this chain of ideas is missing. Which one fits?",
        links,
        missing_index: 1,
        distractors: (others.length >= 2 ? others.slice(0, 2) : [corrupt(1), corrupt(2)]).map(shorten),
        knowledge_keys: allKeys.slice(0, links.length),
        difficulty: "medium",
        explanation: `The missing idea was: ${links[1]}`,
      });
    }

    const wrongIndex = Math.min(2, keyed.length - 1);
    challenges.push({
      mechanic: "spot_error",
      title: "Catch the Impostor",
      speaker: "Max",
      statements: keyed.slice(0, 4).map((k, i) => (i === wrongIndex ? corrupt(i) : k.sentence)),
      wrong_index: wrongIndex,
      correction: keyed[wrongIndex]!.sentence,
      knowledge_keys: [allKeys[wrongIndex]!],
      difficulty: "medium",
      explanation: `Max mixed things up. The text says: ${keyed[wrongIndex]!.sentence}`,
    });

    challenges.push({
      mechanic: "scenario",
      title: "Explain It to a Friend",
      character: "You are telling a friend what you just learned.",
      situation: `Your friend asks you about "${capitalize(keyed[0]!.keyword)}". You want to get it right.`,
      question: "What do you tell them?",
      options: [
        { text: keyed[0]!.sentence, correct: true, consequence: "Your friend nods. You nailed it." },
        { text: corrupt(0), correct: false, consequence: "Your friend later finds out that's not quite right." },
      ],
      knowledge_keys: [allKeys[0]!],
      difficulty: "hard",
      explanation: keyed[0]!.sentence,
    });

    const numeric = findNumberFact(sentences);
    if (numeric) {
      challenges.push({
        mechanic: "estimate",
        title: "Guess the Number",
        question: numeric.question,
        answer: numeric.value,
        min: 0,
        max: Math.max(100, Math.ceil(numeric.value * 2)),
        unit: numeric.unit,
        tolerance: Math.max(1, Math.round(numeric.value * 0.15)),
        knowledge_keys: [allKeys[0]!],
        difficulty: "medium",
        explanation: numeric.sentence,
      });
    }

    challenges.push({
      mechanic: "teach_back",
      title: "Teach the NPC",
      npc_name: "Pip",
      npc_question: `I keep hearing about "${capitalize(keyed[0]!.keyword)}" but I don't get it. Can you explain it to me?`,
      key_points: keyed.slice(0, 2).map((k) => k.sentence),
      knowledge_keys: allKeys.slice(0, 2),
      difficulty: "hard",
      explanation: "A strong explanation covers the section's first two key ideas.",
    });

    return {
      unit_title: input.heading ?? `Part ${input.unitIndex + 1}: ${capitalize(keyed[0]!.keyword)}`,
      hook: `Offline demo content for "${input.courseTitle}". Add an Anthropic API key for real games.`,
      knowledge,
      challenges,
    };
  }

  async gradeTeachBack(input: TeachBackInput): Promise<TeachBackGrade> {
    const answerWords = new Set(tokens(input.answer));
    const covered: string[] = [];
    const missed: string[] = [];
    for (const point of input.keyPoints) {
      const words = [...new Set(tokens(point))];
      const hits = words.filter((w) => answerWords.has(w)).length;
      (words.length > 0 && hits / words.length >= 0.3 ? covered : missed).push(point);
    }
    const score = input.keyPoints.length ? covered.length / input.keyPoints.length : 0;
    return {
      score,
      covered_points: covered,
      missed_points: missed,
      misconceptions: [],
      npc_reply:
        score >= 0.7
          ? `Oh, that makes sense now! Thanks!`
          : `Hmm, I think I'm still missing something. What about: ${missed[0] ?? "the main idea"}?`,
    };
  }
}

const STOPWORDS = new Set(
  "the a an and or but if then than that this these those with from into onto over under about after before when while where which what who whom whose why how your you they them their there here have has had having been being were was are is be to of in on at by for as it its not no can could would should will may might must also more most other some such only own same very just into each every both few many much our out off up down again further once because until during through above below between does did doing done".split(
    " ",
  ),
);

function tokens(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]+/g) ?? []).filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function wordFrequencies(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const t of tokens(text)) freq.set(t, (freq.get(t) ?? 0) + 1);
  return freq;
}

export function splitSentences(text: string): string[] {
  return (text.replace(/\s+/g, " ").match(/[^.!?]+[.!?]+/g) ?? [text])
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length >= 5 && s.split(" ").length <= 45);
}

function pickKeySentences(text: string, sentences: string[], max: number): string[] {
  // First qualifying sentence of each paragraph, in document order.
  const firsts: string[] = [];
  for (const para of text.split(/\n\s*\n/)) {
    const first = splitSentences(para)[0];
    if (first && !firsts.includes(first)) firsts.push(first);
  }
  const pool = firsts.length >= 3 ? firsts : sentences;
  const result = pool.slice(0, max);
  for (const s of sentences) {
    if (result.length >= 3) break;
    if (!result.includes(s)) result.push(s);
  }
  while (result.length < 3) result.push(result[0] ?? "This section has very little text to learn from.");
  return result;
}

function keywordOf(sentence: string, freq: Map<string, number>): string | null {
  let best: string | null = null;
  let bestScore = 0;
  for (const t of tokens(sentence)) {
    const score = (freq.get(t) ?? 0) * 10 + t.length;
    if (score > bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

function corruptSentence(keyed: { sentence: string; keyword: string }[], i: number): string {
  const target = keyed[i % keyed.length]!;
  const donor = keyed.find((k) => k.keyword !== target.keyword && !target.sentence.toLowerCase().includes(k.keyword));
  if (donor) {
    const swapped = target.sentence.replace(new RegExp(`\\b${escape(target.keyword)}\\b`, "i"), donor.keyword);
    if (swapped !== target.sentence) return swapped;
  }
  const negated = target.sentence.replace(/\b(is|are|can|will|does|do)\b/i, (m) => `${m} not`);
  return negated !== target.sentence ? negated : `It is a myth that ${lowerFirst(target.sentence)}`;
}

function blankOut(sentence: string, keyword: string): string {
  return sentence.replace(new RegExp(`\\b${escape(keyword)}\\b`, "gi"), "____");
}

function findNumberFact(sentences: string[]): { sentence: string; question: string; value: number; unit: string } | null {
  for (const s of sentences) {
    const m = s.match(/(\d+(?:\.\d+)?)\s?(%|percent|years?|days?|weeks?|times)?/);
    if (m && m[1]) {
      const value = Number.parseFloat(m[1]);
      if (!Number.isFinite(value) || value <= 0 || value > 100000) continue;
      const unit = m[2] === "percent" ? "%" : (m[2] ?? "");
      return { sentence: s, question: `Fill in the number: "${s.replace(m[0], "___")}"`, value, unit };
    }
  }
  return null;
}

function shorten(s: string): string {
  const words = s.split(" ");
  return words.length > 25 ? `${words.slice(0, 25).join(" ")}…` : s;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
