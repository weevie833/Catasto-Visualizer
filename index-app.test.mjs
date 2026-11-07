import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Runs the real Visualizer script (app.js) against a minimal DOM and an in-memory project store,
// so the visualizer's data workflows can be tested without a browser.
const parserSource = await readFile(new URL("./catasto-parser.js", import.meta.url), "utf8");
const recordsSource = await readFile(new URL("./catasto-records.js", import.meta.url), "utf8");
const relationsSource = await readFile(new URL("./catasto-relations.js", import.meta.url), "utf8");
const appScript = await readFile(new URL("./app.js", import.meta.url), "utf8");

function fakeDocument() {
  const elements = new Map();
  const element = selector => {
    if (elements.has(selector)) return elements.get(selector);
    const classes = new Set();
    let markup = "";
    const node = {
      value: "", textContent: "", hidden: false, disabled: false, placeholder: "", title: "",
      dataset: {}, options: [], style: {},
      get innerHTML() { return markup; },
      set innerHTML(value) { markup = value; this.options = []; },
      classList: {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        toggle: (name, force = !classes.has(name)) => (force ? classes.add(name) : classes.delete(name), force),
        contains: name => classes.has(name)
      },
      setAttribute() {}, getAttribute: () => null, addEventListener() {}, focus() {}, select() {},
      scrollIntoView() {}, replaceChildren() {}, add(option) { this.options.push(option); },
      querySelector: child => element(`${selector} ${child}`), querySelectorAll: () => [], closest: () => null
    };
    elements.set(selector, node);
    return node;
  };
  return {
    documentElement: {},
    querySelector: element,
    getElementById: id => element(`#${id}`),
    querySelectorAll: () => [],
    createElement: () => element(`created-${elements.size}`),
    createTextNode: text => ({ text })
  };
}

function memoryStorage(initialProjects) {
  const projects = new Map(initialProjects.map(project => [project.id, structuredClone(project)]));
  return {
    projects,
    failSaves: false,
    saves: 0,
    rawProject: null,
    async listProjects() { return [...projects.values()].map(project => structuredClone(project)); },
    async getProject(id) { return this.rawProject?.id === id ? this.rawProject : structuredClone(projects.get(id)); },
    snapshots: new Map(),
    async saveProject(project, { snapshot = null } = {}) {
      if (this.failSaves) throw new Error("Simulated storage failure.");
      this.saves += 1;
      if (snapshot) this.snapshots.set(project.id, { reason: snapshot, data: structuredClone(projects.get(project.id).data) });
      projects.set(project.id, structuredClone(project));
      return project;
    },
    createProject: project => project
  };
}

async function loadApp(projects, { rememberedId = null, blockedLocalStorage = false } = {}) {
  const preferences = new Map(rememberedId ? [["catasto-active-project", rememberedId]] : []);
  const localStorage = blockedLocalStorage
    ? { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } }
    : {
        getItem: key => preferences.get(key) ?? null,
        setItem: (key, value) => preferences.set(key, String(value)),
        removeItem: key => preferences.delete(key)
      };
  const storage = memoryStorage(projects);
  const document = fakeDocument();
  const channelListeners = [];
  class BroadcastChannel {
    constructor(name) { this.name = name; }
    addEventListener(type, listener) { if (this.name === "catasto-projects" && type === "message") channelListeners.push(listener); }
    postMessage() {}
    close() {}
  }
  const context = {
    window: { dispatchEvent() {} },
    document,
    localStorage,
    console: { ...console, warn() {}, error() {} },
    CustomEvent: class {},
    Option: class { constructor(text, value) { this.text = text; this.value = value; } },
    structuredClone,
    crypto,
    TextEncoder,
    BroadcastChannel,
    fetch: async () => { throw new Error("No network in tests."); },
    CatastoStorage: storage
  };
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  vm.runInContext(recordsSource, context);
  vm.runInContext(relationsSource, context);
  context.CatastoParser = context.window.CatastoParser;
  context.CatastoRecords = context.window.CatastoRecords;
  vm.runInContext(appScript, context);
  await new Promise(resolve => setTimeout(resolve, 10));
  return {
    storage,
    preferences,
    document,
    run: code => vm.runInContext(code, context),
    // Delivers a message as Admin would send it, then waits for the visualizer to apply it.
    async broadcast(data) {
      channelListeners.forEach(listener => listener({ data }));
      await vm.runInContext("libraryChanges", context);
    }
  };
}

