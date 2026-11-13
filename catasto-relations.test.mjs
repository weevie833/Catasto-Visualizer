import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const parserSource = await readFile(new URL("./catasto-parser.js", import.meta.url), "utf8");
const relationsSource = await readFile(new URL("./catasto-relations.js", import.meta.url), "utf8");

function loadRelations() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  vm.runInContext(relationsSource, context);
  return context.window.CatastoRelations;
}

const R = loadRelations();

function household(id, head, members, extra = {}) {
  return {
    id,
    household_id: id,
    household_head: head,
    members_text: members.join("\n"),
    source_entry: members.join("\n"),
    source_pages: [extra.page ?? 1],
    residence: { place: extra.place ?? "San Nicola", adjacent_to: (extra.links || []).map(link => link.name) },
    residence_links: extra.links || [],
    ...extra.fields
  };
}

const link = (name, householdId, status = "resolved") => ({
  name, kind: "person", household_id: householdId, candidate_household_ids: householdId ? [householdId] : [], resolution_status: status
});

function project() {
  return {
    source_title: "Test Catasto",
    households: [
      household("h-angelo", "Angelo Chiappetta", [
        "Angelo Chiappetta pecoraro anni 30",
        "Rosolia Bruno moglie anni 26",
        "Pietro figlio anni 3",
        "Giulia figlia anni 1",
        "Elisabetta Rossi nipote anni 2"
      ], { page: 5, place: "Pajoli", links: [link("Isabella Orrico", "h-isabella"), link("Donato Ponzo", null, "unresolved")] }),
      household("h-isabella", "Isabella Orrico", ["Isabella Orrico vedova anni 50"], { page: 7, place: "Pajoli", links: [link("Angelo Chiappetta", "h-angelo")] }),
      household("h-achille", "Achille Covello", [
        "Achille Covello Bracciale — anni 65",
        "Pietro figlio bracciale — anni 40",
        "Anna Spizzirri, nuora — anni 20"
      ], { page: 12 }),
      household("h-anna", "Anna Ruffulo", ["Anna Ruffulo vedova del fu Domenico Covello — anni 60"], {
        page: 355, links: [link("Achille Covello", "h-achille")],
        fields: { source_entry: "Anna Ruffulo vedova del fu Domenico Covello — anni 60\n\nPossiede una possessione detta San Nicola di capacità moggio mezzo confina Achille Covello e via publica, stimata la rendita per carlini dieci." }
      }),
      household("h-bruno", "Gennaro Bruno", ["Gennaro Bruno pecoraro anni 55"], { page: 40, place: "Pajoli", links: [link("Isabella Orrico", "h-isabella")] }),
      household("h-bruno2", "Marco Bruno", ["Marco Bruno bracciale anni 20"], { page: 41, place: "Cerisano" }),
      household("h-bruno3", "Paolo Bruno", ["Paolo Bruno bracciale anni 90"], { page: 42, place: "Malvitani" }),
      household("h-serpe", "Pascale Serpe", [
        "Pascale Serpe, day laborer, age 30",
        "Teresa Bartella, wife, age 25",
        "Stefano Bartella, brother-in-law, day laborer, age 14",
        "Gaetano, son, age 5"
      ], { page: 288, place: "San Nicola" }),
      household("h-english", "Marco Rossi", [
        "Marco Rossi, day laborer, age 50",
        "Lucia, sister, age 40",
        "Carlo, brother, age 45"
      ], { page: 20, place: "Pasolani" })
    ]
  };
}

const build = (data, subject, language = "en") => R.buildPersonReport(data, subject, { language });
const section = (report, key) => report.sections.find(part => part.key === key);
// Arrays made inside the vm context are compared by value after copying them into this realm.
const texts = items => Array.from(items, item => item.text);

