import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const sources = await Promise.all(["./catasto-parser.js", "./catasto-relations.js", "./catasto-name-index.js"]
  .map(path => readFile(new URL(path, import.meta.url), "utf8")));

function load() {
  const context = { window: {} };
  vm.createContext(context);
  sources.forEach(source => vm.runInContext(source, context));
  return context.window;
}

const W = load();
const english = `### **Marano Marchesato 1754: Page 5**

English Translation:

Domenico Aijello, manager of oxen, age 48
Antonia Libranda, wife, age 58
Marco di Bartolo, son-in-law, day laborer, age 36
Francesco, grandson, age 5

He lives in his own house in San Nicola, bordering Angelo and Gaetano Ferrari and the public road. He pays to the Magnificent Gaetano Ferrari of the city of Castelfranco, for a principal of fifty ducats, five annual ducats. He pays to the Reverend Clergy of this Land, for a principal of ten ducats.

Anna Belmonte, widow of Natale Cosentino — age 32
Saverio, son — age 10
Antonio, son — age 3
Dianora, sister — age 30

She lives in her own house in the Pasolani district, bordering Achille Covello and the public road.

Ignazio Zupo, shepherd — age 32
Chiara Gentile, wife — age 19
Teresa, sister, married — age 26
Paulo Serpe, brother-in-law, day laborer — age 29
Marco, nephew — age 6

He lives in his own house in San Nicola, bordering Achille Covello and the most Illustrious Lady Marchesa della Valle.

Agostino Spizzirri, a shepherd, aged 50.
Diana Garritano, his wife, aged 40.
Tomaso, stepson, shepherd, aged 18.

He lives in his own house in San Nicola, bordering the property of Donna Ruffulo and Barbara Covello.

Gennaro Belmonte son of Santo, shepherd — age 59
Caterina Cimino wife — age 50

He lives in his own house in San Nicola, bordering the venerable Chapel of the Purgatory of this Land and the running river.

Gennaro Belmonte, day laborer — age 26
Matalena Covello, wife — age 30
Lucrezia Covello, cousin — age 23
Innocenza, niece — age 1
Carmine, brother-in-law — age 27

He lives in his own house in San Nicola, bordering Gennaro Belmonte and Rafaele di Bartolo of the Land of Castelfranco. He pays to Giuseppe Loizzo of this Land, for a principal debt of eight ducats. To the Reverend Don Paulo Mandarino, of this Land of Rende, for a principal of seventy-six ducats.

Leonardo Coscarello, shepherd — age 55
Dianora Serpe, wife — age 46
Barbara, daughter, married — age 20
Nicolò Guido, miller — age 23
Carlo, grandson — age 3

He lives in his own house in San Nicola, bordering Pietro Tenuta and the public road.

Andrea Covello, day laborer, age 40
Francesco Antonio, his son, aged 8

He lives in his own house in San Nicola, bordering Mercurio Savaglio of the Land of Marano Principato and Biasi Monaco, son of the late Francesco.
`;

function index(text, language = "en", options = {}) {
  const data = W.CatastoParser.parsePlainText(text, language);
  return JSON.parse(JSON.stringify(W.CatastoNameIndex.buildNameIndex(data, { exportedAt: "2026-11-09T00:00:00.000Z", ...options })));
}

const built = index(english);
const find = (given, surname, extra = {}) => built.people.filter(person => person.given_name === given && person.surname === surname &&
  Object.entries(extra).every(([field, value]) => person[field] === value));
const one = (given, surname, extra) => {
  const found = find(given, surname, extra);
  assert.equal(found.length, 1, `${given} ${surname} ${JSON.stringify(extra || {})}: ${JSON.stringify(found)}`);
  return found[0];
};

test("the village comes from the source title and fields follow the plan's order", () => {
  assert.equal(built.village, "Marano Marchesato");
  assert.equal(built.format, "catasto-name-index");
  assert.deepEqual(Object.keys(built.people[0]), ["honorific", "given_name", "surname", "surname_derived", "qualifier", "residential_location"]);
});

