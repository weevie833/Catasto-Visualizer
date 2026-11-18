import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { validationSource } from "./validation-source.mjs";

const sources = await Promise.all(["./catasto-parser.js", "./catasto-relations.js", "./catasto-name-index.js", "./catasto-xlsx.js", "./catasto-xlsx-index.js"]
  .map(path => readFile(new URL(path, import.meta.url), "utf8")));

const context = { window: {}, TextEncoder };
vm.createContext(context);
sources.forEach(source => vm.runInContext(source, context));
const W = context.window;

const english = `### **Marano Marchesato 1754: Page 5**

English Translation:

Santo Belmonte, shepherd, decrepit, age 69
Lucrezia Zumpano, wife, age 60
Arcangelo, son, day laborer, age 24

He lives in his own house in the Pasolani district, bordering the public road.

Gennaro Belmonte son of Santo, shepherd — age 39
Caterina Cimino wife — age 35
Ippolita, daughter, unmarried — age 15
Domenico, son, an infant

He lives in his own house in San Nicola, bordering Gennaro Belmonte and the running river.

### **Marano Marchesato 1754: Page 6**

English Translation:

Gennaro Belmonte, day laborer — age 26
Matalena Covello, wife — age 30

He lives in his own house in San Nicola, bordering the public road.

Anna Belmonte, widow of Natale Cosentino — age 32
Saverio, son — age 10

She lives in her own house in the Pasolani district, bordering Achille Covello.

Leonardo Coscarello, shepherd — age 55
Dianora Serpe, wife — age 46
Barbara, daughter, married — age 20
Marco di Bartolo, son-in-law, day laborer — age 36
Carlo, grandson — age 3
Tomaso, stepson, shepherd — age 18

He lives in his own house in San Nicola, bordering the Magnificent Gaetano Ferrari of the city of Castelfranco.

### **Marano Marchesato 1754: Page 7**

English Translation:

Reverend Priest Don Pietro Conforti, age 28
Sister Maria Covello, sister, domestic nun, age 50

He lives in his own house in San Nicola, bordering Achille Covello. He pays to the Magnificent Gaetano Ferrari, for a principal of ten ducats.
`;

const columns = ["image", "honorific", "given", "surname", "age", "born", "occupation", "fatherGiven", "fatherSurname",
  "motherGiven", "motherSurname", "village", "district", "notes"];
const index = W.CatastoXlsxIndex.buildXlsxIndex(W.CatastoParser.parsePlainText(english, "en"), {});
const rows = JSON.parse(JSON.stringify(index.rows)).map(row => Object.fromEntries(columns.map((name, i) => [name, row[i]])));
const rowsOf = (given, surname) => rows.filter(row => row.given === given && row.surname === surname);
const one = (given, surname) => {
  const found = rowsOf(given, surname);
  assert.equal(found.length, 1, `${given} ${surname}: ${JSON.stringify(found)}`);
  return found[0];
};

test("the layout is the template's: one header row, fourteen columns", () => {
  const { LAYOUT } = W.CatastoXlsxIndex;
  assert.equal(LAYOUT.name, "Nati");
  assert.equal(LAYOUT.header.length, 1);
  assert.deepEqual(Array.from(LAYOUT.header[0], cell => cell.text), ["Image Number", "Honorific", "Given Name", "Last Name", "Age",
    "Birth Year (est.)", "Occupation", "Father Given Name", "Father Last Name", "Mother Given Name", "Mother Last Name",
    "Resident Village", "Resident District", "Notes"]);
  assert.equal(LAYOUT.merges.length, 0);
  assert.ok(index.rows.every(row => row.length === 14));
});

test("ages give birth years; an infant is age 0", () => {
  assert.equal(index.year, 1754);
  const santo = one("Santo", "Belmonte");
  assert.equal(santo.age, 69);
  assert.equal(santo.born, 1685);
  const infant = one("Domenico", "Belmonte");
  assert.equal(infant.age, 0);
  assert.equal(infant.born, 1754);
  assert.match(infant.notes, /Listed as an infant/);
});

test("children have the head and his wife as parents; a widow's children have her late husband", () => {
  const arcangelo = one("Arcangelo", "Belmonte");
  assert.deepEqual([arcangelo.fatherGiven, arcangelo.fatherSurname, arcangelo.motherGiven, arcangelo.motherSurname], ["Santo", "Belmonte", "Lucrezia", "Zumpano"]);
  const saverio = one("Saverio", "Cosentino");
  assert.deepEqual([saverio.fatherGiven, saverio.fatherSurname, saverio.motherGiven, saverio.motherSurname], ["Natale", "Cosentino", "Anna", "Belmonte"]);
  const natale = one("Natale", "Cosentino");
  assert.match(natale.notes, /Late husband of Anna Belmonte/);
  assert.equal(natale.age, "");
});

test("uncertain parents are left for the user to check", () => {
  const carlo = one("Carlo", "di Bartolo");
  assert.equal(carlo.fatherGiven, "Marco");
  assert.equal(carlo.motherGiven, "");
  assert.match(carlo.notes, /Father taken as the preceding son-in-law, Marco di Bartolo; check the source/);
  const tomaso = one("Tomaso", "Coscarello");
  assert.equal(tomaso.fatherGiven, "");
  assert.match(tomaso.notes, /Stepchild: parents not stated in the record; check the source/);
});

