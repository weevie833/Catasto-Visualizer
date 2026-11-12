import { readFile } from "node:fs/promises";

// The private Marano source for the optional checks, named by CATASTO_VALIDATION_MD. It may be a
// transcription (.md or .txt), or a saved or exported project (.json), whose stored source text is
// used, so the checks run on the source the current project was built from. Returns null when unset.
export async function validationSource() {
  const path = process.env.CATASTO_VALIDATION_MD;
  if (!path) return null;
  const text = await readFile(path, "utf8");
  if (!/\.json$/i.test(path)) return text;
  const stored = JSON.parse(text);
  const project = stored.project || stored;
  if (typeof project.sourceText !== "string" || !project.sourceText) throw new Error(`${path} has no stored source text.`);
  return project.sourceText;
}