function record(id, head, extra = {}) {
  return {
    id,
    household_id: id,
    household_head: head,
    members_text: `${head}, day laborer, age 40`,
    source_entry: `${head}, day laborer, age 40\nHe lives in his own house in the Pasolani district.`,
    source_pages: [1],
    residence: { place: "Pasolani", description: "He lives in his own house in the Pasolani district.", adjacent_to: [] },
    member_identities: [{ id, household_id: id, identity_type: "household-head", position: 0, source_line: `${head}, day laborer, age 40` }],
    ...extra
  };
}

// Two unrelated household heads share a name; the second is at record index 3.
function sameNameProject() {
  return {
    id: "project-a",
    name: "Test project",
    sourceFile: "test.md",
    sourceText: "",
    updatedAt: "2026-01-01T00:00:00.000Z",
    data: {
      record_id_version: 2,
      households: [
        record("angelo-chiappetta", "Angelo Chiappetta"),
        record("giacomo-covello", "Giacomo Covello"),
        record("maria-rossi", "Maria Rossi"),
        record("giacomo-covello-2", "Giacomo Covello")
      ]
    }
  };
}

const selectedRecordIndex = app => app.run("householdById.get(view.selectedId)?.recordIndex");
const selectRecord = (app, index) => app.run(`selectHousehold(households.find(unit => unit.recordIndex === ${index}).id)`);

test("saving a source entry keeps the same-name record selected", async () => {
  const app = await loadApp([sameNameProject()]);
  selectRecord(app, 3);
  app.document.querySelector("#sourceEditText").value = "Giacomo Covello, day laborer, age 41\nHe lives in his own house in the Pasolani district.";
  await app.run("saveSourceEntry()");

  assert.equal(app.storage.saves, 1);
  assert.equal(selectedRecordIndex(app), 3);
  assert.match(app.run("activeProject.data.households[3].source_entry"), /age 41/);
});

test("merge and undo select the merged and restored records, not the first namesake", async () => {
  const app = await loadApp([sameNameProject()]);
  app.run('duplicateReview = { editedId: "giacomo-covello-2", candidateId: "giacomo-covello", mergeId: null }');
  await app.run("mergeDuplicateRecords()");
  assert.equal(app.run("activeProject.data.households.length"), 3);
  assert.equal(selectedRecordIndex(app), 1);

  await app.run("undoDuplicateMerge()");
  assert.equal(app.run("activeProject.data.households.length"), 4);
  assert.equal(selectedRecordIndex(app), 3);
});

test("a failed save leaves the in-memory project unchanged for edits, merges, and decisions", async () => {
  const app = await loadApp([sameNameProject()]);
  const before = app.run("JSON.stringify(activeProject)");
  app.storage.failSaves = true;

  selectRecord(app, 3);
  app.document.querySelector("#sourceEditText").value = "Giacomo Covello, day laborer, age 41";
  await app.run("saveSourceEntry()");
  assert.equal(app.document.querySelector("#sourceEditStatus").textContent, "Simulated storage failure.");

  app.run('duplicateReview = { editedId: "giacomo-covello-2", candidateId: "giacomo-covello", mergeId: null }');
  await assert.rejects(app.run("mergeDuplicateRecords()"), /Simulated storage failure/);
  await assert.rejects(app.run("keepDuplicateSeparate()"), /Simulated storage failure/);

  assert.equal(app.run("JSON.stringify(activeProject)"), before);
});

