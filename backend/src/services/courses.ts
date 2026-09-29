import { randomUUID } from "node:crypto";
import type { Config } from "../config.js";
import type { ContentGenerator } from "../ai/generator.js";
import { sanitizeUnitContent, type UnitContent } from "../ai/schemas.js";
import type { CourseRow, DB, UnitRow } from "../db.js";
import { chunkDocument } from "../ingest/chunk.js";

export class NotFoundError extends Error {}
export class BadRequestError extends Error {}

export class CourseService {
  private inFlight = new Map<string, Promise<void>>();

  constructor(
    private db: DB,
    private generator: ContentGenerator,
    private config: Config,
    private log: (msg: string) => void = () => {},
  ) {
    // Units left "generating" by a previous process will never finish; requeue them.
    db.prepare(`UPDATE units SET status = 'pending' WHERE status = 'generating'`).run();
  }

  createCourse(userId: string, title: string, text: string, opts: { generate?: boolean } = {}): CourseRow {
    const sections = chunkDocument(text, this.config.unitTargetWords, this.config.maxUnits);
    if (sections.length === 0) throw new BadRequestError("The document has no readable text");
    const course: CourseRow = {
      id: randomUUID(),
      user_id: userId,
      title: title.trim() || "Untitled",
      source_words: sections.reduce((n, s) => n + s.words, 0),
      created_at: new Date().toISOString(),
    };
    const insertUnit = this.db.prepare(
      `INSERT INTO units (id, course_id, idx, heading, source_text) VALUES (?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      this.db
        .prepare(`INSERT INTO courses (id, user_id, title, source_words, created_at) VALUES (?, ?, ?, ?, ?)`)
        .run(course.id, course.user_id, course.title, course.source_words, course.created_at);
      sections.forEach((s, i) => insertUnit.run(randomUUID(), course.id, i, s.heading, s.text));
    })();
    if (opts.generate !== false) void this.ensureGenerated(course.id, this.config.generateAhead - 1);
    return course;
  }

  /** Stores already-generated content for a unit (used by the seed script and tests). */
  saveUnitContent(unit: UnitRow, content: UnitContent, generatorName: string): void {
    const { content: clean, dropped } = sanitizeUnitContent(content);
    if (dropped.length) this.log(`unit ${unit.idx} of ${unit.course_id}: dropped ${dropped.join("; ")}`);
    if (clean.challenges.length === 0) throw new Error("No usable challenges were generated");

    const keyToId = new Map(clean.knowledge.map((k) => [k.key, randomUUID()]));
    const insertKnowledge = this.db.prepare(
      `INSERT INTO knowledge_items (id, unit_id, course_id, key, type, title, explanation, source_quote)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertChallenge = this.db.prepare(
      `INSERT INTO challenges (id, unit_id, course_id, idx, mechanic, difficulty, spec, knowledge_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    this.db.transaction(() => {
      this.db.prepare(`DELETE FROM challenges WHERE unit_id = ?`).run(unit.id);
      this.db.prepare(`DELETE FROM knowledge_items WHERE unit_id = ?`).run(unit.id);
      for (const k of clean.knowledge) {
        insertKnowledge.run(keyToId.get(k.key), unit.id, unit.course_id, k.key, k.type, k.title, k.explanation, k.source_quote);
      }
      clean.challenges.forEach((c, i) => {
        const ids = [...new Set(c.knowledge_keys)].map((k) => keyToId.get(k)!);
        insertChallenge.run(randomUUID(), unit.id, unit.course_id, i, c.mechanic, c.difficulty, JSON.stringify(c), JSON.stringify(ids));
      });
      this.db
        .prepare(`UPDATE units SET status = 'ready', title = ?, hook = ?, generator = ?, error = NULL WHERE id = ?`)
        .run(clean.unit_title, clean.hook, generatorName, unit.id);
    })();
  }

  /**
   * Generates every unit up to and including `upToIdx` that isn't generated yet.
   * Generating lazily, a couple of units ahead of the learner, keeps long books cheap.
   */
  async ensureGenerated(courseId: string, upToIdx: number): Promise<void> {
    const units = this.db
      .prepare(`SELECT * FROM units WHERE course_id = ? AND idx <= ? AND status = 'pending' ORDER BY idx`)
      .all(courseId, upToIdx) as UnitRow[];
    await Promise.all(units.map((u) => this.generate(u)));
  }

  retryUnit(courseId: string, idx: number): void {
    const res = this.db
      .prepare(`UPDATE units SET status = 'pending', error = NULL WHERE course_id = ? AND idx = ? AND status = 'failed'`)
      .run(courseId, idx);
    if (res.changes === 0) throw new BadRequestError("Only failed units can be retried");
    void this.ensureGenerated(courseId, idx);
  }

  /** Resolves once any in-progress generation for the course finishes (handy for scripts and tests). */
  async settle(): Promise<void> {
    while (this.inFlight.size) await Promise.allSettled([...this.inFlight.values()]);
  }

  private generate(unit: UnitRow): Promise<void> {
    const existing = this.inFlight.get(unit.id);
    if (existing) return existing;
    const job = this.runGeneration(unit).finally(() => this.inFlight.delete(unit.id));
    this.inFlight.set(unit.id, job);
    return job;
  }

  private async runGeneration(unit: UnitRow): Promise<void> {
    this.db.prepare(`UPDATE units SET status = 'generating' WHERE id = ?`).run(unit.id);
    const course = this.db.prepare(`SELECT * FROM courses WHERE id = ?`).get(unit.course_id) as CourseRow;
    const unitCount = (this.db.prepare(`SELECT COUNT(*) AS n FROM units WHERE course_id = ?`).get(unit.course_id) as { n: number }).n;
    const previous = this.db
      .prepare(`SELECT COALESCE(title, heading) AS t FROM units WHERE course_id = ? AND idx < ? ORDER BY idx`)
      .all(unit.course_id, unit.idx) as { t: string | null }[];
    const started = Date.now();
    try {
      const content = await this.generator.generateUnit({
        courseTitle: course.title,
        unitIndex: unit.idx,
        unitCount,
        heading: unit.heading,
        previousUnitTitles: previous.map((p) => p.t).filter((t): t is string => !!t),
        text: unit.source_text,
      });
      this.saveUnitContent(unit, content, this.generator.name);
      this.log(`generated unit ${unit.idx} of "${course.title}" in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.db.prepare(`UPDATE units SET status = 'failed', error = ? WHERE id = ?`).run(message, unit.id);
      this.log(`failed to generate unit ${unit.idx} of "${course.title}": ${message}`);
    }
  }
}