test("a head's report lists stated family by degree and keeps nipote out of the first degree", () => {
  const report = build(project(), { householdId: "h-angelo", position: 0 });
  assert.equal(report.subjectName, "Angelo Chiappetta");
  assert.deepEqual(texts(report.summary), [
    "Angelo Chiappetta, pecoraro, age 30.",
    "Head of a household of 5.",
    "Residence: Pasolani.",
    "Source: Test Catasto, p. 5"
  ]);
  assert.deepEqual(texts(section(report, "first").items), [
    "Wife: Rosolia Bruno, age 26",
    "Son: Pietro Chiappetta, age 3",
    "Daughter: Giulia Chiappetta, age 1"
  ]);
  assert.deepEqual(texts(section(report, "second").items), ["Nipote (niece, nephew, or grandchild): Elisabetta Rossi, age 2"]);
  assert.ok(section(report, "first").items.every(item => !item.derived), "relations to the head are stated, not derived");
});

test("a member's report marks relations that are derived rather than stated", () => {
  const report = build(project(), { householdId: "h-angelo", position: 2 });
  assert.equal(report.subjectName, "Pietro Chiappetta");
  assert.equal(report.summary[1].text, "Son in Angelo Chiappetta's household (5 listed).");
  const first = section(report, "first").items;
  assert.deepEqual(texts(first), ["Father: Angelo Chiappetta, pecoraro, age 30", "Mother: Rosolia Bruno, age 26", "Sister: Giulia Chiappetta, age 1"]);
  assert.equal(first[0].derived, null);
  assert.match(first[1].derived, /could be a step-parent/);
  assert.match(first[2].derived, /both listed as children of the head/);
  assert.deepEqual(texts(section(report, "others").items), ["Elisabetta Rossi, age 2 (nipote of the head)"]);
});

test("a daughter-in-law's possible husbands are not presented as certain", () => {
  const report = build(project(), { householdId: "h-achille", position: 2 });
  assert.deepEqual(texts(section(report, "first").items), []);
  assert.equal(section(report, "first").emptyText, "None stated in this entry.");
  const second = section(report, "second").items;
  assert.deepEqual(texts(second), ["Father-in-law: Achille Covello, Bracciale, age 65", "Husband or brother-in-law: Pietro Covello, bracciale, age 40"]);
  assert.match(second[1].derived, /does not say which/);
});

test("neighbors show both directions and say when a neighbor has no household entry", () => {
  const angelo = section(build(project(), { householdId: "h-angelo", position: 0 }), "third").items;
  assert.deepEqual(texts(angelo), [
    "Residence:",
    "Isabella Orrico — each entry names the other as a neighbor (p. 5, p. 7)",
    "Donato Ponzo — named as a neighbor in this entry (p. 5); no household entry found",
    "Land:",
    "No land neighbors named."
  ]);
  assert.equal(angelo[1].household, "h-isabella");
  const achille = section(build(project(), { householdId: "h-achille", position: 0 }), "third").items;
  assert.deepEqual(texts(achille), [
    "Residence:",
    "Anna Ruffulo — names this household as a neighbor (p. 355)",
    "Land:",
    "Anna Ruffulo — names this household's head as a land neighbor (p. 355)"
  ]);
});

test("a member's neighbors are introduced as the household's", () => {
  const items = section(build(project(), { householdId: "h-angelo", position: 1 }), "third").items;
  assert.equal(items[0].text, "The household's residence:");
  assert.equal(items[0].kind, "subheading");
});

test("English entries work, and siblings of the head are each other's siblings", () => {
  const report = build(project(), { householdId: "h-english", position: 1 });
  assert.equal(report.subjectName, "Lucia Rossi");
  assert.deepEqual(texts(section(report, "first").items), ["Brother: Marco Rossi, day laborer, age 50", "Brother: Carlo Rossi, age 45"]);
  assert.match(section(report, "first").items[1].derived, /both listed as siblings of the head/);
});

test("a person named only in other entries gets the entries that name them", () => {
  const report = build(project(), { name: "Donato Ponzo" });
  assert.equal(report.householdId, null);
  assert.equal(report.summary[1].text, "No household entry of their own.");
  assert.equal(section(report, "first").emptyText, "No household entry, so no family is listed.");
  assert.deepEqual(texts(section(report, "third").items).slice(0, 2), ["Residence:", "Angelo Chiappetta — names them as a neighbor (p. 5)"]);
});