test("the source editor takes the head name from a member line without a comma", async () => {
  const app = await loadApp([sameNameProject()]);
  selectRecord(app, 2);
  app.document.querySelector("#sourceEditText").value = "Maria Russo — age 40\nShe lives in her own house in the Pasolani district.";
  await app.run("saveSourceEntry()");
  assert.equal(app.run("activeProject.data.households[2].household_head"), "Maria Russo");
});

test("records with missing or mistyped fields render instead of stopping the app", async () => {
  const project = {
    ...sameNameProject(),
    data: { households: [{}, { household_head: "Paolo Rossi", members_text: 5 }, null, { household_head: "Pietro Spizzirri", residence: { adjacent_to: "x" }, residence_links: [null] }] }
  };
  const app = await loadApp([project]);
  assert.equal(app.run("activeProject?.id"), "project-a");
  assert.equal(app.run("households.filter(unit => unit.source === 'extracted').length"), 4);
  app.run('view.layer = "land"; useData(activeData)');
  assert.equal(app.run("households.length"), 0);
});

test("a project that cannot be displayed is reported and no longer reopens at startup", async () => {
  const broken = { ...sameNameProject(), id: "broken" };
  const app = await loadApp([sameNameProject(), broken], { rememberedId: "broken" });
  app.storage.rawProject = {
    ...broken,
    data: { households: [{ get household_head() { throw new Error("corrupt record"); } }] }
  };
  await app.run('activateProject("broken")');

  assert.equal(app.preferences.has("catasto-active-project"), false);
  assert.equal(app.run("activeProject"), null);
  assert.match(app.document.querySelector("#sourceEntry").textContent, /could not be displayed \(corrupt record\)/);
});

test("member source lines erased by the earlier recalculation defect are restored at startup", async () => {
  const project = sameNameProject();
  project.data.households.forEach(item => { item.member_identities[0].source_line = undefined; });
  const app = await loadApp([project]);
  const stored = app.storage.projects.get("project-a");
  assert.deepEqual(stored.data.households.map(item => item.member_identities[0].source_line), [
    "Angelo Chiappetta, day laborer, age 40",
    "Giacomo Covello, day laborer, age 40",
    "Maria Rossi, day laborer, age 40",
    "Giacomo Covello, day laborer, age 40"
  ]);
});

test("identity recalculation keeps each member's source line", async () => {
  const app = await loadApp([sameNameProject()]);
  const lines = app.run(`(() => {
    const data = structuredClone(activeProject.data);
    data.households[1].members_text = "Giacomo Covello, day laborer, age 40\\nAnna, wife, age 35";
    recalculateStoredIdentityGraph(data);
    return data.households[1].member_identities.map(member => member.source_line);
  })()`);
  assert.deepEqual([...lines], ["Giacomo Covello, day laborer, age 40", "Anna, wife, age 35"]);
});

test("the app starts when localStorage is blocked", async () => {
  const app = await loadApp([sameNameProject()], { blockedLocalStorage: true });
  assert.equal(app.run("activeProject?.id"), "project-a");
});

function secondProject() {
  return { ...sameNameProject(), id: "project-b", name: "Imported project", data: { households: [record("pietro-spizzirri", "Pietro Spizzirri")] } };
}

const projectOptions = app => app.document.querySelector("#projectSelect").options.map(option => option.value);

test("a project imported in Admin opens in an already open visualizer", async () => {
  const app = await loadApp([sameNameProject()]);
  app.storage.projects.set("project-b", secondProject());
  await app.broadcast({ type: "projects-changed", reason: "imported", projectId: "project-b" });

  assert.equal(app.run("activeProject.id"), "project-b");
  assert.deepEqual(projectOptions(app).sort(), ["project-a", "project-b"]);
  assert.equal(app.run("households.find(unit => unit.id === view.selectedId).head"), "Pietro Spizzirri");
});

test("an import does not replace a project while an edit is open; the list still updates", async () => {
  const app = await loadApp([sameNameProject()]);
  selectRecord(app, 3);
  app.run("openSourceEditor()");
  app.storage.projects.set("project-b", secondProject());
  await app.broadcast({ type: "projects-changed", reason: "imported", projectId: "project-b" });

  assert.equal(app.run("activeProject.id"), "project-a");
  assert.equal(selectedRecordIndex(app), 3);
  assert.deepEqual(projectOptions(app).sort(), ["project-a", "project-b"]);
});

