import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const [parserSource, recordsSource] = await Promise.all(
  ["./catasto-parser.js", "./catasto-records.js"].map(path => readFile(new URL(path, import.meta.url), "utf8"))
);
const context = { window: {}, crypto };
vm.createContext(context);
vm.runInContext(parserSource, context);
vm.runInContext(recordsSource, context);
const { CatastoParser, CatastoRecords } = context.window;
const plain = value => JSON.parse(JSON.stringify(value));

const transcription = [
  "Angelo Chiappetta, shepherd, age 30",
  "Tax base two.",
  "He lives in his own house in the Pajoli neighborhood bordering the property of Andrea Orrico.",
  "",
  "Andrea Orrico, day laborer, age 50",
  "Tax base two.",
  "He lives in his own house in the Pasolani neighborhood bordering Angelo Chiappetta."
].join("\n");

function storedProject(households, extra = {}) {
  return { id: "p", name: "P", sourceText: transcription, data: { households, record_id_version: 2, ...extra } };
}

test("malformed records are repaired, unrepairable ones removed, and each change reported", () => {
  const data = {
    households: [
      "not a record",
      { id: "a", household_head: "Paolo Rossi", source_pages: [3, "x"], residence: { place: 4, adjacent_to: "Anna" } },
      { id: "b", source_entry: "Anna Bruno, wife, age 30\nShe lives in her own house." },
      { id: "c" }
    ]
  };
  const changes = CatastoRecords.repairProjectData(data);
  assert.deepEqual(plain(data.households.map(record => record.household_head)), ["Paolo Rossi", "Anna Bruno"]);
  const [paolo] = data.households;
  assert.deepEqual(plain(paolo.source_pages), [3]);
  assert.equal(paolo.residence.place, null);
  assert.deepEqual(plain(paolo.residence.adjacent_to), []);
  assert.equal(paolo.members_text, "");
  assert.equal(changes.length, 6);
  assert.match(changes.join("\n"), /Record 1: has no household head or source entry and was removed/);
  assert.match(changes.join("\n"), /household head was missing; taken from the first source line \(“Anna Bruno”\)/);
});

test("ids shared by two records are not guessed: links to them are dropped and reported", () => {
  const data = {
    households: [
      { id: "same", household_head: "A" },
      { id: "same", household_head: "B" },
      { id: "c", household_head: "C", residence_links: [{ name: "A", household_id: "same", candidate_household_ids: ["same"] }] }
    ]
  };
  const report = CatastoRecords.convertToPermanentIds(data);
  assert.equal(new Set(data.households.map(record => record.id)).size, 3);
  assert.equal(data.households[2].residence_links[0].household_id, null);
  assert.equal(report.dropped.length, 3);
  assert.equal(CatastoRecords.convertToPermanentIds(data), null, "conversion runs once");
});

test("reparsing keeps ids, keeps edited records as they are, and updates unedited ones", () => {
  const parsed = CatastoParser.parsePlainText(transcription);
  const project = storedProject([
    { id: "h-angelo", household_head: "Angelo Chiappetta", source_entry: "old text", residence: { place: null, adjacent_to: [] }, source_pages: [] },
    { id: "h-andrea", household_head: "Andrea Orrico", source_entry: "Andrea Orrico, corrected", source_edited_at: "2026-10-01", residence: { place: "My correction", adjacent_to: [] }, source_pages: [] },
    { id: "h-gone", household_head: "Nobody Here", source_entry: "dropped", source_pages: [] }
  ]);
  const { data, summary } = CatastoRecords.planReparse(project, parsed);
  const [angelo, andrea] = data.households;
  assert.equal(angelo.id, "h-angelo");
  assert.equal(angelo.residence.place, "Pajoli");
  assert.equal(andrea.id, "h-andrea");
  assert.equal(andrea.residence.place, "My correction");
  assert.equal(andrea.source_entry, "Andrea Orrico, corrected");
  assert.equal(angelo.residence_links[0].household_id, "h-andrea", "links point at the kept ids");
  assert.equal(data.households.length, 2);
  assert.deepEqual(plain(summary), { matched: 2, keptEdits: 1, added: 0, removed: 1, keptUnmatchedEdits: 0, inferredPages: 0, keptPlaces: 0, neighborChanges: 1 });
  assert.equal(data.parser_version, CatastoParser.PARSER_VERSION);
});

test("an edited record the new parse no longer finds is kept, with page numbers guessed from its position marked inferred", () => {
  const parsed = CatastoParser.parsePlainText(`[[SOURCE_PAGE:7]]\n${transcription}`);
  const project = storedProject([
    { id: "h-renamed", household_head: "Angelo Ciappetta", source_entry: "edited by hand", source_edited_at: "2026-10-01", source_pages: [] },
    { id: "h-andrea", household_head: "Andrea Orrico", source_entry: "x", source_pages: [] }
  ]);
  const { data, summary } = CatastoRecords.planReparse(project, parsed);
  const kept = data.households.find(record => record.id === "h-renamed");
  assert.equal(kept.source_entry, "edited by hand");
  assert.deepEqual(plain(kept.source_pages), [7]);
  assert.equal(kept.source_pages_inferred, true);
  assert.equal(summary.keptUnmatchedEdits, 1);
  assert.equal(summary.added, 1);
});

test("only projects with their transcription and an older parser are offered a reparse", () => {
  assert.equal(CatastoRecords.needsReparse(storedProject([])), true);
  assert.equal(CatastoRecords.needsReparse(storedProject([], { parser_version: CatastoParser.PARSER_VERSION })), false);
  assert.equal(CatastoRecords.needsReparse({ ...storedProject([]), sourceText: "" }), false);
});

