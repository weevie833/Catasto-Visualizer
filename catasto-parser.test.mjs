import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const source = await readFile(new URL("./catasto-parser.js", import.meta.url), "utf8");
const context = { window: {} };
vm.runInNewContext(source, context);
const { inferFamilyRelationships, parsePlainText, languageMismatch, parseItalianLandholding, splitItalianMemberLine } = context.window.CatastoParser;

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

const italianEntries = `Andrea Morrone bracciale ————— anni 46
Lucrezia Aijello moglie — anni 40
Michele figlio — anni 2
Teste due
Abita in casa propria sita nelli Pasolani giusta li beni di Pietro e Biasi Santanna e via publica —
Possiede una possessione detta San Nicola di capacità moggi mezzo confine Cesare Chiappetta e Giacomo di Francesco stimata la rendita per carlini quindici sono oncie 5.

Antonio Conforto di Giuseppe pecoraro — anni 50
Abita in casa del Magnifico Domenico Lento della Terra di Rende, e ne paga annui carlini trenta d'affitto.

Nicolò Vera della Terra di Castelfranco bracciale — anni 40
Abita in casaggio di Santo Nicola, giusta li beni di Lorenzo Russo ed Andrea Morrone —`;

test("an Italian-only transcription is split into households with Italian names, residences, and neighbors", () => {
  const data = parsePlainText(italianEntries, "it");
  assert.equal(data.source_language, "it");
  assert.deepEqual([...data.households.map(record => record.household_head)], ["Andrea Morrone", "Antonio Conforto", "Nicolò Vera"]);

  const [morrone, conforto, vera] = data.households;
  assert.match(morrone.members_text, /Michele figlio/);
  assert.equal(morrone.residence.place, "Pasolani");
  assert.deepEqual([...morrone.residence.adjacent_to], ["Pietro Santanna", "Biasi Santanna", "via publica"]);
  assert.equal(conforto.residence.place, "Not Listed");
  assert.deepEqual([...conforto.residence.adjacent_to], []);
  assert.equal(vera.residence.place, "Santo Nicola");
  assert.deepEqual([...vera.residence.adjacent_to], ["Lorenzo Russo", "Andrea Morrone"]);
  assert.equal(vera.residence_links.find(link => link.name === "Andrea Morrone").household_id, "andrea-morrone");
});

test("Italian member lines separate name, father, origin, occupation, and relation", () => {
  assert.deepEqual({ ...splitItalianMemberLine("Antonio Conforto di Giuseppe pecoraro — anni 50") }, {
    name: "Antonio Conforto", patronymic: "di Giuseppe", origin: null, rest: "di Giuseppe pecoraro", age: "50", relation: ""
  });
  const origin = splitItalianMemberLine("Paolo Cajra della Terra di Castelfranco, pecoraro — anni 39");
  assert.equal(origin.name, "Paolo Cajra");
  assert.equal(origin.origin, "Castelfranco");
  assert.equal(splitItalianMemberLine("Michele di Gaudio bracciale — — — anni 43").name, "Michele di Gaudio");
  assert.equal(splitItalianMemberLine("Giovanni Battista di Rangho bracciale — anni 35").name, "Giovanni Battista di Rangho");
  assert.equal(splitItalianMemberLine("Achille Covello Bracciale — anni 30").name, "Achille Covello");
  assert.equal(splitItalianMemberLine("Anna Spizzirri figlia nubile — anni 20").relation, "figlia nubile");
});

test("Italian landholding clauses keep their source terms", () => {
  const holding = parseItalianLandholding("Un'altra possessione detta li Malvitani di castagna moggi mezzo, giusta li beni di Mercurio Bartuccio e Cesare Tenuta stimata la rendita per carlini ventiquattro, sono oncie 8.");
  assert.equal(holding.name, "li Malvitani");
  assert.equal(holding.type, "possessione di castagna");
  assert.equal(holding.capacity, "moggi mezzo");
  assert.equal(holding.income, "stimata la rendita per carlini ventiquattro, sono oncie 8");
  assert.deepEqual([...holding.adjacent_to], ["Mercurio Bartuccio", "Cesare Tenuta"]);

  const located = parseItalianLandholding("Possiede un castagneto di San Nicola in capacità moggio uno, confina Daniele Santanna e Giulia Belmonte; stimata la rendita per molti ducati cinque, sono — oncie — 16.20");
  assert.equal(located.place, "San Nicola");
  assert.equal(located.type, "castagneto");
  assert.equal(located.capacity, "moggio uno");
  assert.deepEqual([...located.adjacent_to], ["Daniele Santanna", "Giulia Belmonte"]);
});

test("a bilingual transcription parses the selected language's sections with their pages", () => {
  const text = `**Marano Marchesato 1754: Page 7**
**Italian Transcription:**
Andrea Morrone bracciale — anni 46
Abita in casa propria sita in San Nicola, giusta li beni di Agostino Serpe e via publica.
**English Translation:**
Andrea Morrone, day laborer, age 46
He lives in his own house situated in San Nicola, bordering Agostino Serpe and the public road.`;
  const italian = parsePlainText(text, "it");
  assert.equal(italian.source_language_used, "Italian Transcription sections only");
  assert.deepEqual([...italian.households[0].source_pages], [7]);
  assert.match(italian.households[0].source_entry, /Abita/);
  assert.doesNotMatch(italian.households[0].source_entry, /lives/);
  assert.match(parsePlainText(text).households[0].source_entry, /He lives/);
});