test("deleting another project updates the list without resetting the current view", async () => {
  const app = await loadApp([sameNameProject(), secondProject()], { rememberedId: "project-a" });
  selectRecord(app, 3);
  app.storage.projects.delete("project-b");
  await app.broadcast({ type: "projects-changed", reason: "deleted", projectId: "project-b" });

  assert.equal(app.run("activeProject.id"), "project-a");
  assert.equal(selectedRecordIndex(app), 3);
  assert.deepEqual(projectOptions(app), ["project-a"]);
});

test("deleting the open project switches to a remaining project", async () => {
  const app = await loadApp([sameNameProject(), secondProject()], { rememberedId: "project-a" });
  app.storage.projects.delete("project-a");
  await app.broadcast({ type: "projects-changed", reason: "deleted", projectId: "project-a" });

  assert.equal(app.run("activeProject.id"), "project-b");
  assert.deepEqual(projectOptions(app), ["project-b"]);
});

test("a new installation opens with an empty library and no built-in project", async () => {
  const app = await loadApp([]);
  assert.equal(app.run("activeProject"), null);
  assert.equal(app.storage.projects.size, 0);
  assert.deepEqual(projectOptions(app), [""]);
  assert.match(app.document.querySelector("#sourceEntry").textContent, /ADMIN/);
});

test("deleting the last project leaves an empty library", async () => {
  const app = await loadApp([sameNameProject()]);
  app.storage.projects.delete("project-a");
  await app.broadcast({ type: "projects-changed", reason: "deleted", projectId: "project-a" });
  assert.equal(app.run("activeProject"), null);
  assert.equal(app.storage.projects.size, 0);
});

test("an Italian project shows the source's Italian terms for households and landholdings", async () => {
  const app = await loadApp([]);
  const text = `Andrea Morrone bracciale ————— anni 46
Lucrezia Aijello moglie — anni 40
Michele figlio — anni 2
Abita in casa propria sita nelli Pasolani giusta li beni di Agostino Serpe e via publica —
Possiede un castagneto di San Nicola in capacità moggio uno, confina Daniele Santanna e via publica; stimata la rendita per molti ducati cinque, sono — oncie — 16.20`;
  app.run(`globalThis.italianData = parsePlainText(${JSON.stringify(text)}, "it")`);
  const [household] = app.run("buildHouseholds(italianData)").filter(unit => unit.source === "extracted");
  assert.equal(household.role, "bracciale, anni 46");
  assert.deepEqual([...household.members], ["Andrea Morrone, head (46)", "Lucrezia Aijello, moglie (40)", "Michele Morrone, figlio (2)"]);
  assert.equal(household.place, "Pasolani");
  assert.equal(household.hasPublicRoad, true);

  const [parcel] = app.run("buildLandholdings(italianData)").filter(unit => unit.source === "extracted");
  assert.equal(parcel.role, "castagneto");
  assert.equal(parcel.parcelName, "San Nicola");
  assert.equal(parcel.capacity, "moggio uno");
  assert.equal(parcel.income, "stimata la rendita per molti ducati cinque, sono — oncie — 16.20");
  assert.deepEqual([...parcel.adjacentNames], ["Daniele Santanna"]);
  assert.ok(parcel.assets.some(asset => asset.type === "trees"));
});

test("a project with name-based ids is given permanent ids once at startup, keeping its links", async () => {
  const project = sameNameProject();
  delete project.data.record_id_version;
  project.data.households[0].residence_links = [{ name: "Maria Rossi", kind: "person", household_id: "maria-rossi", candidate_household_ids: ["maria-rossi"] }];
  project.data.duplicate_decisions = [{ key: "giacomo-covello|giacomo-covello-2", status: "separate" }];
  const app = await loadApp([project]);
  const stored = app.storage.projects.get("project-a");
  const [angelo, giacomo, maria, giacomo2] = stored.data.households;
  assert.equal(stored.data.record_id_version, 2);
  assert.match(maria.id, /^h-/);
  assert.equal(angelo.residence_links[0].household_id, maria.id);
  assert.equal(stored.data.duplicate_decisions[0].key, [giacomo.id, giacomo2.id].sort().join("|"));
  assert.equal(app.storage.saves, 1);
});

