import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Runs the real inline application script from index.html against a minimal DOM and an in-memory
// project store, so the visualizer's data workflows can be tested without a browser.
const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const parserSource = await readFile(new URL("./catasto-parser.js", import.meta.url), "utf8");
const scriptStart = html.indexOf("<script>", html.indexOf('<script src="./catasto-storage.js"></script>')) + "<script>".length;
const appScript = html.slice(scriptStart, html.indexOf("</script>", scriptStart));

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
    async saveProject(project) {
      if (this.failSaves) throw new Error("Simulated storage failure.");
      this.saves += 1;
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
    BroadcastChannel,
    fetch: async () => { throw new Error("No network in tests."); },
    CatastoStorage: storage
  };
  vm.createContext(context);
  vm.runInContext(parserSource, context);
  context.CatastoParser = context.window.CatastoParser;
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
