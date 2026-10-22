import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./catasto-storage.js", import.meta.url), "utf8");
const context = {
  window: {},
  crypto: { randomUUID: () => "restored-project-id" }
};
vm.runInNewContext(source, context);
const { createProject, projectsFromImport, serializeProject } = context.window.CatastoStorage;

test("an exported JSON backup restores source text and corrected household data", () => {
  const data = {
    households: [{ id: "giuseppe-covello", household_head: "Giuseppe Covello", residence: { place: "San Nicola" } }]
  };
  const original = createProject({
    name: "Marano Marchesato · 1754",
    sourceFile: "transcription.md",
    sourceText: "Giuseppe Covello, age 40",
    data
  });
  const [restored] = projectsFromImport(JSON.parse(serializeProject(original)), "backup");

  assert.equal(restored.name, original.name);
  assert.equal(restored.sourceFile, original.sourceFile);
  assert.equal(restored.sourceText, original.sourceText);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.data)), data);
});
