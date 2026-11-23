import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { validationSource } from "./validation-source.mjs";

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

test("a head exempt by privilege is a household of his own, though entered without ages", () => {
  const english = parsePlainText(`Andrea Morello, a shepherd, aged 55.
He lives in his own house in the Pasolani.
The grand total is 53 oncie.

Andrea Belmonte, a shepherd, is not taxed any oncie, neither for himself nor for his family, because he holds the Privilege of a "Padre Onusto".

Andrea Conforto, a day laborer, aged 28.
Carmine, his brother and also a day laborer, aged 20.
He lives in his own house in the Pasolani, bordering Andrea Belmonte and the public road.`).households;
  assert.deepEqual(Array.from(english, record => record.household_head), ["Andrea Morello", "Andrea Belmonte", "Andrea Conforto"]);
  assert.equal(english[1].members_text, "Andrea Belmonte, a shepherd");
  assert.match(english[1].source_entry, /Padre Onusto/);
  assert.equal(english[2].residence_links[0].household_id, english[1].id);

  const italian = parsePlainText(`Andrea Morello pecoraro anni 55
Abita in casa propria sita li Pasolani.

Andrea Belmonte pecoraro non si tassano oncie, né di lui né di sua famiglia, atteso tiene il Privilegio di Padre Onusto.

Andrea Conforto bracciale anni 28
Abita in casa propria sita li Pasolani.`, "it").households;
  assert.deepEqual(Array.from(italian, record => record.household_head), ["Andrea Morello", "Andrea Belmonte", "Andrea Conforto"]);
  assert.equal(italian[1].members_text, "Andrea Belmonte, pecoraro");
});

test("an age set off by a dash still begins a household", () => {
  const english = parsePlainText(`Antonio Mirabello, from the Land of Rende, age — 48
Teresa Volpentesta, wife, age — 44
He possesses no assets of any kind, living by his own labors.

Andrea Conte, from the Land of Castelfranco, age — 48
Elisabetta Costabile, wife, age — 22
He possesses a landholding in the Pasolani district.`).households;
  assert.deepEqual(Array.from(english, record => record.household_head), ["Antonio Mirabello", "Andrea Conte"]);
  // The origin set apart by commas is his residence, not part of the member line.
  assert.equal(english[1].members_text, "Andrea Conte, age 48\nElisabetta Costabile, wife, age 22");
  assert.deepEqual(Array.from(english, record => record.residence.place), ["Rende", "Castelfranco"]);

  const italian = parsePlainText(`Antonio Mirabello, della Terra di Rende di anni — 48
Teresa Volpentesta moglie di anni — 44
Non possiede beni di sorte alcuna vivendo colle proprie fatiche.

Andrea Conte della Terra di Castelfranco di anni — 48
Elisabetta Costabile moglie di anni — 22
Possiede una possessione nelli Pasolani.`, "it").households;
  assert.deepEqual(Array.from(italian, record => record.household_head), ["Antonio Mirabello", "Andrea Conte"]);
  assert.deepEqual(Array.from(italian, record => record.residence.place), ["Rende", "Castelfranco"]);
});

test("an age abbreviated 'an:' or 'an.' at the end of a member line is an age, and 'an:' elsewhere is not (parser version 12)", () => {
  const households = parsePlainText(`6o
Ant.o Bafaro brac.te, anni 28.
Gius.e fllo brac.te an: 24.
Rosa sorella verg.e an. 14.

abita in Casa propria =

Possiede, ut rivelo f. 6o

Un Castag.o d.o la Fontana d'an: ren.a 1. — 3. 10.

Alli fig.i D. M.co Matera di Cos.a an: 0 — 60. — 2

7o
Angelo Arnone brac.te, orig.o di Rovito an: 34.
Viola Bonvenuto moglie, anni 33.

abita in Casa prop.a =`, "it").households;
  assert.deepEqual(Array.from(households, record => record.household_head), ["Ant.o Bafaro", "Angelo Arnone"]);
});

test("abbreviated relationships 'fllo' (fratello), 'fig.o' (figlio) and 'mog.e' (moglie) mark household members, not new heads (parser version 12)", () => {
  const households = parsePlainText(`Dom.co Barbuccio Massaro, anni 40.
Vitt.a Lucca moglie, anni — 47.
Ignazio fllo cieco, scemo an: — 46.
Bonav.a fllo cieco anni — 35.

abita in Casa propria =`, "it").households;
  assert.deepEqual(Array.from(households, record => record.household_head), ["Dom.co Barbuccio Massaro"]);
  const { isDependentHouseholdMember } = context.window.CatastoParser;
  assert.equal(isDependentHouseholdMember("Bonav.a fllo cieco anni 35."), true);
  assert.equal(splitItalianMemberLine("Bonav.a fllo cieco anni 35.").relation, "fllo cieco");
  assert.equal(isDependentHouseholdMember("Vitt.a Lucca mog.e anni 47."), true);
  assert.equal(isDependentHouseholdMember("Pascale fig.o anni 9."), true);
  assert.equal(splitItalianMemberLine("Vitt.a Lucca mog.e anni 47.").name, "Vitt.a Lucca");
  assert.equal(splitItalianMemberLine("Pascale fig.o anni 9.").relation, "fig.o");
  const abbreviated = parsePlainText(`Dom.co Barbuccio, anni 40.
Vitt.a Lucca mog.e, anni 47.
Pascale fig.o anni 9.

abita in Casa propria =`, "it").households;
  assert.deepEqual(Array.from(abbreviated, record => record.household_head), ["Dom.co Barbuccio"]);
});

