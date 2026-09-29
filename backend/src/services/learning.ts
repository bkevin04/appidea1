import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { ContentGenerator } from "../ai/generator.js";
import {
  toChallenge,
  type Challenge,
  type ChallengeRow,
  type CourseRow,
  type DB,
  type KnowledgeRow,
  type MasteryRow,
  type SessionRow,
  type UnitRow,
  type UserRow,
} from "../db.js";
import { challengeSeed, clientView, gradeChallenge } from "../game/challenges.js";
import { levelForXp, liveStreak, nextStreak, utcDate } from "../game/progression.js";
import { nextState, stars } from "../game/srs.js";
import { BadRequestError, NotFoundError, type CourseService } from "./courses.js";

export class ConflictError extends Error {}

type UnitState = "completed" | "current" | "locked";

export class LearningService {
  constructor(
    private db: DB,
    private courses: CourseService,
    private generator: ContentGenerator,
    private config: Config,
    private now: () => Date = () => new Date(),
  ) {}

  // ---------- users ----------

  createUser(name: string): UserRow {
    const user: UserRow = {
      id: randomUUID(),
      name: name.trim() || "Learner",
      xp: 0,
      streak: 0,
      longest_streak: 0,
      last_active_date: null,
      created_at: this.now().toISOString(),
    };
    this.db
      .prepare(`INSERT INTO users (id, name, created_at) VALUES (?, ?, ?)`)
      .run(user.id, user.name, user.created_at);
    return user;
  }

  getUser(userId: string): UserRow | undefined {
    return this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as UserRow | undefined;
  }

  stats(userId: string) {
    const user = this.mustUser(userId);
    const today = utcDate(this.now());
    const todayXp = (
      this.db
        .prepare(`SELECT COALESCE(SUM(xp), 0) AS xp FROM answers WHERE user_id = ? AND substr(created_at, 1, 10) = ?`)
        .get(userId, today) as { xp: number }
    ).xp;
    return {
      id: user.id,
      name: user.name,
      xp: user.xp,
      ...levelForXp(user.xp),
      streak: liveStreak(user.streak, user.last_active_date, today),
      longestStreak: user.longest_streak,
      practicedToday: user.last_active_date === today,
      dailyGoal: { xp: todayXp, goal: this.config.dailyXpGoal, met: todayXp >= this.config.dailyXpGoal },
    };
  }

  // ---------- courses & the learning path ----------

  listCourses(userId: string) {
    const rows = this.db
      .prepare(`SELECT * FROM courses WHERE user_id = ? ORDER BY created_at DESC`)
      .all(userId) as CourseRow[];
    return rows.map((c) => {
      const path = this.path(userId, c.id);
      return {
        id: c.id,
        title: c.title,
        createdAt: c.created_at,
        unitCount: path.units.length,
        completedUnits: path.units.filter((u) => u.state === "completed").length,
        progress: path.progress,
      };
    });
  }

  path(userId: string, courseId: string) {
    const course = this.mustCourse(userId, courseId);
    const units = this.units(courseId);
    const knowledge = this.db
      .prepare(
        `SELECT k.unit_id, k.id, COALESCE(m.box, 0) AS box, COALESCE(m.correct, 0) AS correct
         FROM knowledge_items k LEFT JOIN mastery m ON m.knowledge_id = k.id AND m.user_id = ?
         WHERE k.course_id = ?`,
      )
      .all(userId, courseId) as { unit_id: string; id: string; box: number; correct: number }[];

    let reachedCurrent = false;
    const out = units.map((u) => {
      const items = knowledge.filter((k) => k.unit_id === u.id);
      const learned = items.filter((k) => k.correct > 0).length;
      const completed = u.status === "ready" && items.length > 0 && learned === items.length;
      let state: UnitState = "locked";
      if (completed && !reachedCurrent) state = "completed";
      else if (!reachedCurrent) {
        state = "current";
        reachedCurrent = true;
      }
      return {
        idx: u.idx,
        title: u.title ?? u.heading ?? `Unit ${u.idx + 1}`,
        hook: u.hook,
        status: u.status,
        error: u.error,
        state,
        ideas: items.length,
        ideasLearned: learned,
        stars: items.length ? Math.round((items.reduce((n, k) => n + stars(k.box), 0) / items.length) * 10) / 10 : 0,
      };
    });
    const totalIdeas = out.reduce((n, u) => n + u.ideas, 0);
    const learnedIdeas = out.reduce((n, u) => n + u.ideasLearned, 0);
    return {
      id: course.id,
      title: course.title,
      sourceWords: course.source_words,
      progress: out.length ? out.filter((u) => u.state === "completed").length / out.length : 0,
      ideasLearned: learnedIdeas,
      ideasTotal: totalIdeas,
      dueForReview: this.dueKnowledge(userId, courseId).length,
      units: out,
    };
  }

