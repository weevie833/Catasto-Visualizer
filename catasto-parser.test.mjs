import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./catasto-parser.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const { inferFamilyRelationships, parsePlainText } = context.window.CatastoParser;

test("children of a widow inherit the deceased husband's surname", () => {
  const result = inferFamilyRelationships([
    "Fulvia Covello, widow of Antonio Porro — age 35",
    "Tommaso, son — age 6",
    "Antonia, daughter — age 13"
  ]);

  assert.deepEqual([...result.members], [
    "Fulvia Covello, widow of Antonio Porro — age 35",
    "Tommaso Porro, son — age 6",
    "Antonia Porro, daughter — age 13"
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(result.relationships)), [
    { person: "Tommaso Porro", relationship: "son", mother: "Fulvia Covello", father: "Antonio Porro" },
    { person: "Antonia Porro", relationship: "daughter", mother: "Fulvia Covello", father: "Antonio Porro" }
  ]);
});

test("explicit child surnames are preserved and Italian widow wording is supported", () => {
  const result = inferFamilyRelationships([
    "Fulvia Covello vedova di Antonio Porro — anni 35",
    "Tommaso Russo, figlio — anni 6",
    "Antonia figlia — anni 13"
  ]);

  assert.equal(result.members[1], "Tommaso Russo, figlio — anni 6");
  assert.equal(result.members[2], "Antonia Porro figlia — anni 13");
});

test("ordinary households keep using their existing member lines", () => {
  const lines = ["Marzio di Luca, laborer — age 40", "Andrea, son — age 10"];
  assert.deepEqual([...inferFamilyRelationships(lines).members], lines);
});

test("plain-text parsing stores inferred names and parent relationships", () => {
  const record = parsePlainText(`Fulvia Covello, widow of Antonio Porro — age 35
Tommaso, son — age 6
Antonia, daughter — age 13
She lives in her own house situated in San Nicola.`).households[0];

  assert.match(record.members_text, /Tommaso Porro/);
  assert.equal(record.family_relationships[1].father, "Antonio Porro");
});

test("bilingual source headings are retained as source-page metadata", () => {
  const data = parsePlainText(`**Marano Marchesato 1754: Page 142**
Italian Transcription
Testo italiano
English Translation

Marzio di Luca, laborer — age 40
Andrea, son — age 10
He lives in San Nicola.`);

  assert.equal(data.source_title, "Marano Marchesato 1754");
  assert.deepEqual([...data.households[0].source_pages], [142]);
  assert.doesNotMatch(data.households[0].source_entry, /SOURCE_PAGE/);
});

test("financial language after a boundary clause is never treated as a neighbor", () => {
  const record = parsePlainText(`Andrea Costabile, a day laborer, aged 45
Anna Covello, his wife, aged 42
He lives in his own house in San Nicola, bordering Giuseppe Morello and Natale Costabile; the annual income is estimated at six ducats.`).households[0];

  assert.deepEqual([...record.residence.adjacent_to], ["Giuseppe Morello", "Natale Costabile"]);
  assert.equal(record.residence.adjacent_to.some(name => /income|ducats/i.test(name)), false);
});

test("same-name household heads and their members receive separate household-scoped identities", () => {
  const data = parsePlainText(`Giacomo Covello, day laborer — age 61
Matteo, son — age 26
He lives in San Nicola.

Giacomo Covello, son of the late Antonio, shepherd — age 52
Carmine, son — age 16
He lives in San Nicola.`);

  assert.equal(data.households[0].id, "giacomo-covello");
  assert.equal(data.households[1].id, "giacomo-covello-2");
  assert.equal(data.households[0].member_identities[0].id, "giacomo-covello");
  assert.equal(data.households[0].member_identities[1].id, "giacomo-covello-member-01");
  assert.equal(data.households[1].member_identities[1].id, "giacomo-covello-2-member-01");
  assert.equal(data.households[1].member_identities[1].household_id, "giacomo-covello-2");
});