test("children take the father's surname, under a widow the late husband's", () => {
  one("Saverio", "Cosentino");
  one("Antonio", "Cosentino");
  assert.equal(one("Dianora", "Belmonte").surname_derived, "");
  one("Natale", "Cosentino", { residential_location: "Marano Marchesato" });
  assert.equal(one("Anna", "Belmonte").qualifier, "widow of Natale Cosentino");
});

test("children listed after an in-law take the in-law's surname", () => {
  assert.equal(one("Francesco", "di Bartolo").surname_derived, "");
  assert.equal(one("Marco", "Serpe").surname_derived, "");
});

test("uncertain surnames are noted, never marked in the surname", () => {
  assert.equal(one("Tomaso", "Spizzirri").surname_derived, "Stepchild: head's surname");
  assert.equal(one("Carmine", "Covello").surname_derived, "In-law: spouse's surname");
  assert.equal(one("Innocenza", "Belmonte").surname_derived, "No parent listed: head's surname");
  assert.equal(one("Carlo", "Guido").surname_derived, "Relation of preceding man not stated");
  assert.ok(built.people.every(person => !/\*/.test(person.surname)));
});

test("compound given names stay whole", () => {
  one("Francesco Antonio", "Covello");
  assert.equal(find("Francesco", "Antonio").length, 0);
});

test("one entry per given name and surname, keeping the version with a qualifier", () => {
  assert.equal(one("Gennaro", "Belmonte").qualifier, "son of Santo");
  one("Santo", "Belmonte");
  one("Achille", "Covello");
  one("Biasi", "Monaco", { qualifier: "son of the late Francesco" });
});

test("residential location follows the scribe's words", () => {
  one("Rafaele", "di Bartolo", { residential_location: "Castelfranco" });
  one("Giuseppe", "Loizzo", { residential_location: "Marano Marchesato" });
  one("Mercurio", "Savaglio", { residential_location: "Marano Principato" });
  assert.equal(one("Paulo", "Mandarino").residential_location, "Rende");
  // Named without an origin in a border, but only ever "of the city of Castelfranco" elsewhere.
  assert.equal(one("Gaetano", "Ferrari").residential_location, "Castelfranco");
  one("Angelo", "Ferrari", { residential_location: "Marano Marchesato" });
});

test("honorifics have their own field; institutions and public places are left out", () => {
  assert.equal(one("Gaetano", "Ferrari").honorific, "Magnificent");
  assert.equal(one("Paulo", "Mandarino").honorific, "Reverend Don");
  // A title without a given name is not a name.
  assert.equal(built.people.some(person => /della Valle|Ruffulo/.test(person.surname)), false);
  assert.ok(built.people.every(person => !/Clergy|Chapel|Purgatory|road|river/i.test(Object.values(person).join(" "))));
});

test("a typed village replaces the suggested one", () => {
  const custom = index(english, "en", { village: "Marano" });
  assert.equal(custom.village, "Marano");
  assert.equal(custom.people.find(person => person.given_name === "Achille").residential_location, "Marano");
});

test("Italian member lines, patronymics, and border lists", () => {
  const italian = index(`Antonio Conforto di Giuseppe pecoraro anni 40
Maria Rossi moglie anni 30
Pietro figlio anni 5
Abita in casa propria sita in San Nicola giusta li beni di Nicola Russo e di Antonio Belmonte della Terra di Rende.`, "it");
  const people = italian.people.map(person => `${person.given_name} ${person.surname} | ${person.qualifier} | ${person.residential_location}`);
  assert.ok(people.includes("Antonio Conforto | di Giuseppe | Marano Marchesato") || people.includes("Antonio Conforto | di Giuseppe | Not stated"), people.join("\n"));
  const place = italian.village;
  assert.ok(people.includes(`Giuseppe Conforto |  | ${place}`), people.join("\n"));
  assert.ok(people.includes(`Pietro Conforto |  | ${place}`), people.join("\n"));
  assert.ok(people.includes(`Nicola Russo |  | ${place}`), people.join("\n"));
  assert.ok(people.includes("Antonio Belmonte |  | Rende"), people.join("\n"));
});

