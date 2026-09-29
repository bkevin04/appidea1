/**
 * Leitner-style spaced repetition. Each knowledge item sits in a box; a correct
 * answer moves it up (longer wait before it comes back), a miss moves it down.
 */
export const INTERVAL_DAYS = [0, 1, 3, 7, 16, 35, 90] as const;
export const MAX_BOX = INTERVAL_DAYS.length - 1;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SrsState {
  box: number;
  dueAt: Date;
}

export function nextState(box: number, correct: boolean, now: Date): SrsState {
  const next = correct ? Math.min(box + 1, MAX_BOX) : Math.max(box - 2, 0);
  const dueAt = new Date(now.getTime() + INTERVAL_DAYS[next]! * DAY_MS);
  return { box: next, dueAt };
}

/** 0-5 stars shown to the learner for how well they know an idea. */
export function stars(box: number): number {
  return Math.min(box, 5);
}
