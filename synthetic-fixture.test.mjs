import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Runs the parser and both exports on test-fixtures/synthetic-catasto.md, an invented bilingual
// transcription that can be committed, so these rules are covered without the private Marano file.
const sources = await Promise.all(["./catasto-parser.js", "./catasto-relations.js", "./catasto-name-index.js", "./catasto-xlsx.js", "./catasto-xlsx-index.js"]
  .map(path => readFile(new URL(path, import.meta.url), "utf8")));
const context = { window: {}, TextEncoder };
vm.createContext(context);
sources.forEach(source => vm.runInContext(source, context));
const W = context.window;
const text = await readFile(new URL("./test-fixtures/synthetic-catasto.md", import.meta.url), "utf8");
const plain = value => JSON.parse(JSON.stringify(value));
const parsed = { en: W.CatastoParser.parsePlainText(text, "en"), it: W.CatastoParser.parsePlainText(text, "it") };
const columns = ["image", "honorific", "given", "surname", "age", "born", "occupation", "fatherGiven", "fatherSurname",
  "motherGiven", "motherSurname", "village", "district", "notes"];
const xlsxRows = language => plain(W.CatastoXlsxIndex.buildXlsxIndex(parsed[language]).rows)
  .map(row => Object.fromEntries(columns.map((name, i) => [name, row[i]])));
const mentions = language => plain(W.CatastoNameIndex.collectMentions(parsed[language]).found);

for (const language of ["en", "it"]) {
  test(`${language}: households, pages, and residences`, () => {
    const data = parsed[language];
    assert.equal(data.source_title, "Casale Esempio 1760");
    assert.deepEqual(plain(data.households.map(record => record.household_head)),
      ["Bruno Ventrella", "Rosa Galdieri", "Matteo Ferrandina", "Pietro Lombardo"]);
    assert.deepEqual(plain(data.households.map(record => record.source_pages)), [[1], [1], [2], [3, 4]]);
    assert.deepEqual(plain(data.households.map(record => record.residence.place)), ["Borgo Alto", "Borgo Alto", "Piano", "Piano"]);
    // An entry that continues onto the next page records where that page begins.
    assert.deepEqual(plain(data.households[3].source_page_breaks.map(item => item.page)), [3, 4]);
  });

  test(`${language}: neighbors resolve to the households they name`, () => {
    const [bruno, rosa, matteo, pietro] = parsed[language].households;
    const linked = record => record.residence_links.filter(link => link.household_id).map(link => link.household_id);
    assert.deepEqual(plain(linked(bruno)), [matteo.id]);
    assert.deepEqual(plain(linked(rosa)), [bruno.id]);
    assert.deepEqual(plain(linked(matteo)), [bruno.id]);
    assert.deepEqual(plain(linked(pietro)), [matteo.id]);
  });

  test(`${language}: a widow's children take the late husband's surname; an infant is a member`, () => {
    const people = new Set(mentions(language).filter(m => m.source === "household").map(m => `${m.given_name} ${m.surname}`));
    for (const name of ["Giuseppe Spadafino", "Anna Spadafino", "Teresa Ventrella", "Paolo Ventrella"]) assert.ok(people.has(name), name);
    const teresa = xlsxRows(language).find(row => row.given === "Teresa");
    assert.equal(teresa.age, 0);
    assert.equal(teresa.occupation, "");
    assert.match(teresa.notes, /Listed as an infant/);
    assert.deepEqual([teresa.fatherGiven, teresa.motherGiven], ["Bruno", "Lucia"]);
  });

  test(`${language}: references keep their page and the origin the scribe gives`, () => {
    const references = mentions(language).filter(m => m.source === "reference");
    const find = (given, page) => references.find(m => m.given_name === given && m.pages.includes(page));
    assert.equal(find("Rosa", 4)?.residential_location, "Casale Esempio");
    assert.deepEqual(find("Rosa", 4).pages, [4]);
    assert.equal(find("Saverio", 4)?.residential_location, "Montefinto");
    assert.equal(find("Matteo", 1)?.residential_location, "Roccafinta");
  });
}

test("the English and Italian sides give the same people", () => {
  const people = language => [...new Set(xlsxRows(language).map(row => `${row.given} ${row.surname}`))].sort();
  assert.deepEqual(people("it"), people("en"));
  assert.equal(xlsxRows("en").length, 14);
});

test("an Italian creditor clause that begins a sentence is indexed", () => {
  const saverio = xlsxRows("it").find(row => row.given === "Saverio");
  assert.equal(saverio?.surname, "Cantisani");
  assert.equal(saverio.village, "Montefinto");
});
