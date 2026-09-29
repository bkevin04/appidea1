import type { TeachBackGrade, UnitContent } from "./schemas.js";

export interface UnitInput {
  courseTitle: string;
  unitIndex: number;
  unitCount: number;
  heading: string | null;
  previousUnitTitles: string[];
  text: string;
}

export interface TeachBackInput {
  npcName: string;
  npcQuestion: string;
  keyPoints: string[];
  sourceQuotes: string[];
  answer: string;
}

/** Turns document text into game content. Swappable so tests and offline demos don't need an API key. */
export interface ContentGenerator {
  readonly name: string;
  generateUnit(input: UnitInput): Promise<UnitContent>;
  gradeTeachBack(input: TeachBackInput): Promise<TeachBackGrade>;
}

export class GenerationError extends Error {}