test("Markdown has the table and the Transcriber's three lists", () => {
  const markdown = W.CatastoNameIndex.toMarkdown(built);
  assert.match(markdown, /\| Honorific \| Given name \| Surname \| Surname derived \| Qualifier \| Residential location \|\n\|---\|---\|---\|---\|---\|---\|/);
  const list = heading => markdown.split(`### ${heading}\n\n\`\`\`\n`)[1].split("\n```")[0].split("\n");
  const surnames = list("Surnames");
  assert.equal(new Set(surnames).size, surnames.length);
  assert.ok(surnames.includes("di Bartolo"));
  assert.ok(list("Given names").includes("Francesco Antonio"));
  const full = list("Full names");
  assert.ok(full.includes("Gaetano Ferrari"));
  assert.ok(full.every(name => !/^(?:Magnificent|Don|Reverend|Donna)\b/.test(name)));
});

test("CSV opens in Excel: byte-order mark, header, quoted fields, no formulas", () => {
  const csv = W.CatastoNameIndex.toCsv({ people: [
    { honorific: "Reverend Don", surname: "Mandarino", surname_derived: "", given_name: "Paulo", qualifier: "", residential_location: "Rende" },
    { honorific: "", surname: "Nicolò, \"il Vecchio\"", surname_derived: "", given_name: "=SUM(A1)", qualifier: "son of the late Francesco", residential_location: "Marano Marchesato" }
  ] });
  assert.ok(csv.startsWith("﻿\"Honorific\",\"Given name\",\"Surname\",\"Surname derived\",\"Qualifier\",\"Residential location\"\r\n"));
  const lines = csv.slice(1).trimEnd().split("\r\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[1], '"Reverend Don","Paulo","Mandarino","","","Rende"');
  assert.equal(lines[2], '"","\'=SUM(A1)","Nicolò, ""il Vecchio""","","son of the late Francesco","Marano Marchesato"');
  assert.equal(W.CatastoNameIndex.toCsv(built).slice(1).trimEnd().split("\r\n").length, built.people.length + 1);
});

test("the corrected Marano transcription, when CATASTO_VALIDATION_MD points to it", async t => {
  const path = process.env.CATASTO_VALIDATION_MD;
  if (!path) {
    t.skip("CATASTO_VALIDATION_MD is not set");
    return;
  }
  const marano = index(await readFile(path, "utf8"));
  const people = (given, surname) => marano.people.filter(person => person.given_name === given && person.surname === surname);
  assert.equal(marano.village, "Marano Marchesato");
  assert.deepEqual(people("Gennaro", "Belmonte").map(person => person.qualifier), ["son of Santo"]);
  assert.equal(people("Achille", "Covello").length, 1);
  assert.equal(people("Tomaso", "Spizzirri")[0]?.surname_derived, "Stepchild: head's surname");
  assert.equal(people("Carlo", "Guido")[0]?.surname_derived, "Relation of preceding man not stated");
  assert.ok(people("Francesco", "di Bartolo").length >= 1);
  assert.equal(people("Giulio", "Storino").length, 1);
  assert.equal(people("Rafaele", "di Bartolo")[0]?.residential_location, "Castelfranco");
  assert.ok(marano.people.every(person => !/Clergy|Chapel|Convent|Monastery/.test(Object.values(person).join(" "))));
  assert.ok(marano.people.every(person => person.given_name));
  const plain = marano.people.filter(person => !person.qualifier).map(person => `${person.given_name}|${person.surname}`);
  assert.equal(new Set(plain).size, plain.length);
  const qualified = new Set(marano.people.filter(person => person.qualifier).map(person => `${person.given_name}|${person.surname}`));
  assert.ok(plain.every(name => !qualified.has(name)));
});
