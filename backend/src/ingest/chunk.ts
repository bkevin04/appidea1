export interface Section {
  heading: string | null;
  text: string;
  words: number;
}

const HEADING = /^(?:#{1,3}\s+(.+)|((?:chapter|part|section|lesson|module)\s+[\w.:-]+.*))$/i;

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Splits a document into learning units of roughly `targetWords` each,
 * preferring the document's own headings as boundaries.
 */
export function chunkDocument(raw: string, targetWords: number, maxUnits: number): Section[] {
  const text = raw.replace(/\r\n?/g, "\n").trim();
  if (!text) return [];
  const total = countWords(text);
  const target = Math.max(targetWords, Math.ceil(total / maxUnits));
  const sections = mergeSmall(splitByHeadings(text).flatMap((s) => splitLarge(s, target)), target);
  return sections.slice(0, maxUnits);
}

function splitByHeadings(text: string): Section[] {
  const sections: Section[] = [];
  let heading: string | null = null;
  let lines: string[] = [];
  const flush = () => {
    const body = lines.join("\n").trim();
    if (body) sections.push({ heading, text: body, words: countWords(body) });
    lines = [];
  };
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    const m = trimmed.length <= 100 ? trimmed.match(HEADING) : null;
    if (m) {
      flush();
      heading = (m[1] ?? m[2] ?? trimmed).trim();
    } else {
      lines.push(line);
    }
  }
  flush();
  return sections;
}

function splitLarge(section: Section, target: number): Section[] {
  if (section.words <= target * 1.5) return [section];
  const paragraphs = section.text.split(/\n\s*\n/).flatMap((p) => splitParagraph(p, target));
  const parts: Section[] = [];
  let buf: string[] = [];
  let words = 0;
  const flush = () => {
    if (!buf.length) return;
    const body = buf.join("\n\n");
    parts.push({ heading: section.heading, text: body, words: countWords(body) });
    buf = [];
    words = 0;
  };
  for (const p of paragraphs) {
    const w = countWords(p);
    if (words > 0 && words + w > target) flush();
    buf.push(p);
    words += w;
  }
  flush();
  if (parts.length > 1 && section.heading) {
    parts.forEach((p, i) => (p.heading = `${section.heading} (part ${i + 1})`));
  }
  return parts;
}

/** Breaks an overly long paragraph (e.g. PDF text with no blank lines) on sentence boundaries. */
function splitParagraph(paragraph: string, target: number): string[] {
  if (countWords(paragraph) <= target) return [paragraph];
  const sentences = paragraph.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [paragraph];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if (buf && countWords(buf) + countWords(s) > target) {
      out.push(buf.trim());
      buf = "";
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

function mergeSmall(sections: Section[], target: number): Section[] {
  // Sections of a few hundred words already make a good bite-sized unit.
  const min = Math.min(Math.floor(target * 0.35), 150);
  const out: Section[] = [];
  for (const s of sections) {
    const prev = out[out.length - 1];
    if (prev && (prev.words < min || s.words < min) && prev.words + s.words <= target * 1.5) {
      prev.text = `${prev.text}\n\n${s.heading && s.heading !== prev.heading ? `${s.heading}\n\n` : ""}${s.text}`;
      prev.words += s.words;
      prev.heading = prev.heading ?? s.heading;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