  /** The learner's "card collection": every idea in the course and how well they know it. */
  knowledge(userId: string, courseId: string) {
    this.mustCourse(userId, courseId);
    const rows = this.db
      .prepare(
        `SELECT k.*, u.idx AS unit_idx, COALESCE(m.box, 0) AS box, COALESCE(m.attempts, 0) AS attempts,
                COALESCE(m.correct, 0) AS correct_count, m.due_at
         FROM knowledge_items k JOIN units u ON u.id = k.unit_id
         LEFT JOIN mastery m ON m.knowledge_id = k.id AND m.user_id = ?
         WHERE k.course_id = ? ORDER BY u.idx, k.key`,
      )
      .all(userId, courseId) as (KnowledgeRow & {
      unit_idx: number;
      box: number;
      attempts: number;
      correct_count: number;
      due_at: string | null;
    })[];
    return rows.map((r) => ({
      id: r.id,
      unitIdx: r.unit_idx,
      type: r.type,
      title: r.title,
      explanation: r.explanation,
      sourceQuote: r.source_quote,
      stars: stars(r.box),
      unlocked: r.correct_count > 0,
      attempts: r.attempts,
      dueAt: r.due_at,
    }));
  }

  // ---------- sessions ----------

  /**
   * Builds one bite-sized daily session: a few reviews of ideas that are due
   * (spaced repetition), then new challenges from the current unit, ending on
   * the hardest one.
   */
  startSession(userId: string, courseId: string) {
    this.mustCourse(userId, courseId);
    const path = this.path(userId, courseId);
    const current = path.units.find((u) => u.state === "current");
    const units = this.units(courseId);

    if (current) {
      // Keep generation a step ahead of the learner.
      void this.courses.ensureGenerated(courseId, current.idx + this.config.generateAhead);
      if (current.status === "pending" || current.status === "generating") {
        throw new ConflictError("This unit is still being generated. Try again in a moment.");
      }
      if (current.status === "failed") {
        throw new ConflictError(`This unit failed to generate: ${current.error ?? "unknown error"}`);
      }
    }

    const size = this.config.sessionSize;
    const answered = this.answerHistory(userId, courseId);
    const due = this.dueKnowledge(userId, courseId);
    const picked: Challenge[] = [];
    const pickedIds = new Set<string>();
    const add = (c: Challenge) => {
      if (!pickedIds.has(c.id)) {
        picked.push(c);
        pickedIds.add(c.id);
      }
    };

    const currentUnit = current ? units.find((u) => u.idx === current.idx)! : undefined;
    const reviewPool = this.challenges(courseId).filter((c) => !currentUnit || c.unitId !== currentUnit.id);
    const reviewSlots = currentUnit ? Math.min(3, Math.floor(size / 3)) : size;

    // 1. Reviews: for each due idea, the challenge covering it that was answered least recently.
    for (const k of due) {
      if (picked.length >= reviewSlots) break;
      const options = reviewPool
        .filter((c) => c.knowledgeIds.includes(k.knowledge_id) && c.spec.mechanic !== "teach_back")
        .sort((a, b) => (answered.get(a.id)?.lastAt ?? "").localeCompare(answered.get(b.id)?.lastAt ?? ""));
      const choice = options.find((c) => !pickedIds.has(c.id) && !picked.some((p) => p.spec.mechanic === c.spec.mechanic)) ?? options[0];
      if (choice) add(choice);
    }

    // 2. New material from the current unit: unanswered first, then missed, in designed (easy -> hard) order.
    if (currentUnit) {
      const unitChallenges = this.challenges(courseId).filter((c) => c.unitId === currentUnit.id);
      const rank = (c: Challenge) => {
        const h = answered.get(c.id);
        return !h ? 0 : !h.everCorrect ? 1 : 2;
      };
      const ordered = [...unitChallenges].sort((a, b) => rank(a) - rank(b) || a.idx - b.idx);
      for (const c of ordered) {
        if (picked.length >= size) break;
        add(c);
      }
    } else {
      // Course finished: pure practice across everything, weakest first.
      for (const c of this.challenges(courseId).sort((a, b) => (answered.get(a.id)?.lastAt ?? "").localeCompare(answered.get(b.id)?.lastAt ?? ""))) {
        if (picked.length >= size) break;
        add(c);
      }
    }

    if (picked.length === 0) throw new ConflictError("There is nothing to practise yet.");

    // Reviews warm up, new material follows in designed order, teach-back is the finale.
    const reviews = picked.filter((c) => !currentUnit || c.unitId !== currentUnit.id);
    const fresh = picked.filter((c) => currentUnit && c.unitId === currentUnit.id).sort((a, b) => a.idx - b.idx);
    const ordered = [...reviews, ...fresh];
    const finale = ordered.filter((c) => c.spec.mechanic === "teach_back");
    const final = [...ordered.filter((c) => c.spec.mechanic !== "teach_back"), ...finale];

    const session: SessionRow = {
      id: randomUUID(),
      user_id: userId,
      course_id: courseId,
      unit_id: currentUnit?.id ?? final[0]!.unitId,
      challenge_ids: JSON.stringify(final.map((c) => c.id)),
      status: "active",
      xp: 0,
      created_at: this.now().toISOString(),
      completed_at: null,
    };
    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, course_id, unit_id, challenge_ids, status, xp, created_at)
         VALUES (?, ?, ?, ?, ?, 'active', 0, ?)`,
      )
      .run(session.id, userId, courseId, session.unit_id, session.challenge_ids, session.created_at);
    return this.sessionView(userId, session.id);
  }

  sessionView(userId: string, sessionId: string) {
    const session = this.mustSession(userId, sessionId);
    const ids = JSON.parse(session.challenge_ids) as string[];
    const byId = new Map(this.challengesByIds(ids).map((c) => [c.id, c]));
    const answers = this.db
      .prepare(`SELECT challenge_id, correct, xp FROM answers WHERE session_id = ?`)
      .all(sessionId) as { challenge_id: string; correct: number; xp: number }[];
    const answerMap = new Map(answers.map((a) => [a.challenge_id, a]));
    const unit = this.db.prepare(`SELECT * FROM units WHERE id = ?`).get(session.unit_id) as UnitRow;
    return {
      id: session.id,
      courseId: session.course_id,
      unit: { idx: unit.idx, title: unit.title ?? unit.heading ?? `Unit ${unit.idx + 1}` },
      status: session.status,
      xp: session.xp,
      answered: answers.length,
      total: ids.length,
      challenges: ids.map((id) => {
        const c = byId.get(id)!;
        const a = answerMap.get(id);
        return {
          ...clientView(c, challengeSeed(session.id, c.id)),
          isReview: c.unitId !== session.unit_id,
          result: a ? { correct: a.correct === 1, xp: a.xp } : null,
        };
      }),
    };
  }

  async answer(userId: string, sessionId: string, challengeId: string, response: unknown) {
    const session = this.mustSession(userId, sessionId);
    if (session.status !== "active") throw new ConflictError("This session is already finished");
    const ids = JSON.parse(session.challenge_ids) as string[];
    if (!ids.includes(challengeId)) throw new NotFoundError("That challenge is not part of this session");
    const already = this.db
      .prepare(`SELECT 1 FROM answers WHERE session_id = ? AND challenge_id = ?`)
      .get(sessionId, challengeId);
    if (already) throw new ConflictError("This challenge was already answered in this session");

    const challenge = this.challengesByIds([challengeId])[0]!;
    const knowledge = this.knowledgeByIds(challenge.knowledgeIds);
    const result = await gradeChallenge(challenge, challengeSeed(sessionId, challengeId), response, knowledge, this.generator);

    const now = this.now();
    const nowIso = now.toISOString();
    const getMastery = this.db.prepare(`SELECT * FROM mastery WHERE user_id = ? AND knowledge_id = ?`);
    const upsertMastery = this.db.prepare(
      `INSERT INTO mastery (user_id, knowledge_id, box, due_at, attempts, correct, last_seen_at, promoted_session_id, learned_session_id)
       VALUES (@user_id, @knowledge_id, @box, @due_at, @attempts, @correct, @last_seen_at, @promoted_session_id, @learned_session_id)
       ON CONFLICT (user_id, knowledge_id) DO UPDATE SET
         box = excluded.box, due_at = excluded.due_at, attempts = excluded.attempts,
         correct = excluded.correct, last_seen_at = excluded.last_seen_at, promoted_session_id = excluded.promoted_session_id,
         learned_session_id = COALESCE(mastery.learned_session_id, excluded.learned_session_id)`,
    );
    const masteryAfter: { id: string; title: string; stars: number }[] = [];

    this.db.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO answers (id, session_id, challenge_id, user_id, response, score, correct, xp, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(randomUUID(), sessionId, challengeId, userId, JSON.stringify(response), result.score, result.correct ? 1 : 0, result.xp, nowIso);
      for (const k of knowledge) {
        const prev = getMastery.get(userId, k.id) as MasteryRow | undefined;
        // An idea can only move up one box per session, however many challenges practise it.
        const alreadyPromoted = prev?.promoted_session_id === sessionId;
        const next =
          result.correct && alreadyPromoted && prev
            ? { box: prev.box, dueAt: new Date(prev.due_at) }
            : nextState(prev?.box ?? 0, result.correct, now);
        upsertMastery.run({
          user_id: userId,
          knowledge_id: k.id,
          box: next.box,
          due_at: next.dueAt.toISOString(),
          attempts: (prev?.attempts ?? 0) + 1,
          correct: (prev?.correct ?? 0) + (result.correct ? 1 : 0),
          last_seen_at: nowIso,
          promoted_session_id: result.correct ? sessionId : (prev?.promoted_session_id ?? null),
          learned_session_id: result.correct ? sessionId : null,
        });
        masteryAfter.push({ id: k.id, title: k.title, stars: stars(next.box) });
      }
      this.db.prepare(`UPDATE sessions SET xp = xp + ? WHERE id = ?`).run(result.xp, sessionId);
      this.db.prepare(`UPDATE users SET xp = xp + ? WHERE id = ?`).run(result.xp, userId);
    })();

    const answeredCount = (
      this.db.prepare(`SELECT COUNT(*) AS n FROM answers WHERE session_id = ?`).get(sessionId) as { n: number }
    ).n;
    return { ...result, mastery: masteryAfter, progress: { answered: answeredCount, total: ids.length } };
  }

  complete(userId: string, sessionId: string) {
    const session = this.mustSession(userId, sessionId);
    if (session.status === "completed") throw new ConflictError("This session is already finished");
    const answers = this.db
      .prepare(`SELECT correct FROM answers WHERE session_id = ?`)
      .all(sessionId) as { correct: number }[];
    if (answers.length === 0) throw new BadRequestError("Answer at least one challenge before finishing");

    const now = this.now();
    const today = utcDate(now);
    const user = this.mustUser(userId);
    const streak = nextStreak(liveStreak(user.streak, user.last_active_date, today), user.last_active_date, today);
    const total = (JSON.parse(session.challenge_ids) as string[]).length;
    const correct = answers.filter((a) => a.correct === 1).length;
    const perfect = answers.length === total && correct === total;
    const bonusXp = perfect ? 10 : 0;

    this.db.transaction(() => {
      this.db
        .prepare(`UPDATE sessions SET status = 'completed', completed_at = ?, xp = xp + ? WHERE id = ?`)
        .run(now.toISOString(), bonusXp, sessionId);
      this.db
        .prepare(
          `UPDATE users SET xp = xp + ?, streak = ?, longest_streak = MAX(longest_streak, ?), last_active_date = ? WHERE id = ?`,
        )
        .run(bonusXp, streak, streak, today, userId);
    })();

    const after = this.path(userId, session.course_id);
    const learnedHere = new Set(
      (
        this.db
          .prepare(
            `SELECT DISTINCT u.idx FROM mastery m JOIN knowledge_items k ON k.id = m.knowledge_id
             JOIN units u ON u.id = k.unit_id WHERE m.user_id = ? AND m.learned_session_id = ?`,
          )
          .all(userId, sessionId) as { idx: number }[]
      ).map((r) => r.idx),
    );
    const newlyCompleted = after.units.filter((u) => u.state === "completed" && learnedHere.has(u.idx));
    const finished = this.mustSession(userId, sessionId);
    return {
      xpEarned: finished.xp,
      perfectBonus: bonusXp,
      accuracy: answers.length ? correct / answers.length : 0,
      correct,
      answered: answers.length,
      total,
      streak,
      unitsCompleted: newlyCompleted.map((u) => ({ idx: u.idx, title: u.title })),
      nextUnit: after.units.find((u) => u.state === "current") ?? null,
      stats: this.stats(userId),
    };
  }

  // ---------- helpers ----------

  private mustUser(userId: string): UserRow {
    const u = this.getUser(userId);
    if (!u) throw new NotFoundError("User not found");
    return u;
  }

  private mustCourse(userId: string, courseId: string): CourseRow {
    const c = this.db.prepare(`SELECT * FROM courses WHERE id = ? AND user_id = ?`).get(courseId, userId) as
      | CourseRow
      | undefined;
    if (!c) throw new NotFoundError("Course not found");
    return c;
  }

  private mustSession(userId: string, sessionId: string): SessionRow {
    const s = this.db.prepare(`SELECT * FROM sessions WHERE id = ? AND user_id = ?`).get(sessionId, userId) as
      | SessionRow
      | undefined;
    if (!s) throw new NotFoundError("Session not found");
    return s;
  }

  private units(courseId: string): UnitRow[] {
    return this.db.prepare(`SELECT * FROM units WHERE course_id = ? ORDER BY idx`).all(courseId) as UnitRow[];
  }

  private challenges(courseId: string): Challenge[] {
    return (
      this.db.prepare(`SELECT * FROM challenges WHERE course_id = ? ORDER BY unit_id, idx`).all(courseId) as ChallengeRow[]
    ).map(toChallenge);
  }

  private challengesByIds(ids: string[]): Challenge[] {
    if (ids.length === 0) return [];
    const rows = this.db
      .prepare(`SELECT * FROM challenges WHERE id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as ChallengeRow[];
    return rows.map(toChallenge);
  }

  private knowledgeByIds(ids: string[]): KnowledgeRow[] {
    if (ids.length === 0) return [];
    return this.db
      .prepare(`SELECT * FROM knowledge_items WHERE id IN (${ids.map(() => "?").join(",")})`)
      .all(...ids) as KnowledgeRow[];
  }

  private dueKnowledge(userId: string, courseId: string): MasteryRow[] {
    return this.db
      .prepare(
        `SELECT m.* FROM mastery m JOIN knowledge_items k ON k.id = m.knowledge_id
         WHERE m.user_id = ? AND k.course_id = ? AND m.due_at <= ? AND m.correct > 0
         ORDER BY m.box ASC, m.due_at ASC`,
      )
      .all(userId, courseId, this.now().toISOString()) as MasteryRow[];
  }

  private answerHistory(userId: string, courseId: string): Map<string, { lastAt: string; everCorrect: boolean }> {
    const rows = this.db
      .prepare(
        `SELECT a.challenge_id, MAX(a.created_at) AS last_at, MAX(a.correct) AS ever_correct
         FROM answers a JOIN challenges c ON c.id = a.challenge_id
         WHERE a.user_id = ? AND c.course_id = ? GROUP BY a.challenge_id`,
      )
      .all(userId, courseId) as { challenge_id: string; last_at: string; ever_correct: number }[];
    return new Map(rows.map((r) => [r.challenge_id, { lastAt: r.last_at, everCorrect: r.ever_correct === 1 }]));
  }
}