test("a patronymic father of the same name joins his own household row", () => {
  const santo = one("Santo", "Belmonte");
  assert.match(santo.notes, /Named as the father of Gennaro Belmonte/);
  const sons = rowsOf("Gennaro", "Belmonte");
  assert.equal(sons.length, 2);
  assert.deepEqual(sons.map(row => row.fatherGiven), ["Santo", ""]);
});

test("a neighbor not told apart by father adds the page to every person of that name", () => {
  const [elder, younger] = rowsOf("Gennaro", "Belmonte");
  // "bordering Gennaro Belmonte" on page 5 could be either of them.
  assert.match(elder.notes, /Mentioned on page 5; Another person in this index has the same name/);
  assert.match(younger.notes, /Also possibly on page 5: another person has the same name; check the source/);
  const achille = one("Achille", "Covello");
  assert.equal(achille.image, "6");
  assert.match(achille.notes, /Mentioned on pages 6, 7/);
  assert.match(achille.notes, /Not listed in a household/);
});

test("image numbers name every page of the entry; districts are as written", () => {
  assert.equal(one("Leonardo", "Coscarello").image, "6");
  assert.equal(one("Santo", "Belmonte").district, "Pasolani");
  assert.equal(one("Matalena", "Covello").district, "San Nicola");
  const gennaro = rowsOf("Gennaro", "Belmonte").find(row => row.fatherGiven === "Santo");
  assert.equal(gennaro.image, "5");
});

test("honorifics and occupations: nobles, clergy, and conditions", () => {
  const ferrari = one("Gaetano", "Ferrari");
  assert.equal(ferrari.honorific, "Magnificent");
  assert.equal(ferrari.occupation, "Noble");
  assert.equal(ferrari.village, "Castelfranco");
  const priest = one("Pietro", "Conforti");
  assert.equal(priest.honorific, "Reverend Don");
  assert.equal(priest.occupation, "Priest");
  const nun = one("Maria", "Covello");
  assert.equal(nun.honorific, "Sister");
  assert.equal(nun.occupation, "domestic nun");
  assert.equal(one("Santo", "Belmonte").occupation, "shepherd");
  assert.match(one("Santo", "Belmonte").notes, /Described as decrepit/);
  assert.match(one("Ippolita", "Belmonte").notes, /Described as unmarried/);
  assert.equal(one("Marco", "di Bartolo").occupation, "day laborer");
});

function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = new Map();
  let at = 0;
  while (view.getUint32(at, true) === 0x04034B50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLength));
    const data = bytes.slice(at + 30 + nameLength, at + 30 + nameLength + size);
    assert.equal(W.CatastoXlsx.crc32(data), crc, name);
    files.set(name, new TextDecoder().decode(data));
    at += 30 + nameLength + size;
  }
  assert.equal(view.getUint32(bytes.length - 22, true), 0x06054B50);
  return files;
}

test("the XLSX is a valid package with the sheet, frozen header, and escaped text", () => {
  const files = unzip(W.CatastoXlsxIndex.toXlsx({ rows: [["5, 6", "", "Nicolò", "d'Aijello & <Figli>", 40, 1714, "", "", "", "", "", "Marano", "", "=note"]] }));
  assert.deepEqual([...files.keys()], ["[Content_Types].xml", "_rels/.rels", "xl/workbook.xml", "xl/_rels/workbook.xml.rels", "xl/styles.xml", "xl/worksheets/sheet1.xml"]);
  const sheet = files.get("xl/worksheets/sheet1.xml");
  assert.match(files.get("xl/workbook.xml"), /<sheet name="Nati"/);
  assert.match(sheet, /<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"\/>/);
  assert.doesNotMatch(sheet, /mergeCell/);
  assert.match(sheet, /<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Image Number<\/t>/);
  assert.match(sheet, /<c r="D2" t="inlineStr"><is><t xml:space="preserve">d'Aijello &amp; &lt;Figli&gt;<\/t><\/is><\/c>/);
  assert.match(sheet, /<c r="E2"><v>40<\/v><\/c>/);
  assert.match(sheet, /<t xml:space="preserve">Nicolò<\/t>/);
  assert.match(files.get("xl/styles.xml"), /<fgColor rgb="FFF9CB9C"\/>/);
});

test("the current Marano source, when CATASTO_VALIDATION_MD names it", async t => {
  const source = await validationSource();
  if (!source) {
    t.skip("CATASTO_VALIDATION_MD is not set");
    return;
  }
  const marano = W.CatastoXlsxIndex.buildXlsxIndex(W.CatastoParser.parsePlainText(source, "en"), {});
  const found = JSON.parse(JSON.stringify(marano.rows)).map(row => Object.fromEntries(columns.map((name, i) => [name, row[i]])));
  const named = (given, surname) => found.filter(row => row.given === given && row.surname === surname);
  assert.ok(found.length > 2000);
  assert.ok(found.every(row => row.given && row.image));
  assert.equal(named("Andrea", "Orrico").find(row => row.age === 50).image, "5, 6");
  // Two Michele Marinos: Barbara Caputo's son (age 10, p. 361) and Pietro Morrone's nephew (age 14, pp. 281–282).
  const michele = named("Michele", "Marino").find(row => row.age === 10);
  assert.deepEqual([michele.fatherGiven, michele.motherGiven], ["Francesco", "Barbara"]);
  assert.equal(named("Gennaro", "Belmonte").filter(row => row.age !== "").length, 3);
  // Named only in a mass legacy in the excluded "Churches and Monasteries" section: the XLSX Index follows the
  // entries and leaves him out; the Name Index keeps him.
  assert.equal(named("Maurizio", "Cusinelli").length, 0);
});