test("an ambiguous reference lists the candidate households", () => {
  const report = build(project(), { name: "Pietro Covello", candidateIds: ["h-achille", "h-anna"] });
  assert.deepEqual(texts(report.summary).slice(2, 5), ["Could be one of these household heads:", "Achille Covello (p. 12)", "Anna Ruffulo (p. 355)"]);
});

test("a reference without stored candidates is matched to same-name household heads", () => {
  const report = build(project(), { name: "Isabella Orrico" });
  assert.deepEqual(texts(report.summary).slice(2, 4), ["Could be this household head:", "Isabella Orrico (p. 7)"]);
  assert.deepEqual(texts(build(project(), { name: "Donato Ponzo", candidateIds: [] }).summary).slice(0, 2), ["Donato Ponzo", "No household entry of their own."]);
});

test("every degree section is present, with leads after the family and no institutions section", () => {
  const report = build(project(), { householdId: "h-anna", position: 0 });
  assert.deepEqual(Array.from(report.sections, part => part.key), ["first", "second", "leads", "third"]);
  assert.deepEqual(Array.from(build(project(), { name: "Donato Ponzo", candidateIds: [] }).sections, part => part.key), ["first", "second", "third"]);
});

test("land neighbors are read from landholding clauses", () => {
  const items = section(build(project(), { householdId: "h-anna", position: 0 }), "third").items;
  assert.deepEqual(texts(items).slice(-2), ["Land:", "Achille Covello — borders this household's land (p. 355)"]);
  assert.equal(items.at(-1).household, "h-achille");
});

test("a wife's birth-family leads are ranked by independent clues", () => {
  const leads = section(build(project(), { householdId: "h-angelo", position: 1 }), "leads").items;
  assert.equal(leads[0].kind, "note");
  assert.equal(leads[1].text, "Possible birth family: 3 other households headed by a Bruno");
  assert.equal(leads[2].text, "Strong lead: Gennaro Bruno, pecoraro, age 55 — Pasolani (p. 40)");
  assert.deepEqual(Array.from(leads[2].clues), ["one household away, through Isabella Orrico", "same district (Pasolani)", "age 55: old enough to be a parent"]);
  assert.equal(leads[3].text, "Weak lead. Other Bruno households with no stronger clue: Marco Bruno (Cerisano, p. 41); Paolo Bruno (Malvitani, p. 42)");
});

test("a head's leads look for relatives, and list women of the surname married elsewhere", () => {
  const leads = texts(section(build(project(), { householdId: "h-bruno", position: 0 }), "leads").items);
  assert.equal(leads[1], "Possible relatives: 2 other households headed by a Bruno");
  assert.deepEqual(leads.slice(-2), ["Women of the Bruno surname in other households:", "Rosolia Bruno, age 26 — wife in Angelo Chiappetta's household, Pasolani (p. 5)"]);
});

test("a widow's leads cover her birth surname and her late husband's family", () => {
  const leads = section(build(project(), { householdId: "h-anna", position: 0 }), "leads").items;
  const late = leads.findIndex(item => item.text.startsWith("Possible family of the late husband"));
  assert.equal(leads[late].text, "Possible family of the late husband, Domenico Covello: 1 household");
  assert.equal(leads[late + 1].text, "Strong lead: Achille Covello, Bracciale, age 65 — San Nicolo (p. 12)");
  assert.deepEqual(Array.from(leads[late + 1].clues), [
    "lives next to this household", "their land and this household's land border each other", "same district (San Nicolo)",
    "rare surname: only 1 household head has it"
  ]);
});

