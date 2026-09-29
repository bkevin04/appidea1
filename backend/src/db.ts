import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ChallengeSpec } from "./ai/schemas.js";

export type DB = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_active_date TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  source_words INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS units (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  heading TEXT,
  source_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | generating | ready | failed
  title TEXT,
  hook TEXT,
  generator TEXT,
  error TEXT,
  UNIQUE (course_id, idx)
);

CREATE TABLE IF NOT EXISTS knowledge_items (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  source_quote TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS challenges (
  id TEXT PRIMARY KEY,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  mechanic TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  spec TEXT NOT NULL,          -- JSON ChallengeSpec, including the answer key
  knowledge_ids TEXT NOT NULL  -- JSON string[]
);

CREATE TABLE IF NOT EXISTS mastery (
  user_id TEXT NOT NULL REFERENCES users(id),
  knowledge_id TEXT NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  box INTEGER NOT NULL DEFAULT 0,
  due_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  correct INTEGER NOT NULL DEFAULT 0,
  last_seen_at TEXT,
  promoted_session_id TEXT, -- last session that moved the idea up a box
  learned_session_id TEXT, -- session in which the idea was first answered correctly
  PRIMARY KEY (user_id, knowledge_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  unit_id TEXT NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  challenge_ids TEXT NOT NULL, -- JSON string[]
  status TEXT NOT NULL DEFAULT 'active', -- active | completed
  xp INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  completed_at TEXT
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id),
  response TEXT NOT NULL,
  score REAL NOT NULL,
  correct INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (session_id, challenge_id)
);

CREATE INDEX IF NOT EXISTS idx_units_course ON units(course_id, idx);
CREATE INDEX IF NOT EXISTS idx_challenges_unit ON challenges(unit_id, idx);
CREATE INDEX IF NOT EXISTS idx_knowledge_unit ON knowledge_items(unit_id);
CREATE INDEX IF NOT EXISTS idx_mastery_due ON mastery(user_id, due_at);
CREATE INDEX IF NOT EXISTS idx_answers_user ON answers(user_id, created_at);
`;

export function openDb(path: string): DB {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

export interface UserRow {
  id: string;
  name: string;
  xp: number;
  streak: number;
  longest_streak: number;
  last_active_date: string | null;
  created_at: string;
}

export interface CourseRow {
  id: string;
  user_id: string;
  title: string;
  source_words: number;
  created_at: string;
}

export type UnitStatus = "pending" | "generating" | "ready" | "failed";

export interface UnitRow {
  id: string;
  course_id: string;
  idx: number;
  heading: string | null;
  source_text: string;
  status: UnitStatus;
  title: string | null;
  hook: string | null;
  generator: string | null;
  error: string | null;
}

export interface KnowledgeRow {
  id: string;
  unit_id: string;
  course_id: string;
  key: string;
  type: string;
  title: string;
  explanation: string;
  source_quote: string;
}

export interface ChallengeRow {
  id: string;
  unit_id: string;
  course_id: string;
  idx: number;
  mechanic: string;
  difficulty: string;
  spec: string;
  knowledge_ids: string;
}

export interface Challenge {
  id: string;
  unitId: string;
  courseId: string;
  idx: number;
  spec: ChallengeSpec;
  knowledgeIds: string[];
}

export function toChallenge(row: ChallengeRow): Challenge {
  return {
    id: row.id,
    unitId: row.unit_id,
    courseId: row.course_id,
    idx: row.idx,
    spec: JSON.parse(row.spec) as ChallengeSpec,
    knowledgeIds: JSON.parse(row.knowledge_ids) as string[],
  };
}

export interface MasteryRow {
  user_id: string;
  knowledge_id: string;
  box: number;
  due_at: string;
  attempts: number;
  correct: number;
  last_seen_at: string | null;
  promoted_session_id: string | null;
  learned_session_id: string | null;
}

export interface SessionRow {
  id: string;
  user_id: string;
  course_id: string;
  unit_id: string;
  challenge_ids: string;
  status: "active" | "completed";
  xp: number;
  created_at: string;
  completed_at: string | null;
}
