/** Level n needs 50 * (1 + 2 + ... + (n-1)) XP: 0, 50, 150, 300, 500, ... */
export function levelForXp(xp: number): { level: number; levelStartXp: number; nextLevelXp: number } {
  const level = Math.floor((1 + Math.sqrt(1 + (8 * Math.max(xp, 0)) / 50)) / 2);
  const threshold = (n: number) => (50 * n * (n - 1)) / 2;
  return { level, levelStartXp: threshold(level), nextLevelXp: threshold(level + 1) };
}

export function utcDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Returns the new streak after the learner is active on `today`. */
export function nextStreak(current: number, lastActiveDate: string | null, today: string): number {
  if (lastActiveDate === today) return Math.max(current, 1);
  const yesterday = utcDate(new Date(new Date(`${today}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000));
  return lastActiveDate === yesterday ? current + 1 : 1;
}

/** A streak shown to the user is broken once a full day has been skipped. */
export function liveStreak(streak: number, lastActiveDate: string | null, today: string): number {
  if (!lastActiveDate) return 0;
  const yesterday = utcDate(new Date(new Date(`${today}T00:00:00Z`).getTime() - 24 * 60 * 60 * 1000));
  return lastActiveDate === today || lastActiveDate === yesterday ? streak : 0;
}