test("the selected language is checked against the text before parsing", () => {
  const italianOnly = "**Italian Transcription:**\nAndrea Morrone bracciale — anni 46";
  assert.match(languageMismatch(italianOnly, "en").message, /Italian Transcription sections but no English Translation sections\. Choose IT/);
  assert.equal(languageMismatch(italianOnly, "it"), null);
  assert.match(languageMismatch(italianEntries, "en").message, /looks Italian/);
  assert.match(languageMismatch("Paolo Rossi, day laborer, age 40\nHe lives in his own house, bordering Marco Bruno.", "it").message, /looks English, but IT is selected/);
  assert.equal(languageMismatch("Short note.", "it"), null);
});

// The bilingual source transcription stays on the developer's computer; when it is present, its Italian and
// English sides must describe the same households.
const bilingualSource = new URL("./MM 1754 Catasto Onciario Transcription 300.md", import.meta.url);
test("the Italian and English sides of the bilingual transcription agree", { skip: !existsSync(bilingualSource) && "bilingual source not present" }, async () => {
  const text = await readFile(bilingualSource, "utf8");
  const english = parsePlainText(text, "en").households;
  const italian = parsePlainText(text, "it").households;
  assert.equal(italian.length, english.length);

  const key = name => String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(?:the|magnific[oa]|magnificent|don|donna|via publica|public road)\b/g, "").replace(/[^a-z]+/g, " ").trim();
  let sameHead = 0;
  let englishNeighbors = 0;
  let matchedNeighbors = 0;
  let next = 0;
  // Pairs records in order, allowing a translator's spelling change to skip ahead by at most two records.
  english.forEach(record => {
    const offset = italian.slice(next, next + 3).findIndex(candidate => key(candidate.household_head) === key(record.household_head));
    if (offset < 0) return;
    const counterpart = italian[next + offset];
    next += offset + 1;
    sameHead += 1;
    const italianNeighbors = new Set(counterpart.residence.adjacent_to.map(key).filter(Boolean));
    record.residence.adjacent_to.map(key).filter(Boolean).forEach(name => {
      englishNeighbors += 1;
      if (italianNeighbors.has(name)) matchedNeighbors += 1;
    });
  });
  assert.ok(sameHead / english.length >= 0.8, `household heads agree for ${sameHead} of ${english.length}`);
  assert.ok(matchedNeighbors / englishNeighbors >= 0.9, `residence neighbors agree for ${matchedNeighbors} of ${englishNeighbors}`);
});

test("residence places written as a neighborhood, house name, or contextual clause are all read", () => {
  const data = parsePlainText([
    "Angelo Chiappetta, shepherd, age 30",
    "Tax base two.",
    "He lives in his own house in the Pajoli neighborhood bordering the property of Isabella Orrico and the public road.",
    "",
    "Andrea Orrico, day laborer, age 50",
    "Tax base two.",
    "He lives in a house called Li Malvitani, bordering Angelo Chiappetta.",
    "",
    "Paolo Rossi, day laborer, age 40",
    "Tax base two.",
    "He lives in a house rented from Andrea Orrico."
  ].join("\n"));
  assert.deepEqual([...data.households.map(record => record.residence.place)], ["Pajoli", "Li Malvitani", "Not Listed"]);
  assert.equal(data.parser_version, context.window.CatastoParser.PARSER_VERSION);
});

test("Admin and the Visualizer share one parser", async () => {
  const [app, admin] = await Promise.all(["./app.js", "./admin.js"].map(path => readFile(new URL(path, import.meta.url), "utf8")));
  for (const name of ["parsePlainText", "parseResidence", "linkResidenceAdjacency", "segmentHouseholds"]) {
    assert.doesNotMatch(app, new RegExp(`\\bfunction ${name}\\(`), `app.js must not define its own ${name}`);
  }
  assert.match(admin, /CatastoParser\.parsePlainText\(/);
});

test("an entry that starts mid-page records that page, and where each later page begins", () => {
  const data = parsePlainText(`### **Marano Marchesato 1754: Page 5**

English Translation:

Angelo Chiappetta, shepherd, age 30
Rosolia Bruno, wife, age 26

He lives in his own house in the Pasolani district, bordering the public road.

Andrea Orrico, day laborer, age 50
Barbara Fabiano, wife, age 40

He lives in his own house in San Nicola, bordering Pietro Tenuta.

### **Marano Marchesato 1754: Page 6**

English Translation:

He possesses a portion of land bordering Carlo Aijello and the public road.
`, "en");
  const [first, second] = data.households;
  assert.deepEqual([...first.source_pages], [5]);
  assert.deepEqual([...second.source_pages], [5, 6]);
  assert.deepEqual(JSON.parse(JSON.stringify(second.source_page_breaks)), [
    { page: 5, starts_with: "Andrea Orrico, day laborer, age 50" },
    { page: 6, starts_with: "He possesses a portion of land bordering Carlo Aijello and the public road." }
  ]);
});
