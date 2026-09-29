import { extractText as extractPdfText, getDocumentProxy } from "unpdf";

export class UnsupportedFileError extends Error {}

/** Pulls plain text out of an uploaded file. */
export async function extractText(filename: string, data: Buffer): Promise<string> {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "txt" || ext === "md" || ext === "markdown") {
    return data.toString("utf8");
  }
  if (ext === "pdf") {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    const { text } = await extractPdfText(pdf, { mergePages: false });
    return text.join("\n\n");
  }
  throw new UnsupportedFileError(`Unsupported file type ".${ext}". Upload a .pdf, .txt or .md file.`);
}