test("first names joined by 'and' or a kept Italian 'e' share the surname that follows, particle included", () => {
  const { expandNeighborNames } = context.window.CatastoParser;
  assert.deepEqual(Array.from(expandNeighborNames("Giacomo e Rafaele di Bartolo")), ["Giacomo di Bartolo", "Rafaele di Bartolo"]);
  assert.deepEqual(Array.from(expandNeighborNames("Giacomo, and Domenico di Bartolo")), ["Giacomo di Bartolo", "Domenico di Bartolo"]);
  assert.deepEqual(Array.from(expandNeighborNames("Antonio Bartella ed Andrea Ritaccha")), ["Antonio Bartella", "Andrea Ritaccha"]);
  assert.deepEqual(Array.from(expandNeighborNames("Giacomo and the public road")), ["Giacomo", "public road"]);
  assert.deepEqual(Array.from(expandNeighborNames("Gennaro Passarello and his sister Anna di Bartolo")), ["Gennaro Passarello", "Anna di Bartolo"]);
  const { expandItalianNeighborNames } = context.window.CatastoParser;
  assert.deepEqual(Array.from(expandItalianNeighborNames("Gennaro Passarello e sorella Anna di Bartolo")), ["Gennaro Passarello", "Anna di Bartolo"]);
});

test("a neighbor's craft, title of honor, or 'said' is not part of the name, in either language (parser version 11)", () => {
  const { expandNeighborNames, expandItalianNeighborNames } = context.window.CatastoParser;
  const en = raw => Array.from(expandNeighborNames(raw)), it = raw => Array.from(expandItalianNeighborNames(raw));
  assert.deepEqual(en("the said Saverio Puglese and the said Lorenzo Santanna"), ["Saverio Puglese", "Lorenzo Santanna"]);
  assert.deepEqual(it("detto Saverio Puglese e detto Lorenzo Santanna"), ["Saverio Puglese", "Lorenzo Santanna"]);
  assert.deepEqual(it("mastro Carlo Conforti e Domenico di Guido"), ["Carlo Conforti", "Domenico di Guido"]);
  assert.deepEqual(en("on all sides the late Pietro Ionati"), ["Pietro Ionati"]);
  assert.deepEqual(it("quondam Pietro Ionati"), ["Pietro Ionati"]);
  assert.deepEqual(en("the Most Holy Lady Marchesa della Valle and the running river"), ["Marchesa della Valle", "running river"]);
  assert.deepEqual(it("l'Illustrissima Signora Marchesa della Valle e via publica"), ["Marchesa della Valle", "via publica"]);
  // A title alone takes no surname from the next name or a river.
  assert.deepEqual(en("the Lady Princess and the running river"), ["Princess", "running river"]);
  assert.deepEqual(en("[] Antonio Belmonte and a flowing river"), ["Antonio Belmonte", "flowing river"]);
  // "the Land of Rende" is still a town, not a neighbor.
  assert.deepEqual(en("the Land of Rende"), []);
  // An endowment clause and a "perché" clause name no neighbors.
  assert.deepEqual(en("Daniele Santanna and Gennaro Conforto, assigned as his Sacred Patrimony by Daniele Santanna, his father"), ["Daniele Santanna", "Gennaro Conforto"]);
  assert.deepEqual(it("Daniele Santanna e Gennaro Conforto assegnata ad titulum Patrimonij da Daniele Santanna suo Padre"), ["Daniele Santanna", "Gennaro Conforto"]);
  assert.deepEqual(it("li Corioni perché non si tira acqua"), ["Corioni"]);
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

test("a neighbor named without the title Cleric is the cleric's household", () => {
  const records = parsePlainText(`Antonio di Bartolo, day laborer — age 40
He lives in his own house in San Nicola, bordering the property of Lorenzo Aijello and the public road.

Cleric Lorenzo Aijello — age 28
He lives in his own house in San Nicola.`).households;
  assert.equal(records[0].residence_links[0].household_id, records[1].id);
});

test("a residence sentence cut by a page break is read as one sentence", () => {
  const english = parsePlainText(`Sigismonda Abate, virgin and head of household — age 20
Giuseppe, brother — age 16
She possesses the house where she lives located [continued on next page]
[[SOURCE_PAGE:380]]
...of the place called li Pasolani, bordering the properties of Antonia Ritaccha and the public road.
Furthermore, she possesses a landholding in the said Pasolani.`).households[0];
  assert.deepEqual(Array.from(english.residence.adjacent_to), ["Antonia Ritaccha", "public road"]);
  assert.match(english.source_entry, /\[continued on next page\]/, "the source text is kept as written");

  const italian = parsePlainText(`Sigismonda Abate vergine in capillis — anni 20
Giuseppe fratello — anni 16
Possiede la casa ove abita loco
[[SOURCE_PAGE:380]]
detto li Pasolani, giusta li beni d’ Antonia Ritaccha, e via publica.`, "it").households[0];
  assert.equal(italian.residence.place, "li Pasolani");
  assert.deepEqual(Array.from(italian.residence.adjacent_to), ["Antonia Ritaccha", "via publica"]);
});

test("a head's city or casale of origin is not part of his name", () => {
  const english = parsePlainText(`Gennaro Principe of the City of Marano Principato, age 40
Lalla Cajra, wife, age 32
He lives in a rented house.

Paulo Cosentino of the Casale of Aprigliano, day laborer — age 40
He lives in a rented house.`).households;
  assert.deepEqual(Array.from(english, record => record.household_head), ["Gennaro Principe", "Paulo Cosentino"]);
  assert.equal(english[0].members_text, "Gennaro Principe, age 40\nLalla Cajra, wife, age 32");

  const italian = parsePlainText(`Paulo Cosentino del Casale di Aprigliano bracciale — anni 40
Abita in casa d'affitto.`, "it").households;
  assert.equal(italian[0].household_head, "Paulo Cosentino");
});

test("a capitalized Padre after a name is a surname, not the head's father", () => {
  const english = parsePlainText(`Cesare Tenuta, day laborer — age 50
They are in total — 24 ounces.

Carlo Padre, shepherd — age 50
Francesca Micieli, wife — age 45
Andrea Ingiungi, nephew, day laborer — age 20
He lives in a group of houses in the Pasolani district.`).households;
  assert.deepEqual(Array.from(english, record => record.household_head), ["Cesare Tenuta", "Carlo Padre"]);

  const italian = parsePlainText(`Cesare Tenuta bracciale — anni 50
Sono in tutto — oncie — 24

Carlo Padre pecoraro — anni 50
Francesca Micieli moglie — anni 45
Andrea Ingiungi bracciale — anni 20
Abita in casaggio locale di Pasolani.

Biasi Russo bracciale — anni 60
Abita in casaggio locale di Pasolani.
Lucia padre — anni 80`, "it").households;
  assert.deepEqual(Array.from(italian, record => record.household_head), ["Cesare Tenuta", "Carlo Padre", "Biasi Russo"]);
  assert.match(italian[2].members_text, /Lucia padre/, "a lowercase padre is still a dependent");
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

test("a father named without a comma is not part of the head's name", () => {
  const data = parsePlainText(`Giovanni di Rangho, son of Antonio, day laborer — age 28
He lives in a house in San Nicola.

Giovanni di Rangho son of Paulo, day laborer — age 21
He lives in a house in San Nicola.

Gennaro Belmonte son of Santo, shepherd — age 59
He lives in a house in San Nicola.`);

  assert.deepEqual([...data.households.map(record => record.household_head)], [
    "Giovanni di Rangho",
    "Giovanni di Rangho",
    "Gennaro Belmonte"
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

// The bilingual Marano source stays on the developer's computer; when CATASTO_VALIDATION_MD names it, its
// Italian and English sides must describe the same households.
const bilingualSource = await validationSource();
test("the Italian and English sides of the current Marano source agree", { skip: !bilingualSource && "CATASTO_VALIDATION_MD is not set" }, async () => {
  const text = bilingualSource;
  const english = parsePlainText(text, "en").households;
  const italian = parsePlainText(text, "it").households;

  const key = name => String(name || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\b(?:the|magnific[oa]|magnificent|don|donna|via publica|public road)\b/g, "").replace(/[^a-z]+/g, " ").trim();
  // A household read on one side only usually means a formatting problem in the source on the other
  // side (a member list run into one heading line, or an age written another way); the message names them.
  const heads = records => new Set(records.map(record => key(record.household_head).split(" of ")[0]));
  const only = (records, other) => records.filter(record => !other.has(key(record.household_head).split(" of ")[0]))
    .map(record => `${record.household_head} (p. ${record.source_pages.join(", ")})`);
  const onlyEnglish = only(english, heads(italian));
  const onlyItalian = only(italian, heads(english));
  assert.equal(italian.length, english.length,
    `English ${english.length} households, Italian ${italian.length}. Only in English: ${onlyEnglish.join("; ") || "none"}. Only in Italian: ${onlyItalian.join("; ") || "none"}.`);
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
  // The same people, and a residence on both sides or on neither (parser version 10).
  const people = records => records.reduce((sum, record) => sum + record.members_text.split("\n").filter(Boolean).length, 0);
  assert.equal(people(italian), people(english));
  const placed = records => records.filter(record => record.residence.place).length;
  assert.equal(placed(italian), placed(english));
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

test("a section label on the page heading's own line is read", () => {
  const text = `### **Casale Esempio 1760: Page 3** **Italian Transcription:**

Pietro Lombardo massaro — anni 60
Abita in casa propria sita nel Piano, giusta li beni di Matteo Ferrandina.

**English Translation:**

Pietro Lombardo, farmer — age 60
He lives in his own house situated in Piano, bordering Matteo Ferrandina.

### **Casale Esempio 1760: Page 4 Book cover**

Not part of either section.`;
  const italian = parsePlainText(text, "it");
  assert.deepEqual([...italian.households.map(record => record.household_head)], ["Pietro Lombardo"]);
  assert.deepEqual([...italian.households[0].source_pages], [3]);
  assert.match(italian.households[0].source_entry, /Abita/);
  assert.doesNotMatch(italian.households[0].source_entry, /lives|Not part/);
  assert.doesNotMatch(parsePlainText(text, "en").households[0].source_entry, /Abita|Not part/);
});

const { extractTranscriptionSections } = context.window.CatastoParser;
const sectionMarks = text => extractTranscriptionSections(text, "en").text.split("\n")
  .flatMap((line, index, lines) => {
    const kind = line.match(/^\[\[SECTION:(\w+)\]\]$/)?.[1];
    return kind ? [`${kind}: ${lines[index + 1].replace(/\*\*/g, "").trim()}`] : [];
  });

test("section headings are classed by the kind of people they list, in either language", () => {
  const plain = [
    "**Cittadini**", "", "Marco Ferrari, laborer — age 40", "", "He lives in his own house.", "",
    "**Forestieri abitanti — Laici**", "", "Luca Neri, of Valdorso — age 50", "",
    "**Lay Residents from Outside the Area**", "", "Gaspare Bianchi, from the Land of Montebello, age 30", "",
    "**Non-Resident Foreigners — Laymen**", "", "Pietro Neri of Montebello", "",
    "**Foreign Lay Landowners (Non-residents)**", "", "Magnifico Paolo Rossi of the city of Montebello", "",
    "He possesses a vineyard.", "", "**Chiese e Monasteri per forastieri bonatenenti**", "",
    "**Collettoria generale**", "**— Cittadini —**", "", "| Marco Ferrari | 12 |"
  ].join("\n");
  assert.deepEqual(sectionMarks(plain), [
    "resident: Cittadini",
    "resident: Forestieri abitanti — Laici",
    "resident: Lay Residents from Outside the Area",
    "excluded: Non-Resident Foreigners — Laymen",
    "excluded: Foreign Lay Landowners (Non-residents)",
    "excluded: Chiese e Monasteri per forastieri bonatenenti",
    "summary: Collettoria generale",
    "resident: — Cittadini —"
  ]);
});

test("lines inside an entry are never headings", () => {
  const plain = [
    "Don Antonio Ferrari, priest — age 50", "Maria, widow, sister — age 60", "",
    "A chapel under the Right of Patronage of his family.", "",
    "Venerable Chapel of the Rosary located in the Borgo", "",
    "He pays to the Reverend Clergy of this Land ten carlini.", "",
    "Citizens with debts — 12 ounces"
  ].join("\n");
  assert.deepEqual(sectionMarks(plain), []);
});

test("a payee label standing alone is not a heading, so the residents after it are kept", () => {
  const english = [
    "Bruno Ventrella, farmer — age 40", "He lives in his own house.", "",
    "To the Chapel of the Rosary", "", "Five ducats annually.", "",
    "Carlo Rossi, farmer — age 50", "He lives in his own house."
  ].join("\n");
  const italian = [
    "Bruno Ventrella, bracciale — anni 40", "Abita in casa propria.", "",
    "Alla Cappella del Rosario", "", "Annui carlini cinque.", "",
    "Carlo Rossi, bracciale — anni 50", "Abita in casa propria."
  ].join("\n");
  assert.deepEqual(sectionMarks(english), []);
  assert.deepEqual(sectionMarks(italian), []);
  assert.deepEqual(Array.from(parsePlainText(english, "en").households, record => record.household_head), ["Bruno Ventrella", "Carlo Rossi"]);
  assert.deepEqual(Array.from(parsePlainText(italian, "it").households, record => record.household_head), ["Bruno Ventrella", "Carlo Rossi"]);
  // A real section heading is still one.
  assert.deepEqual(sectionMarks(english.replace("To the Chapel of the Rosary", "Chapels of this Land")), ["excluded: Chapels of this Land"]);
});

test("excluded sections are kept with their heading and pages, apart from the entries; summaries are not", () => {
  const page = (number, body) => `### **Valdorso 1754: Page ${number}**\n\nEnglish Translation:\n\n${body}\n`;
  const data = parsePlainText([
    page(1, "Bruno Ventrella, farmer — age 40\nHe lives in his own house.\n\n**Foreign Lay Landowners**\n\nAntonio La Piana of the city of Montefinto\nHe possesses a vineyard, bordering Paolo Serra."),
    page(2, "Giacomo Giraldi, of the city of Cosenza\nHe possesses a garden, bordering Bruno Ventrella.\n\n**Tax Collection**\n\nAntonio La Piana — 6 ounces")
  ].join("\n"), "en");
  assert.deepEqual(Array.from(data.households, record => record.household_head), ["Bruno Ventrella"]);
  const sections = JSON.parse(JSON.stringify(data.excluded_sections));
  assert.equal(sections.length, 1);
  assert.equal(sections[0].heading, "Foreign Lay Landowners");
  assert.deepEqual(sections[0].source_pages, [1, 2]);
  assert.deepEqual(sections[0].source_page_breaks, [{ page: 1, starts_with: "Antonio La Piana of the city of Montefinto" }, { page: 2, starts_with: "Giacomo Giraldi, of the city of Cosenza" }]);
  assert.match(sections[0].source_entry, /^Antonio La Piana[\s\S]*bordering Bruno Ventrella\.$/);
  assert.equal(sections[0].source_entry.includes("Tax Collection"), false);
  assert.deepEqual(Array.from(parsePlainText("Bruno Ventrella, farmer — age 40\nHe lives in his own house.", "en").excluded_sections), []);
});

test("an English heading takes its kind from the Italian heading in the same place on the page", () => {
  const text = [
    "### **Valdorso 1754: Page 12** **Italian Transcription**", "", "**Forastieri abitanti — Laici**", "",
    "Luca Neri di Montebello — anni 50", "",
    "**English Translation**", "", "**Lay Non-Resident Inhabitants**", "", "Luca Neri of Montebello — age 50", "",
    "### **Valdorso 1754: Page 13** **Italian Transcription**", "", "**Forastieri non abitanti — Laici**", "",
    "Paolo Rossi della città di Montebello", "",
    "**English Translation**", "", "**Lay Non-Resident Inhabitants**", "", "Paolo Rossi of the city of Montebello"
  ].join("\n");
  assert.deepEqual(sectionMarks(text), ["resident: Lay Non-Resident Inhabitants", "excluded: Lay Non-Resident Inhabitants"]);
});

test("a summary headed only in Italian starts at the next English text", () => {
  const text = [
    "### **Valdorso 1754: Page 40** **Italian Transcription**", "", "**Collettoria generale**", "",
    "| Marco Ferrari | 12 |",
    "### **Valdorso 1754: Page 41** **Italian Transcription**", "", "| Luca Neri | 8 |", "",
    "**English Translation**", "", "| Luca Neri | 8 |"
  ].join("\n");
  assert.deepEqual(sectionMarks(text), ["summary: | Luca Neri | 8 |"]);
});

test("a heading ends the entry before it, and only resident sections hold entries", () => {
  const text = [
    "**Cittadini**", "", "Marco Ferrari, laborer — age 40", "", "He lives in his own house in the Borgo.", "",
    "**Forastieri Bonatenenti Laici**", "", "Paolo Rossi of Montebello", "", "He possesses a vineyard, bordering Marco Ferrari.", "",
    "Gaspare Bianchi of Montebello, a minor — age 12", "", "He possesses a garden.", "",
    "[[SOURCE_PAGE:9]]", "", "**Forestieri abitanti Laici**", "", "Luca Neri, shoemaker — age 50", "", "He lives in a rented house.", "",
    "**Collettoria**", "", "**Cittadini**", "", "Marco Ferrari — age 40 | 12 |", "", "Luca Neri — age 50 | 8 |"
  ].join("\n");
  const records = parsePlainText(text).households;
  assert.deepEqual(Array.from(records, record => record.household_head), ["Marco Ferrari", "Luca Neri"], "no entry from the excluded section or the summary");
  assert.equal(records[0].source_entry, "Marco Ferrari, laborer — age 40\n\nHe lives in his own house in the Borgo.");
  assert.equal(records[1].source_entry, "Luca Neri, shoemaker — age 50\n\nHe lives in a rented house.", "neither heading nor summary is part of the entry");
  assert.deepEqual(Array.from(records[1].source_pages), [9]);
});

test("a source without section headings parses as before", () => {
  const text = "Marco Ferrari, laborer — age 40\n\nHe lives in his own house.\n\nLuca Neri, laborer — age 50\n\nHe lives in the Borgo.";
  assert.deepEqual(Array.from(parsePlainText(text).households, record => record.household_head), ["Marco Ferrari", "Luca Neri"]);
});

// Each household is one head and one residence sentence; returns [place, neighbors] per household.
const residences = (lines, language = "en") => JSON.parse(JSON.stringify(parsePlainText(lines.join("\n\n"), language).households
  .map(record => [record.residence.place, record.residence.adjacent_to])));

test("the English and Italian sides of one entry give the same residence (parser version 10)", () => {
  // A placeholder sentence gives way to the next one with words in it.
  assert.deepEqual(residences(["Marco Monaco, day laborer — age 40\nHe lives...\nHe lives in his own house in Li Pasolani, bordering Ignazio Zupo and the public road."]),
    [["Li Pasolani", ["Ignazio Zupo", "public road"]]]);
  assert.deepEqual(residences(["Marco Monaco bracciale — anni 40\nAbita...\nAbita in casa propria di li Pasolani, giusta li beni di Ignazio Zupo e via publica."], "it"),
    [["li Pasolani", ["Ignazio Zupo", "via publica"]]]);
  // Translations without a subject, and boundaries other than "bordering".
  assert.deepEqual(residences([
    "Saverio di Bartolo, farmer — age 50\nLives in his own house called San Nicola, adjacent to the property of Marzio and Ignazio di Bartolo.",
    "Nicolò Conforto, day laborer — age 30\nHe lives in his own house in San Nicola, next to Zeno Conforto and the public road.",
    "Gennaro Ritaccha, day laborer — age 30\nHe lives in his own house in the Pasolani district, contiguous to Lorenzo Russo and the public road.",
    "Giuseppe Morrone, day laborer — age 30\nHe lives in his own house called Pasolani, adjacent to 18 ounces the property of Bruno Perrotta, and the public road",
    "Biasi Santanna, day laborer — age 30\nHe lives in his own house in the San Nicola quarter, bordering Pietro Santanna.",
    "Ottavio Salerno, day laborer — age 30\nHe lives in the house of GiovanniBattista Serpe next to the Land of Rende and pays for it an annual rent of thirty-two carlini",
    "Stefano Nigro, day laborer — age 30\nHe lives in a house owned by Giovanni Orrico and pays rent.",
    "Francesca Principe, widow — age 40\nShe possesses her own house located in the San Nicola neighborhood, bordering the property of Matteo Iandria and the public road —"
  ]), [
    ["San Nicola", ["Marzio di Bartolo", "Ignazio di Bartolo"]],
    ["San Nicola", ["Zeno Conforto", "public road"]],
    ["Pasolani", ["Lorenzo Russo", "public road"]],
    ["Pasolani", ["Bruno Perrotta", "public road"]],
    ["San Nicola", ["Pietro Santanna"]],
    ["Not Listed", []],
    ["Not Listed", []],
    ["San Nicola", ["Matteo Iandria", "public road"]]
  ]);
  // Italian house places without "sita" or "in", and another's house.
  assert.deepEqual(residences([
    "Antonio Morello bracciale — anni 40\nAbita in casa propria li Malvitani giusta li beni di Vincenzo Morello e via publica.",
    "Gaetano Tenuta bracciale — anni 40\nAbita in casaggio detto li Malvitani giusta li beni di Pietro Tenuta.",
    "Leonardo Coscarello pecoraro — anni 55\nAbita in casaggio proprio di Santo Nicola giusta li beni di Pietro Tenuta.",
    "Biasi Santanna bracciale — anni 40\nAbita in casaggio del San Nicola giusta li beni di Pietro Santanna.",
    "Innocenzo Militerni bracciale — anni 40\nAbita in casa propria consistente in più membri, giusta li beni di Giuseppe Volpentesta e via publica.",
    "Ignazio Carvello sacerdote — anni 50\nAbita in casa d'essa Matrice Chiesa.",
    "Francesca Principe vedova — anni 40\nPossiede la casa propria locata nelli San Nicola, giusta li beni di Matteo Iandria e via publica —",
    "Ottavio Salerno bracciale — anni 30\nAbita in casa di GiovanniBattista Serpe giusta Terra di Rende e ne paga per annui Carlini trentadue affitto"
  ], "it"), [
    ["li Malvitani", ["Vincenzo Morello", "via publica"]],
    ["li Malvitani", ["Pietro Tenuta"]],
    ["Santo Nicola", ["Pietro Tenuta"]],
    ["San Nicola", ["Pietro Santanna"]],
    [null, ["Giuseppe Volpentesta", "via publica"]],
    ["Not Listed", []],
    ["San Nicola", ["Matteo Iandria", "via publica"]],
    ["Not Listed", []]
  ]);
});

test("a head's origin is his residence when none is given, in either language", () => {
  const english = parsePlainText([
    "Antonio di Rangho, from the Land of Marano Principato — age 30\nHe possesses no assets.",
    "Antonio Scillaro, day laborer, also from the Land of Rende — age 69\nDianora Tenuta, wife — age 59\nHe possesses no assets.",
    "Magnifica Cassandra Conte of the city of Cosenza, maiden and head of household — age 50\nShe possesses no assets."
  ].join("\n\n")).households;
  assert.deepEqual(Array.from(english, record => record.household_head), ["Antonio di Rangho", "Antonio Scillaro", "Magnifica Cassandra Conte"]);
  assert.deepEqual(Array.from(english, record => record.residence.place), ["Marano Principato", null, "Cosenza"]);
  // The origin is dropped from the member line, but the age stays.
  assert.equal(english[1].members_text.split("\n")[0], "Antonio Scillaro, day laborer — age 69");
  const italian = parsePlainText([
    "Antonio di Rangho, puglia della Terra di Marano Principato — anni 30\nNon possiede beni.",
    "Magnifica Cassandra Conte della città di Cosenza, vergine in capillis — anni 50\nNon possiede beni."
  ].join("\n\n"), "it").households;
  assert.deepEqual(Array.from(italian, record => record.residence.place), ["Marano Principato", "Cosenza"]);
});

test("a title naming both languages opens no section", () => {
  const text = [
    "### **Italian Transcription and English Translation of the** **1754 Catasto Onciario**",
    "",
    "**Elite Neighbors:** an editor's note on properties bordering the local elite.",
    "",
    "### **Marano Marchesato 1754: Page 4** **Italian Transcription:**",
    "",
    "Angelo Chiappetta bracciale — anni 40",
    "Abita in casa propria sita nelli Pasolani giusta li beni di Isabella Orrico.",
    "",
    "### **Marano Marchesato 1754: Page 4** **English Translation:**",
    "",
    "Angelo Chiappetta, day laborer — age 40",
    "He lives in his own house in the Pasolani district, bordering Isabella Orrico."
  ].join("\n");
  const { extractTranscriptionSections } = context.window.CatastoParser;
  assert.doesNotMatch(extractTranscriptionSections(text, "it").text, /Elite Neighbors/);
  assert.doesNotMatch(extractTranscriptionSections(text, "en").text, /Elite Neighbors/);
});

test("a swaddled infant is a member, and a parish priest of the Mother Church heads his own household", () => {
  const italian = parsePlainText("Michele Tenuta bracciale — anni 30\nAntonia Chiappetta moglie — anni 29\nSanto figlio nella fascia\nFrancesca figlia — anni 3\nAbita in casa propria di San Nicola.", "it").households;
  assert.deepEqual(italian[0].members_text.split("\n"), ["Michele Tenuta bracciale — anni 30", "Antonia Chiappetta moglie — anni 29", "Santo figlio nella fascia", "Francesca figlia — anni 3"]);
  const english = parsePlainText([
    "Don Antonio Morrone, Deacon — age 22",
    "He possesses the house where he lives in the Pasolani district, bordering Bruno Perrotta.",
    "Don Ignazio Carvello, from the Casale of Aprigliano, Priest and Parish Priest in the Mother Church of this City of Marano — age 50.",
    "He lives in the house of the said Mother Church."
  ].join("\n")).households;
  assert.deepEqual(Array.from(english, record => record.household_head), ["Don Antonio Morrone", "Don Ignazio Carvello"]);
});

test("each image's START OF RECORD marker is a page, numbered from the image's file name", () => {
  const text = [
    "DO NOT EDIT OR DELETE THIS BLOCK",
    "Native-language transcription: Italian",
    "",
    "# Transcription Output",
    "--- START OF RECORD: Lappano Catasto Onciario 1742_010.png ---",
    "Italian Transcription:",
    "13.",
    "Dom.co Cistaro pecoraro, brac.le, anni 62.",
    "Finita Imbrogna moglie, anni — 50.",
    "Industria di Dom.co — on 12.",
    "Abita in casa propria.",
    "--- START OF RECORD: Lappano Catasto Onciario 1742_011.png ---",
    "Italian Transcription:",
    "= B. ril:",
    "C.",
    "14.o",
    "Dianora Sproviero moglie di Saverio Pastore",
    "assente anni 6. senza notizia, dove abita anni 49.",
    "Pascale figlio, anni — 10.",
    "Abita in casa propria.",
    "15",
    "Filippo Pastore, bracc.le, anni — 51.",
    "Industria — on 12.",
    "--- END OF RECORD ---"
  ].join("\n");
  const data = parsePlainText(text, "it");
  assert.equal(data.source_title, "Lappano Catasto Onciario 1742");
  assert.deepEqual(Array.from(data.households, household => Array.from(household.source_pages)), [[10], [11], [11]]);
  // The entry number and the notes at the top of the image belong to the household they head.
  assert.match(data.households[1].source_entry, /^= B\. ril:\nC\.\n14\.o\nDianora Sproviero/);
  assert.doesNotMatch(data.households[0].source_entry, /START OF RECORD|14\.o|ril:/);
  assert.equal(data.households[2].household_head, "Filippo Pastore");

  // Without section labels, the marker still starts the page and is not kept as text.
  const plain = parsePlainText(text.replace(/^Italian Transcription:\n/gm, ""), "it");
  assert.deepEqual(Array.from(plain.households, household => Array.from(household.source_pages)), [[10], [11], [11]]);
  assert.ok(plain.households.every(household => !/RECORD/.test(household.source_entry)));
});

test("a record marker without a number in the image name takes its position", () => {
  const data = parsePlainText([
    "--- START OF RECORD: front page.jpg ---",
    "Dom.co Cistaro pecoraro, anni 62.",
    "Abita in casa propria.",
    "--- START OF RECORD: back page.jpg ---",
    "Filippo Pastore, bracc.le, anni 51.",
    "Abita in casa propria."
  ].join("\n"), "it");
  assert.deepEqual(Array.from(data.households, household => Array.from(household.source_pages)), [[1], [2]]);
  assert.equal(data.source_title, "front page");
});

test("a record marker naming the page reads as a page heading, with the section label on the same line", () => {
  const marked = [
    "### **START OF RECORD: Marano Marchesato 1754 \\- Page 1, 2: Archivio di Stato Cosenza header**",
    "### **START OF RECORD: Marano Marchesato 1754 \\- Page 5** **Italian Transcription**",
    "Angelo Chiappetta pecoraro anni 30",
    "Rosolia Bruno moglie anni 26",
    "",
    "Abita in casa propria sita nelli Pajoli.",
    "",
    "**English Translation:**",
    "",
    "Angelo Chiappetta, shepherd, age 30",
    "Rosolia Bruno, wife, age 26",
    "",
    "He lives in his own house situated in the Pajoli neighborhood.",
    "",
    "**START OF RECORD: Marano Marchesato 1754 \\- Page 6**  ",
    "**Italian Transcription:**",
    "Andrea Orrico bracciale anni 50",
    "",
    "Abita in casa propria sita in San Nicola.",
    "",
    "**English Translation:**",
    "Andrea Orrico, day laborer, age 50",
    "",
    "He lives in his own house situated in San Nicola."
  ].join("\n");
  const headed = marked.replace(/^(?:### )?\*\*START OF RECORD: (.+?) \\- (Page [^*]+)\*\*/gm, "**$1: $2**");
  for (const language of ["en", "it"]) {
    const fromMarkers = parsePlainText(marked, language);
    const fromHeadings = parsePlainText(headed, language);
    assert.equal(fromMarkers.source_title, "Marano Marchesato 1754");
    assert.deepEqual(Array.from(fromMarkers.households, household => Array.from(household.source_pages)), [[5], [6]]);
    assert.deepEqual(JSON.parse(JSON.stringify(fromMarkers.households)), JSON.parse(JSON.stringify(fromHeadings.households)));
  }
});

test("a bare number opens a household only when a head follows it (R4-01)", () => {
  const amount = parsePlainText("Bruno Ventrella, farmer — age 40\nHe lives in his own house.\n10\nHe owns a vineyard bordering Carlo Rossi.", "en");
  assert.equal(amount.households.length, 1);
  assert.match(amount.households[0].source_entry, /\n10\nHe owns a vineyard bordering Carlo Rossi\.$/);

  const trailing = parsePlainText("Bruno Ventrella, farmer — age 40\nHe lives in his own house.\n12", "en");
  assert.equal(trailing.households[0].source_entry, "Bruno Ventrella, farmer — age 40\nHe lives in his own house.\n12");

  const numbered = parsePlainText([
    "Bruno Ventrella, farmer — age 40", "He lives in his own house.", "10", "He owns a vineyard bordering Carlo Rossi.",
    "11.", "Carlo Rossi, day laborer — age 30", "He lives in a rented house."
  ].join("\n"), "en");
  assert.deepEqual(Array.from(numbered.households, household => household.household_head), ["Bruno Ventrella", "Carlo Rossi"]);
  assert.match(numbered.households[0].source_entry, /vineyard bordering Carlo Rossi\.$/);
  assert.match(numbered.households[1].source_entry, /^11\.\nCarlo Rossi/);
});
