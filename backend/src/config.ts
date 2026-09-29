try {
  process.loadEnvFile();
} catch {
  // No .env file; rely on the real environment.
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

function effort(name: string, fallback: Effort): Effort {
  const raw = process.env[name];
  return raw === "low" || raw === "medium" || raw === "high" || raw === "xhigh" || raw === "max" ? raw : fallback;
}

const provider = process.env.LLM_PROVIDER || (process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock");

export const config = {
  port: int("PORT", 3000),
  databasePath: process.env.DATABASE_PATH || "./data/app.db",
  llmProvider: provider === "anthropic" ? ("anthropic" as const) : ("mock" as const),
  claudeModel: process.env.CLAUDE_MODEL || "claude-opus-5-5",
  generationEffort: effort("GENERATION_EFFORT", "medium"),
  gradingEffort: effort("GRADING_EFFORT", "low"),
  generateAhead: int("GENERATE_AHEAD", 2),
  sessionSize: int("SESSION_SIZE", 8),
  dailyXpGoal: int("DAILY_XP_GOAL", 50),
  /** Target size of one learning unit, in words. */
  unitTargetWords: int("UNIT_TARGET_WORDS", 1800),
  maxUnits: int("MAX_UNITS", 60),
};

export type Config = typeof config;
