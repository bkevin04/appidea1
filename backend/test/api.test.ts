import { describe, expect, it } from "vitest";
import { HABITS_TEXT } from "../fixtures/habits.js";
import { call, testApp } from "./helpers.js";
import { solve } from "./solver.js";

async function playSession(t: ReturnType<typeof testApp>, userId: string, courseId: string, correct: (i: number) => boolean) {
  const { status, body: session } = await call(t.app, "POST", `/courses/${courseId}/sessions`, userId);
  expect(status).toBe(201);
  const results = [];
  for (const [i, ch] of session.challenges.entries()) {
    const response = solve(ch, t.specOf(ch.id), correct(i));
    const res = await call(t.app, "POST", `/sessions/${session.id}/answers`, userId, { challengeId: ch.id, response });
    expect(res.status).toBe(200);
    results.push(res.body);
  }
  const done = await call(t.app, "POST", `/sessions/${session.id}/complete`, userId);
  expect(done.status).toBe(200);
  return { session, results, summary: done.body };
}

describe("learning API", () => {
  it("requires a known user", async () => {
    const t = testApp();
    expect((await call(t.app, "GET", "/me")).status).toBe(401);
    expect((await call(t.app, "GET", "/me", "not-a-user")).status).toBe(401);
  });

  it("plays the sample course end to end: path, session, grading, XP, streak, unlocks, reviews", async () => {
    let now = new Date("2026-03-01T09:00:00Z");
    const t = testApp({ now: () => now });
    const { body: user } = await call(t.app, "POST", "/users", undefined, { name: "Kai" });

    const { status, body: course } = await call(t.app, "POST", "/courses/sample", user.id);
    expect(status).toBe(201);
    expect(course.units).toHaveLength(2);
    expect(course.units.map((u: any) => u.state)).toEqual(["current", "locked"]);
    expect(course.units[0].title).toBe("Inside the Habit Loop");

    // The client never sees answer keys.
    const { body: preview } = await call(t.app, "POST", `/courses/${course.id}/sessions`, user.id);
    const raw = JSON.stringify(preview);
    for (const secret of ['"correct"', "is_true", "wrong_index", "missing_index", "key_points", "bucket\""]) {
      expect(raw).not.toContain(secret);
    }
    expect(preview.challenges.at(-1).mechanic).toBe("teach_back");

    // Day 1: play unit 1 perfectly.
    const day1 = await playSession(t, user.id, course.id, () => true);
    expect(day1.results.every((r: any) => r.correct)).toBe(true);
    expect(day1.summary.accuracy).toBe(1);
    expect(day1.summary.perfectBonus).toBe(10);
    expect(day1.summary.streak).toBe(1);
    expect(day1.summary.unitsCompleted.map((u: any) => u.title)).toEqual(["Inside the Habit Loop"]);
    expect(day1.summary.nextUnit.title).toBe("Hack Your Habits");

    const scenario = day1.results.find((r: any) => r.reveal.consequence);
    expect(scenario.reveal.consequence).toMatch(/cue|urge|snack/i);

    const { body: me } = await call(t.app, "GET", "/me", user.id);
    expect(me.xp).toBe(day1.summary.xpEarned);
    expect(me.xp).toBeGreaterThan(0);
    expect(me.streak).toBe(1);

    const { body: cards } = await call(t.app, "GET", `/courses/${course.id}/knowledge`, user.id);
    expect(cards.filter((c: any) => c.unitIdx === 0).every((c: any) => c.unlocked && c.stars >= 1)).toBe(true);

    // Day 2: unit 1 ideas are due, so the session opens with reviews before unit 2.
    now = new Date("2026-03-02T09:00:00Z");
    const day2 = await playSession(t, user.id, course.id, (i) => i % 2 === 0);
    const reviews = day2.session.challenges.filter((c: any) => c.isReview);
    expect(reviews.length).toBeGreaterThan(0);
    expect(day2.session.challenges[0].isReview).toBe(true);
    expect(day2.summary.streak).toBe(2);
    expect(day2.results.some((r: any) => !r.correct)).toBe(true);

    // Day 5 after skipping two days: the streak restarts.
    now = new Date("2026-03-05T09:00:00Z");
    const day5 = await playSession(t, user.id, course.id, () => true);
    expect(day5.summary.streak).toBe(1);
  });

  it("promotes an idea once per session, even after an early miss", async () => {
    const t = testApp();
    const { body: user } = await call(t.app, "POST", "/users", undefined, {});
    const { body: course } = await call(t.app, "POST", "/courses/sample", user.id);
    // Miss the opening swipe (covers "Environment beats willpower"), then get everything else right.
    await playSession(t, user.id, course.id, (i) => i !== 0);
    const { body: cards } = await call(t.app, "GET", `/courses/${course.id}/knowledge`, user.id);
    const unit1 = cards.filter((c: any) => c.unitIdx === 0);
    expect(unit1.find((c: any) => c.title === "Environment beats willpower").stars).toBe(1);
    expect(unit1.every((c: any) => c.stars === 1)).toBe(true);
  });

  it("rejects double answers, bad responses and foreign sessions", async () => {
    const t = testApp();
    const { body: a } = await call(t.app, "POST", "/users", undefined, { name: "A" });
    const { body: b } = await call(t.app, "POST", "/users", undefined, { name: "B" });
    const { body: course } = await call(t.app, "POST", "/courses/sample", a.id);
    const { body: session } = await call(t.app, "POST", `/courses/${course.id}/sessions`, a.id);
    const ch = session.challenges[0];

    expect((await call(t.app, "POST", `/sessions/${session.id}/answers`, a.id, { challengeId: ch.id, response: { nope: 1 } })).status).toBe(400);
    const good = { challengeId: ch.id, response: solve(ch, t.specOf(ch.id)) };
    expect((await call(t.app, "POST", `/sessions/${session.id}/answers`, b.id, good)).status).toBe(404);
    expect((await call(t.app, "POST", `/sessions/${session.id}/answers`, a.id, good)).status).toBe(200);
    expect((await call(t.app, "POST", `/sessions/${session.id}/answers`, a.id, good)).status).toBe(409);
    expect((await call(t.app, "GET", `/courses/${course.id}`, b.id)).status).toBe(404);
  });

  it("turns pasted text into a playable course with the offline generator", async () => {
    const t = testApp({ config: { generateAhead: 1 } });
    const { body: user } = await call(t.app, "POST", "/users", undefined, { name: "Mo" });
    const { status, body: created } = await call(t.app, "POST", "/courses", user.id, { title: "Habits (mock)", text: HABITS_TEXT });
    expect(status).toBe(201);
    await t.courses.settle();

    const { body: course } = await call(t.app, "GET", `/courses/${created.id}`, user.id);
    // Only the first unit is generated up front; the rest waits until the learner gets close.
    expect(course.units.map((u: any) => u.status)).toEqual(["ready", "pending"]);

    const day1 = await playSession(t, user.id, created.id, () => true);
    expect(day1.results.length).toBeGreaterThanOrEqual(5);
    expect(day1.summary.unitsCompleted).toHaveLength(1);

    // Starting unit 2's session kicks off its generation.
    const early = await call(t.app, "POST", `/courses/${created.id}/sessions`, user.id);
    await t.courses.settle();
    if (early.status === 409) {
      expect(early.body.error).toMatch(/being generated/);
      expect((await call(t.app, "POST", `/courses/${created.id}/sessions`, user.id)).status).toBe(201);
    }
    const { body: after } = await call(t.app, "GET", `/courses/${created.id}`, user.id);
    expect(after.units[1].status).toBe("ready");
  });

  it("marks a unit as failed when generation fails and lets it be retried", async () => {
    const t = testApp();
    const original = t.generator.generateUnit.bind(t.generator);
    let fail = true;
    t.generator.generateUnit = async (input) => {
      if (fail) throw new Error("boom");
      return original(input);
    };
    const { body: user } = await call(t.app, "POST", "/users", undefined, {});
    const { body: created } = await call(t.app, "POST", "/courses", user.id, { title: "X", text: HABITS_TEXT });
    await t.courses.settle();
    const { body: course } = await call(t.app, "GET", `/courses/${created.id}`, user.id);
    expect(course.units[0].status).toBe("failed");
    expect((await call(t.app, "POST", `/courses/${created.id}/sessions`, user.id)).status).toBe(409);

    fail = false;
    expect((await call(t.app, "POST", `/courses/${created.id}/units/0/retry`, user.id)).status).toBe(200);
    await t.courses.settle();
    expect((await call(t.app, "POST", `/courses/${created.id}/sessions`, user.id)).status).toBe(201);
  });
});