test("an older project is offered a reparse, which keeps a snapshot and the user's edits", async () => {
  const project = sameNameProject();
  project.sourceText = [
    "Angelo Chiappetta, day laborer, age 40",
    "He lives in his own house in the Pajoli neighborhood.",
    "",
    "Maria Rossi, day laborer, age 40",
    "She lives in her own house in the Malvitani neighborhood."
  ].join("\n");
  project.data.households[2].source_edited_at = "2026-10-01T00:00:00.000Z";
  project.data.households[2].residence.place = "Corrected by hand";
  const app = await loadApp([project]);
  assert.equal(app.document.querySelector("#reparseNotice").hidden, false);

  app.run("openReparseReview()");
  assert.match(app.document.querySelector("#reparseSummary").innerHTML, /Records with your edits or merges, kept unchanged: 1/);
  assert.match(app.document.querySelector("#reparseSummary").innerHTML, /Saved residences kept where the new parse reads them differently: 1/);
  await app.run("applyReparse()");
  const stored = app.storage.projects.get("project-a");
  assert.equal(app.storage.snapshots.get("project-a").data.households.length, 4);
  assert.equal(stored.migrationSnapshot, undefined, "the snapshot is kept outside the project");
  const maria = stored.data.households.find(item => item.household_head === "Maria Rossi");
  assert.equal(maria.residence.place, "Corrected by hand");
  assert.equal(maria.id, "maria-rossi");
  // The stored place is kept where the new parse reads it differently, since it may be a hand correction.
  assert.equal(stored.data.households.find(item => item.household_head === "Angelo Chiappetta").residence.place, "Pasolani");
  assert.equal(app.document.querySelector("#reparseNotice").hidden, true);
});

test("a conversion that would drop links waits for review and keeps the old data as the snapshot", async () => {
  const project = sameNameProject();
  delete project.data.record_id_version;
  project.data.households[0].residence_links = [{ name: "Giacomo Covello", kind: "person", household_id: "nobody", candidate_household_ids: [] }];
  const app = await loadApp([project]);
  assert.equal(app.storage.saves, 0, "nothing is saved before review");
  assert.equal(app.document.querySelector("#reparseNotice").hidden, false);
  app.run("openReparseReview()");
  assert.match(app.document.querySelector("#reparseChanges").innerHTML, /“nobody” matched no single household/);
  await app.run("applyReparse()");
  const stored = app.storage.projects.get("project-a");
  assert.equal(stored.data.record_id_version, 2);
  assert.equal(app.storage.snapshots.get("project-a").data.households[0].id, "angelo-chiappetta");
});

test("saving one household's source entry leaves other households' neighbors as they were", async () => {
  const project = sameNameProject();
  project.data.households[0].residence.adjacent_to = ["Curated Neighbor"];
  const app = await loadApp([project]);
  selectRecord(app, 2);
  app.document.querySelector("#sourceEditText").value = "Maria Rossi, day laborer, age 41\nShe lives in her own house in the Pasolani district.";
  await app.run("saveSourceEntry()");
  assert.deepEqual([...app.storage.projects.get("project-a").data.households[0].residence.adjacent_to], ["Curated Neighbor"]);
});

test("a project still being recovered is listed but not opened", async () => {
  const healthy = sameNameProject();
  const app = await loadApp([healthy]);
  app.storage.listProjects = async () => [
    { id: "stuck", name: "Stuck", unavailable: "This project is still being recovered from an interrupted update." },
    { id: healthy.id, name: healthy.name }
  ];
  await app.run("refreshProjects()");
  assert.equal(app.run("activeProject.id"), healthy.id);
  const options = app.document.querySelector("#projectSelect").options;
  const stuck = options.find(option => option.value === "stuck");
  assert.equal(stuck.disabled, true);
  assert.match(stuck.text, /being recovered/);
});

