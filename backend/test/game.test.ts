import { describe, expect, it } from "vitest";
import { levelForXp, liveStreak, nextStreak } from "../src/game/progression.js";
import { nextState } from "../src/game/srs.js";

describe("spaced repetition", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  it("moves up a box and waits longer after a correct answer", () => {
    expect(nextState(0, true, now)).toEqual({ box: 1, dueAt: new Date("2026-01-02T12:00:00Z") });
    expect(nextState(2, true, now).dueAt).toEqual(new Date("2026-01-08T12:00:00Z"));
  });
  it("drops back and comes due immediately after a miss from a low box", () => {
    expect(nextState(1, false, now)).toEqual({ box: 0, dueAt: now });
    expect(nextState(4, false, now).box).toBe(2);
  });
});

describe("progression", () => {
  it("computes levels from XP", () => {
    expect(levelForXp(0).level).toBe(1);
    expect(levelForXp(49).level).toBe(1);
    expect(levelForXp(50).level).toBe(2);
    expect(levelForXp(150)).toEqual({ level: 3, levelStartXp: 150, nextLevelXp: 300 });
  });
  it("extends, keeps, and resets streaks", () => {
    expect(nextStreak(0, null, "2026-01-05")).toBe(1);
    expect(nextStreak(3, "2026-01-04", "2026-01-05")).toBe(4);
    expect(nextStreak(3, "2026-01-05", "2026-01-05")).toBe(3);
    expect(nextStreak(0, "2026-01-01", "2026-01-05")).toBe(1);
    expect(liveStreak(7, "2026-01-02", "2026-01-05")).toBe(0);
    expect(liveStreak(7, "2026-01-04", "2026-01-05")).toBe(7);
  });
});
