import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ClaudeGenerator } from "./ai/claudeGenerator.js";
import { GenerationError, type ContentGenerator } from "./ai/generator.js";
import { MockGenerator } from "./ai/mockGenerator.js";
import type { Config } from "./config.js";
import { openDb, type DB, type UnitRow } from "./db.js";
import { InvalidResponseError } from "./game/challenges.js";
import { HABITS_TEXT, HABITS_TITLE, HABITS_UNITS } from "../fixtures/habits.js";
import { extractText, UnsupportedFileError } from "./ingest/extract.js";
import { BadRequestError, CourseService, NotFoundError } from "./services/courses.js";
import { ConflictError, LearningService } from "./services/learning.js";

const here = dirname(fileURLToPath(import.meta.url));

export interface AppDeps {
  config: Config;
  db?: DB;
  generator?: ContentGenerator;
  now?: () => Date;
  logger?: boolean;
}

export function buildApp(deps: AppDeps) {
  const { config } = deps;
  const db = deps.db ?? openDb(config.databasePath);
  const generator = deps.generator ?? (config.llmProvider === "anthropic" ? new ClaudeGenerator(config) : new MockGenerator());
  const app = Fastify({ logger: deps.logger ?? false, bodyLimit: 20 * 1024 * 1024 });
  const courses = new CourseService(db, generator, config, (msg) => app.log.info(msg));
  const learning = new LearningService(db, courses, generator, config, deps.now);

  app.register(fastifyMultipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1 } });
  app.register(fastifyStatic, { root: join(here, "..", "public") });

  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof NotFoundError) return reply.code(404).send({ error: error.message });
    if (error instanceof ConflictError) return reply.code(409).send({ error: error.message });
    if (
      error instanceof BadRequestError ||
      error instanceof InvalidResponseError ||
      error instanceof UnsupportedFileError ||
      error instanceof z.ZodError
    ) {
      const message = error instanceof z.ZodError ? (error.issues[0]?.message ?? "Invalid request") : error.message;
      return reply.code(400).send({ error: message });
    }
    if (error instanceof GenerationError) return reply.code(502).send({ error: error.message });
    const status = (error as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.code(status).send({ error: (error as Error).message });
    app.log.error(error);
    return reply.code(500).send({ error: "Something went wrong" });
  });

  /** Minimal identity for now: the app sends the user id it got from POST /users. Real auth comes later. */
  function userId(req: FastifyRequest): string {
    const id = req.headers["x-user-id"];
    if (typeof id !== "string" || !learning.getUser(id)) {
      throw Object.assign(new Error("Missing or unknown x-user-id header"), { statusCode: 401 });
    }
    return id;
  }

  const params = <T extends z.ZodRawShape>(shape: T) => z.object(shape);

  app.get("/health", async () => ({ ok: true, generator: generator.name, model: generator.name === "anthropic" ? config.claudeModel : null }));

  app.post("/users", async (req, reply) => {
    const body = z.object({ name: z.string().max(80).default("Learner") }).parse(req.body ?? {});
    reply.code(201);
    return learning.createUser(body.name);
  });

  app.get("/me", async (req) => learning.stats(userId(req)));

  app.get("/courses", async (req) => learning.listCourses(userId(req)));

  app.post("/courses", async (req, reply) => {
    const uid = userId(req);
    const body = z.object({ title: z.string().max(200), text: z.string().min(50, "Paste at least a paragraph of text") }).parse(req.body);
    const course = courses.createCourse(uid, body.title, body.text);
    reply.code(201);
    return learning.path(uid, course.id);
  });

  app.post("/courses/upload", async (req: FastifyRequest, reply: FastifyReply) => {
    const uid = userId(req);
    const file = await req.file();
    if (!file) throw new BadRequestError("Attach a file in the 'file' field");
    const text = await extractText(file.filename, await file.toBuffer());
    const titleField = file.fields.title;
    const title =
      titleField && !Array.isArray(titleField) && titleField.type === "field" && typeof titleField.value === "string" && titleField.value.trim()
        ? titleField.value
        : file.filename.replace(/\.[^.]+$/, "");
    const course = courses.createCourse(uid, title, text);
    reply.code(201);
    return learning.path(uid, course.id);
  });

  /** Adds the built-in sample course (hand-written game content), so the app can be tried without an API key. */
  app.post("/courses/sample", async (req, reply) => {
    const uid = userId(req);
    const course = createSampleCourse(uid);
    reply.code(201);
    return learning.path(uid, course.id);
  });

  function createSampleCourse(uid: string) {
    const course = courses.createCourse(uid, HABITS_TITLE, HABITS_TEXT, { generate: false });
    const units = db.prepare(`SELECT * FROM units WHERE course_id = ? ORDER BY idx`).all(course.id) as UnitRow[];
    units.forEach((u, i) => {
      const content = HABITS_UNITS[i];
      if (content) courses.saveUnitContent(u, content, "sample");
    });
    return course;
  }

  app.get("/courses/:courseId", async (req) => {
    const { courseId } = params({ courseId: z.string() }).parse(req.params);
    return learning.path(userId(req), courseId);
  });

  app.get("/courses/:courseId/knowledge", async (req) => {
    const { courseId } = params({ courseId: z.string() }).parse(req.params);
    return learning.knowledge(userId(req), courseId);
  });

  app.post("/courses/:courseId/units/:idx/retry", async (req) => {
    const { courseId, idx } = params({ courseId: z.string(), idx: z.coerce.number().int() }).parse(req.params);
    const uid = userId(req);
    learning.path(uid, courseId); // ownership check
    courses.retryUnit(courseId, idx);
    return learning.path(uid, courseId);
  });

  app.post("/courses/:courseId/sessions", async (req, reply) => {
    const { courseId } = params({ courseId: z.string() }).parse(req.params);
    reply.code(201);
    return learning.startSession(userId(req), courseId);
  });

  app.get("/sessions/:sessionId", async (req) => {
    const { sessionId } = params({ sessionId: z.string() }).parse(req.params);
    return learning.sessionView(userId(req), sessionId);
  });

  app.post("/sessions/:sessionId/answers", async (req) => {
    const { sessionId } = params({ sessionId: z.string() }).parse(req.params);
    const body = z.object({ challengeId: z.string(), response: z.unknown() }).parse(req.body);
    return learning.answer(userId(req), sessionId, body.challengeId, body.response);
  });

  app.post("/sessions/:sessionId/complete", async (req) => {
    const { sessionId } = params({ sessionId: z.string() }).parse(req.params);
    return learning.complete(userId(req), sessionId);
  });

  return { app, db, courses, learning, generator, createSampleCourse };
}