test("the Adjacent Evidence report follows the person chosen, and the 3D view returns it to the head", async () => {
  const project = sameNameProject();
  project.data.households[1].members_text = "Giacomo Covello, day laborer, age 40\nMaria, daughter, age 12";
  project.data.households[1].source_entry = `${project.data.households[1].members_text}\nHe lives in his own house in the Pasolani district.`;
  const app = await loadApp([project]);
  const label = () => app.document.querySelector("#evidenceReportLabel").textContent;
  const unitId = app.run("households.find(unit => unit.recordIndex === 1).id");
  const householdId = app.run(`householdById.get(${JSON.stringify(unitId)}).householdId`);

  app.run(`selectHousehold(${JSON.stringify(unitId)}, "", { householdId: ${JSON.stringify(householdId)}, position: 1 })`);
  assert.equal(label(), "Adjacent evidence: Maria Covello");

  app.run("language = 'it'; applyLanguage()");
  assert.equal(label(), "Prove adiacenti: Maria Covello", "a language change keeps the person");

  app.run(`window.catasto.select(${JSON.stringify(unitId)})`);
  assert.equal(label(), "Prove adiacenti: Giacomo Covello");
});

test("following a name in the report shows that person, and Back returns to the previous one", async () => {
  const project = sameNameProject();
  project.data.households[1].members_text = "Giacomo Covello, day laborer, age 40\nMaria, daughter, age 12";
  project.data.households[1].source_entry = `${project.data.households[1].members_text}\nHe lives in his own house in the Pasolani district.`;
  const app = await loadApp([project]);
  const label = () => app.document.querySelector("#evidenceReportLabel").textContent;
  const unitId = app.run("households.find(unit => unit.recordIndex === 1).id");
  const householdId = app.run(`householdById.get(${JSON.stringify(unitId)}).householdId`);
  app.run(`window.catasto.select(${JSON.stringify(unitId)})`);
  assert.equal(app.document.querySelector("#evidenceBack").hidden, true);

  app.run(`followReportLink({ householdId: ${JSON.stringify(householdId)}, position: 1 })`);
  assert.equal(label(), "Adjacent evidence: Maria Covello");
  assert.equal(app.document.querySelector("#evidenceBack").hidden, false);
  assert.equal(app.run("view.reportHistory.length"), 1);

  app.run("goBackInReport()");
  assert.equal(label(), "Adjacent evidence: Giacomo Covello");
  assert.equal(app.document.querySelector("#evidenceBack").hidden, true);

  app.run(`followReportLink({ name: "Donato Ponzo" })`);
  assert.equal(label(), "Adjacent evidence: Donato Ponzo");
  app.run(`window.catasto.select(${JSON.stringify(unitId)})`);
  assert.equal(app.run("view.reportHistory.length"), 0, "a selection outside the report starts a new trail");
});

test("names in the source entry are matched in place, each member only in their own line", async () => {
  const app = await loadApp([sameNameProject()]);
  const ranges = app.run(`JSON.stringify(sourceLinkRanges(
    "Giacomo Covello, age 40\\nMaria, daughter\\nMaria, sister\\nBorders Pietro  Bruno and pietro bruno; Pietrobruno",
    [
      { label: "Giacomo Covello", line: "Giacomo Covello, age 40", target: { householdId: "h-1", position: 0 } },
      { label: "Maria", line: "Maria, sister", target: { householdId: "h-1", position: 2 } },
      { label: "Pietro Bruno", target: { name: "Pietro Bruno" } }
    ],
    { householdId: "h-1", position: 0 }
  ).map(range => [range.start, range.end, range.target.position ?? range.target.name]))`);
  assert.deepEqual(JSON.parse(ranges), [[40, 45, 2], [62, 75, "Pietro Bruno"], [80, 92, "Pietro Bruno"]], "the current person is left unlinked");
});
