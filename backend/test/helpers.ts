import type { ChallengeSpec } from "../src/ai/schemas.js";
import { config as baseConfig, type Config } from "../src/config.js";
import { openDb } from "../src/db.js";
import { MockGenerator } from "../src/ai/mockGenerator.js";
import { buildApp } from "../src/server.js";

export function testApp(opts: { now?: () => Date; config?: Partial<Config> } = {}) {
  const config: Config = { ...baseConfig, llmProvider: "mock", ...opts.config };
  const built = buildApp({ config, db: openDb(":memory:"), generator: new MockGenerator(), now: opts.now });
  const specOf = (challengeId: string) =>
    JSON.parse((built.db.prepare(`SELECT spec FROM challenges WHERE id = ?`).get(challengeId) as { spec: string }).spec) as ChallengeSpec;
  return { ...built, specOf };
}

export async function call<T = any>(
  app: ReturnType<typeof testApp>["app"],
  method: "GET" | "POST",
  url: string,
  userId?: string,
  body?: unknown,
): Promise<{ status: number; body: T }> {
  const res = await app.inject({
    method,
    url,
    headers: userId ? { "x-user-id": userId } : {},
    ...(body !== undefined ? { payload: body as object } : {}),
  });
  return { status: res.statusCode, body: res.json() as T };
}