test("a project parsed before same-line section labels were read is offered the update, which adds the missed entry", () => {
  const italian = [
    "### **Casale Esempio 1760: Page 1**", "", "**Italian Transcription:**", "",
    "Bruno Ventrella bracciale — anni 44",
    "Abita in casa propria sita nel Borgo Alto, giusta li beni di Matteo Ferrandina.", "",
    "### **Casale Esempio 1760: Page 2** **Italian Transcription:**", "",
    "Matteo Ferrandina massaro — anni 50",
    "Abita in casa propria sita nel Piano, giusta li beni di Bruno Ventrella."
  ].join("\n");
  const fresh = CatastoParser.parsePlainText(italian, "it");
  assert.deepEqual(plain(fresh.households.map(record => record.household_head)), ["Bruno Ventrella", "Matteo Ferrandina"]);
  // What parser version 6 saved: only the first page's entry, here with a correction by the user.
  const project = {
    id: "p", name: "P", sourceText: italian,
    data: { parser_version: 6, record_id_version: 2, households: [{
      ...fresh.households[0], id: "h-bruno", source_edited_at: "2026-10-01", residence: { ...fresh.households[0].residence, place: "Corrected" }
    }] }
  };
  assert.equal(CatastoRecords.needsReparse(project), true);
  const { data, summary } = CatastoRecords.planReparse(project, fresh);
  assert.deepEqual(plain(data.households.map(record => record.household_head)), ["Bruno Ventrella", "Matteo Ferrandina"]);
  assert.equal(data.households[0].id, "h-bruno");
  assert.equal(data.households[0].residence.place, "Corrected");
  assert.equal(summary.added, 1);
  assert.equal(summary.keptEdits, 1);
});

test("a merged record claims every entry it merged, so an update does not bring the duplicate back", () => {
  const parsed = CatastoParser.parsePlainText(transcription);
  const [angelo, andrea] = parsed.households;
  const project = storedProject([{
    id: "h-merged", household_head: "Angelo Chiappetta", aliases: ["Andrea Orrico"],
    source_entries: [{ text: angelo.source_entry, pages: [] }, { text: andrea.source_entry, pages: [] }],
    source_entry: "combined", residence: { place: "Pajoli", adjacent_to: ["Andrea Orrico", "Angelo Chiappetta"] }
  }]);
  const { data, summary, uncertainMerges } = CatastoRecords.planReparse(project, parsed);
  assert.equal(data.households.length, 1);
  assert.equal(data.households[0].id, "h-merged");
  assert.deepEqual(plain(data.households[0].residence.adjacent_to), ["Andrea Orrico", "Angelo Chiappetta"]);
  assert.equal(summary.added, 0);
  assert.deepEqual(plain(uncertainMerges), []);
});

test("a merged entry found only by its head's name is reported as uncertain", () => {
  const parsed = CatastoParser.parsePlainText(transcription);
  const project = storedProject([{
    id: "h-merged", household_head: "Angelo Chiappetta",
    source_entries: [{ text: parsed.households[0].source_entry }, { text: "Andrea Orrico, day laborer, age 51\nreworded entry" }],
    source_entry: "combined"
  }]);
  const { data, uncertainMerges } = CatastoRecords.planReparse(project, parsed);
  assert.equal(data.households.length, 1);
  assert.deepEqual(plain(uncertainMerges), ["Angelo Chiappetta"]);
});

test("an unedited record keeps a stored residence place the new parse reads differently", () => {
  const parsed = CatastoParser.parsePlainText(transcription);
  const project = storedProject([
    { id: "h-angelo", household_head: "Angelo Chiappetta", source_entry: "x", residence: { place: "Corrected earlier", adjacent_to: ["Andrea Orrico"] } },
    { id: "h-andrea", household_head: "Andrea Orrico", source_entry: "y", residence: { place: null, adjacent_to: [] } }
  ]);
  const { data, summary, changes } = CatastoRecords.planReparse(project, parsed);
  assert.equal(data.households[0].residence.place, "Corrected earlier");
  assert.equal(summary.keptPlaces, 1);
  assert.deepEqual(plain(changes.find(change => change.kind === "place")), { head: "Andrea Orrico", kind: "place", from: null, to: "Pasolani" });
  assert.deepEqual(plain(changes.find(change => change.kind === "neighbors").added), ["Angelo Chiappetta"]);
});

test("duplicate ids in an import are replaced and links to them dropped, with a report", () => {
  const data = {
    record_id_version: 2,
    households: [
      { id: "same", household_head: "A" },
      { id: "same", household_head: "B" },
      { id: "c", household_head: "C", residence_links: [{ name: "A", household_id: "same", candidate_household_ids: ["same"] }] }
    ],
    duplicate_decisions: [{ key: "c|same", status: "separate" }]
  };
  const changes = CatastoRecords.repairProjectData(data);
  assert.equal(new Set(data.households.map(record => record.id)).size, 3);
  assert.equal(data.households[2].residence_links[0].household_id, null);
  assert.deepEqual(plain(data.duplicate_decisions), []);
  assert.equal(changes.length, 4);
});

test("planning the id conversion leaves the stored data untouched", () => {
  const data = { households: [{ id: "a", household_head: "A", residence_links: [{ name: "Gone", household_id: "gone" }] }] };
  const before = JSON.stringify(data);
  const plan = CatastoRecords.planPermanentIds(data);
  assert.equal(JSON.stringify(data), before);
  assert.equal(plan.dropped.length, 1);
  assert.match(plan.data.households[0].id, /^h-/);
});
