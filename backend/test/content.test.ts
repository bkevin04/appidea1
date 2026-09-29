import { describe, expect, it } from "vitest";
import { HABITS_TEXT, HABITS_UNITS } from "../fixtures/habits.js";
import { MockGenerator } from "../src/ai/mockGenerator.js";
import { sanitizeUnitContent, UnitContentSchema, type UnitContent } from "../src/ai/schemas.js";
import { chunkDocument } from "../src/ingest/chunk.js";

describe("unit content schema", () => {
  it("accepts the hand-written sample course without dropping anything", () => {
    for (const unit of HABITS_UNITS) {
      expect(() => UnitContentSchema.parse(unit)).not.toThrow();
      expect(sanitizeUnitContent(unit).dropped).toEqual([]);
    }
  });

  it("drops challenges that break cross-field rules", () => {
    const unit = structuredClone(HABITS_UNITS[0]!) as UnitContent;
    const scenario = unit.challenges.find((c) => c.mechanic === "scenario")!;
    if (scenario.mechanic === "scenario") scenario.options.forEach((o) => (o.correct = true));
    unit.challenges[0]!.knowledge_keys = ["nope"];
    const { content, dropped } = sanitizeUnitContent(unit);
    expect(dropped).toHaveLength(2);
    expect(content.challenges).toHaveLength(HABITS_UNITS[0]!.challenges.length - 2);
  });
});

describe("chunkDocument", () => {
  it("splits on headings", () => {
    const sections = chunkDocument(HABITS_TEXT, 1800, 60);
    expect(sections.map((s) => s.heading)).toEqual(["The Habit Loop", "Building and Breaking Habits"]);
  });

  it("splits long text without headings into several units", () => {
    const paragraph = "Plants turn sunlight into sugar through photosynthesis. ".repeat(40);
    const text = Array.from({ length: 10 }, () => paragraph).join("\n\n");
    const sections = chunkDocument(text, 500, 60);
    expect(sections.length).toBeGreaterThan(3);
    for (const s of sections) expect(s.words).toBeLessThanOrEqual(750);
  });

  it("caps the number of units for very long documents", () => {
    const text = Array.from({ length: 200 }, (_, i) => `# Chapter ${i}\n\n${"word ".repeat(300)}`).join("\n\n");
    expect(chunkDocument(text, 300, 20).length).toBeLessThanOrEqual(20);
  });
});

describe("MockGenerator", () => {
  it("produces valid, playable content from arbitrary text", async () => {
    const content = await new MockGenerator().generateUnit({
      courseTitle: "Test",
      unitIndex: 0,
      unitCount: 1,
      heading: "The Habit Loop",
      previousUnitTitles: [],
      text: chunkDocument(HABITS_TEXT, 1800, 60)[0]!.text,
    });
    expect(() => UnitContentSchema.parse(content)).not.toThrow();
    const { dropped, content: clean } = sanitizeUnitContent(content);
    expect(dropped).toEqual([]);
    expect(new Set(clean.challenges.map((c) => c.mechanic)).size).toBeGreaterThanOrEqual(5);
  });
});