test("an ambiguous same-name neighbor is resolved through a shared residence neighbor", () => {
  const data = parsePlainText(`Giacomo Covello, day laborer — age 61
Diana Bartella, wife — age 50
He lives in his own house situated in San Nicola, bordering Marco Covello and the public road.

Giacomo Covello, son of the late Antonio, shepherd — age 52
Fulvia Todaro, wife — age 40
He lives in his own house situated in San Nicola, bordering Ursula Salerno and the public road.

Marco Todaro, day laborer — age 35
Angela Covello, wife — age 34
He lives in his own house situated in San Nicola, bordering Ursula Salerno and Giacomo Covello.`);

  const marco = data.households.find(record => record.household_head === "Marco Todaro");
  const giacomoLink = marco.residence_links.find(link => link.name === "Giacomo Covello");
  assert.equal(giacomoLink.household_id, "giacomo-covello-2");
  assert.equal(giacomoLink.resolution_status, "inferred");
  assert.equal(giacomoLink.resolution_method, "shared-neighbor-triangulation");
  assert.equal(giacomoLink.confidence, "high");
  assert.match(giacomoLink.resolution_evidence.join(" "), /Ursula Salerno/);
});

test("a neighbor inherits a parent's surname without creating a kinship fragment", () => {
  const record = parsePlainText(`Sister Maria Covello, domestic nun — age 50
She possesses the house where she lives in the place called San Nicola bordering the property of Lucrezia, daughter of Anna Capizzano.`).households[0];

  assert.equal(record.residence.place, "San Nicola");
  assert.deepEqual([...record.residence.adjacent_to], ["Lucrezia Capizzano"]);
});

test("a qualified neighbor with an existing surname keeps only the person's name", () => {
  const record = parsePlainText(`Marchesa Ruffulo, widow — age 50
She lives in her own house situated in San Nicola, bordering Marzio Tenuta and Giacomo Covello, son of the late Antonio.`).households[0];

  assert.deepEqual([...record.residence.adjacent_to], ["Marzio Tenuta", "Giacomo Covello"]);
});

test("a new household starts after non-residence narrative text", () => {
  const data = parsePlainText(`Antonio Primo, laborer — age 40
Lucia Russo, wife — age 35
Taxable heads: two.
He possesses a vineyard in San Nicola.
In total — 12 ounces.

Marco Secondo, shepherd — age 30
Anna Bruno, wife — age 25
He possesses a garden in Li Pasolani.`);

  assert.equal(data.households.length, 2);
  assert.equal(data.households[0].household_head, "Antonio Primo");
  assert.equal(data.households[1].household_head, "Marco Secondo");
});

test("dependent members remain with a household when its list continues across a page", () => {
  const data = parsePlainText(`Antonio Ziccarello, shepherd — age 36
Orsola Ruffulo, wife — age 30
Cash assets
[[SOURCE_PAGE:10]]
Gennaro, his brother, shepherd — age 32
Lorenzo Ruffulo, his brother-in-law, shepherd — age 25
Taxable heads: two.
He lives in San Nicola.

Marco Todaro, laborer — age 35
Angela Covello, wife — age 34
He lives in San Nicola.`);

  assert.equal(data.households.length, 2);
  assert.match(data.households[0].members_text, /Gennaro/);
  assert.match(data.households[0].members_text, /Lorenzo Ruffulo/);
  assert.equal(data.households[1].household_head, "Marco Todaro");
});

test("religious titles and daughter-of qualifiers can begin independent households", () => {
  const data = parsePlainText(`Marchesa Belmonte, widow — age 35
Gaetano, son — age 9
She possesses a house in San Nicola.

Sister Maria Covello, domestic nun — age 50
She possesses a house in San Nicola.

Matalena Orrico, daughter of the late Andrea, head of household — age 18
She possesses a house in San Nicola.`);

  assert.deepEqual([...data.households.map(record => record.household_head)], [
    "Marchesa Belmonte",
    "Sister Maria Covello",
    "Matalena Orrico"
  ]);
});

test("relationship words before the comma remain dependent household members", () => {
  const data = parsePlainText(`Beno Russo, laborer — age 30
Taxable heads: two.
Michele brother, laborer — age 16
Anna di Bartolo mother — age 50
He lives in San Nicola.

Marco Todaro, laborer — age 35
He lives in San Nicola.`);

  assert.equal(data.households.length, 2);
  assert.match(data.households[0].members_text, /Michele brother/);
  assert.match(data.households[0].members_text, /Anna di Bartolo mother/);
});