test("an in-law who shares the wife's surname is derived as her sibling", () => {
  const report = build(project(), { householdId: "h-serpe", position: 2 });
  const first = section(report, "first").items;
  assert.equal(first[0].text, "Sister: Teresa Bartella, age 25");
  assert.match(first[0].derived, /shares a surname with the head's wife/);
  assert.deepEqual(texts(section(report, "second").items), ["Brother-in-law: Pascale Serpe, day laborer, age 30", "Nephew: Gaetano Serpe, age 5"]);
  const wife = section(build(project(), { householdId: "h-serpe", position: 1 }), "first").items;
  assert.ok(wife.some(item => item.text === "Brother: Stefano Bartella, day laborer, age 14" && item.derived));
});

test("with no other household of the surname, the leads section says so", () => {
  const report = build(project(), { householdId: "h-english", position: 0 });
  assert.equal(section(report, "leads").emptyText, "No other household is headed by someone with this surname.");
});

test("the report follows the interface language", () => {
  const report = build(project(), { householdId: "h-angelo", position: 2 }, "it");
  assert.equal(report.title, "Prove adiacenti");
  assert.equal(report.summary[1].text, "Figlio nella famiglia di Angelo Chiappetta (5 elencati).");
  assert.equal(section(report, "first").heading, "Primo grado: famiglia stretta");
  assert.equal(section(report, "first").items[0].text, "Padre: Angelo Chiappetta, pecoraro, anni 30");
});

test("a changed project is reindexed, so an edit shows in the next report", () => {
  const data = project();
  assert.equal(build(data, { householdId: "h-anna", position: 0 }).summary[2].text, "Residence: San Nicolo.");
  const edited = structuredClone(data);
  edited.households[3].residence.place = "Pasolani";
  assert.equal(build(edited, { householdId: "h-anna", position: 0 }).summary[2].text, "Residence: Pasolani.");
});

test("plain text output keeps derived labels", () => {
  const text = R.reportToText(build(project(), { householdId: "h-angelo", position: 2 }));
  assert.match(text, /^ADJACENT EVIDENCE: Pietro Chiappetta/);
  assert.match(text, /Mother: Rosolia Bruno, age 26\n {2}\(Derived: listed as the head's spouse; could be a step-parent\)/);
  assert.match(R.reportToText(build(project(), { householdId: "h-angelo", position: 1 })), /Strong lead: Gennaro Bruno[^\n]*\n {2}- one household away/);
});

test("names in the report carry the person they lead to", () => {
  const pietro = build(project(), { householdId: "h-angelo", position: 2 });
  assert.deepEqual(JSON.parse(JSON.stringify(pietro.summary[1].links)), [{ label: "Angelo Chiappetta", target: { householdId: "h-angelo", position: 0 } }]);
  const mother = section(pietro, "first").items[1];
  assert.deepEqual(JSON.parse(JSON.stringify(mother.links)), [{ label: "Rosolia Bruno", target: { householdId: "h-angelo", position: 1 } }]);

  const third = section(build(project(), { householdId: "h-angelo", position: 0 }), "third").items;
  assert.deepEqual(JSON.parse(JSON.stringify(third[1].links[0].target)), { householdId: "h-isabella", position: 0 });
  assert.deepEqual(JSON.parse(JSON.stringify(third[2].links[0].target)), { name: "Donato Ponzo", candidateIds: [] });

  const leads = section(build(project(), { householdId: "h-angelo", position: 1 }), "leads").items;
  assert.equal(leads[2].links[0].target.householdId, "h-bruno");
  assert.deepEqual(Array.from(leads[3].links, link => link.label), ["Marco Bruno", "Paolo Bruno"]);
  const women = section(build(project(), { householdId: "h-bruno", position: 0 }), "leads").items.at(-1);
  assert.deepEqual(Array.from(women.links, link => link.label), ["Rosolia Bruno", "Angelo Chiappetta"]);
});

test("every link label appears in its line, in order", () => {
  const subjects = [
    { householdId: "h-angelo", position: 0 }, { householdId: "h-angelo", position: 1 }, { householdId: "h-anna", position: 0 },
    { householdId: "h-bruno", position: 0 }, { householdId: "h-serpe", position: 2 }, { name: "Donato Ponzo" }
  ];
  subjects.forEach(subject => {
    const report = build(project(), subject);
    [...report.summary, ...report.sections.flatMap(part => part.items)].forEach(item => {
      let cursor = 0;
      (item.links || []).forEach(link => {
        const at = item.text.indexOf(link.label, cursor);
        assert.ok(at >= 0, `"${link.label}" is in "${item.text}"`);
        cursor = at + link.label.length;
      });
    });
  });
});

test("a source entry's names link to the head, each member by their line, and neighbors", () => {
  const links = JSON.parse(JSON.stringify(R.sourceEntryLinks(project(), "h-angelo")));
  assert.deepEqual(links.map(link => link.label), ["Angelo Chiappetta", "Rosolia Bruno", "Pietro", "Giulia", "Elisabetta Rossi", "Isabella Orrico", "Donato Ponzo"]);
  assert.deepEqual(links[2], { label: "Pietro", line: "Pietro figlio anni 3", target: { householdId: "h-angelo", position: 2 } });
  assert.deepEqual(links[5].target, { householdId: "h-isabella", position: 0 });
  assert.deepEqual(links[6].target, { name: "Donato Ponzo", candidateIds: [] });

  const anna = JSON.parse(JSON.stringify(R.sourceEntryLinks(project(), "h-anna")));
  assert.deepEqual(anna.at(-1), { label: "Achille Covello", target: { householdId: "h-achille", position: 0 } }, "named once, though both a residence and a land neighbor");
  assert.deepEqual(Array.from(R.sourceEntryLinks(project(), "h-missing")), []);
});

test("an unknown age is not evidence for or against a lead", () => {
  const data = {
    source_title: "Test Catasto",
    households: [
      household("h-subject", "Marco Ferrari", ["Marco Ferrari pecoraro"], { page: 1, place: "Pajoli" }),
      household("h-older", "Luca Ferrari", ["Luca Ferrari bracciale anni 30"], { page: 2, place: "Pajoli" }),
      household("h-unknown", "Pietro Ferrari", ["Pietro Ferrari bracciale"], { page: 3, place: "Pajoli" })
    ]
  };
  const clues = report => section(report, "leads").items.flatMap(item => Array.from(item.clues || []));
  assert.equal(clues(build(data, { householdId: "h-subject", position: 0 })).some(clue => /\bage\b/.test(clue)), false);
  assert.equal(clues(build(data, { householdId: "h-older", position: 0 })).some(clue => /\bage\b/.test(clue)), false);
});

test("a person paid is never mentioned in the payer's entry; other mentions still count", () => {
  const entry = (head, ...lines) => ({ fields: { source_entry: [`${head}, laborer, age 40`, "", ...lines].join("\n") } });
  const data = {
    source_title: "Test Catasto",
    households: [
      household("h-payer", "Vincenzo Venturo", ["Vincenzo Venturo"], { page: 3, ...entry("Vincenzo Venturo",
        "He possesses a vineyard, bordering Paolo Neri; upon which there is a debt paid to Cassandra Conte.",
        "Deductions",
        "He pays to the Magnificent Cassandra Conte, for a principal of ten ducats, ten annual carlini.",
        "To the Magnificent Cassandra Conte for a perpetual rent of five carlini.",
        "He lives in the house of Domenico Ponzo and pays thirty carlini in rent.") }),
      household("h-witness", "Anna Galli", ["Anna Galli"], { page: 5, ...entry("Anna Galli", "Her late husband sold a field to Cassandra Conte.") })
    ]
  };
  assert.deepEqual(texts(build(data, { name: "Cassandra Conte" }).summary), ["Cassandra Conte", "No household entry of their own.", "Mentioned in Anna Galli's entry (p. 5)"]);
  assert.deepEqual(texts(build(data, { name: "Domenico Ponzo" }).summary), ["Domenico Ponzo", "No household entry of their own."]);
});
