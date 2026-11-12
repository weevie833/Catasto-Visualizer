import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Runs admin.js against a minimal DOM to check that every library change is announced to
// open Visualizer tabs.
const [adminSource, storageSource, parserSource, recordsSource, relationsSource, nameIndexSource, xlsxSource, xlsxIndexSource] = await Promise.all(
  ["./admin.js", "./catasto-storage.js", "./catasto-parser.js", "./catasto-records.js", "./catasto-relations.js", "./catasto-name-index.js", "./catasto-xlsx.js", "./catasto-xlsx-index.js"].map(path => readFile(new URL(path, import.meta.url), "utf8"))
);
const sampleText = "Paolo Rossi, day laborer, age 40\nHe lives in his own house in the Pasolani district.";

async function loadAdmin({ preferences = new Map() } = {}) {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      const listeners = {};
      elements.set(selector, {
        value: "", textContent: "", innerHTML: "", hidden: true, listeners,
        addEventListener: (type, listener) => { listeners[type] = listener; },
        focus() { this.focused = true; },
        showModal() { this.open = true; }
      });
    }
    return elements.get(selector);
  };
  const messages = [];
  const confirmations = [];
  const downloads = [];
  const blobsMade = [];
  const stored = new Map([["existing", { id: "existing", name: "Existing", data: { households: [] } }]]);
  let nextId = 0;
  const context = {
    window: { confirm: message => { confirmations.push(message); return true; } },
    document: { querySelector: element, createElement: () => ({ click() { downloads.push({ name: this.download, blob: this.blobs.at(-1) }); }, blobs: blobsMade }) },
    Blob: class { constructor(parts, options) { this.parts = parts; this.text = parts.join(""); this.type = options.type; blobsMade.push(this); } },
    TextEncoder,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    localStorage: {
      getItem: key => preferences.get(key) ?? null,
      setItem: (key, value) => preferences.set(key, String(value)),
      removeItem: key => preferences.delete(key)
    },
    crypto: { randomUUID: () => `project-${++nextId}` },
    BroadcastChannel: class {
      constructor(name) { this.name = name; }
      postMessage(message) { messages.push({ channel: this.name, ...message }); }
      close() {}
    },
    setTimeout,
    console
  };
  vm.createContext(context);
  vm.runInContext(storageSource, context);
  vm.runInContext(parserSource, context);
  vm.runInContext(recordsSource, context);
  vm.runInContext(relationsSource, context);
  vm.runInContext(nameIndexSource, context);
  vm.runInContext(xlsxSource, context);
  vm.runInContext(xlsxIndexSource, context);
  context.CatastoNameIndex = context.window.CatastoNameIndex;
  context.CatastoXlsxIndex = context.window.CatastoXlsxIndex;
  context.CatastoStorage = context.window.CatastoStorage;
  context.CatastoParser = context.window.CatastoParser;
  context.CatastoRecords = context.window.CatastoRecords;
  Object.assign(context.CatastoStorage, {
    listProjects: async () => [...stored.values()].map(project => ({
      id: project.id, name: project.name, sourceFile: project.sourceFile,
      householdCount: project.data.households.length, sourceLanguage: project.data.source_language, snapshotCreatedAt: null
    })),
    getProject: async id => stored.get(id),
    saveProject: async project => { stored.set(project.id, project); return project; },
    saveImportedProjects: async projects => { projects.forEach(project => stored.set(project.id, project)); return projects; },
    deleteProject: async project => { stored.delete(project.id); }
  });
  vm.runInContext(adminSource, context);
  const settle = () => new Promise(resolve => setTimeout(resolve, 10));
  await settle();
  return { element, messages, confirmations, downloads, stored, settle, preferences, storage: context.CatastoStorage };
}

test("importing a transcription announces the new project to open Visualizer tabs", async () => {
  const admin = await loadAdmin();
  await admin.element("#importFile").listeners.change({ target: { files: [{ name: "marano.md", text: async () => sampleText }] } });
  await admin.settle();

  const imported = [...admin.stored.keys()].find(id => id !== "existing");
  assert.deepEqual(admin.messages, [{ channel: "catasto-projects", type: "projects-changed", reason: "imported", projectId: imported }]);
  assert.equal(admin.element("#successNotice").hidden, false);
  assert.equal(admin.element("#successTitle").textContent, "Imported “marano”");
  assert.match(admin.element("#successDetail").textContent, /^1 household ready/);
  assert.equal(admin.element("#openVisualizer").focused, true);
});

test("creating and deleting projects are announced", async () => {
  const admin = await loadAdmin();
  admin.element("#plainText").value = sampleText;
  await admin.element("#createProject").listeners.click();
  const created = [...admin.stored.keys()].find(id => id !== "existing");

  const target = { closest: selector => selector === "[data-project-id]" ? { dataset: { projectId: "existing" } } : selector === ".delete" ? {} : null };
  await admin.element("#projectList").listeners.click({ target });

  assert.deepEqual(admin.messages.map(({ reason, projectId }) => ({ reason, projectId })), [
    { reason: "created", projectId: created },
    { reason: "deleted", projectId: "existing" }
  ]);
});

test("a failed import announces nothing", async () => {
  const admin = await loadAdmin();
  await admin.element("#importFile").listeners.change({ target: { files: [{ name: "notes.md", text: async () => "No household lines here." }] } });
  assert.deepEqual(admin.messages, []);
  assert.match(admin.element("#libraryStatus").textContent, /^Import failed/);
  assert.equal(admin.element("#successNotice").hidden, true);
});

test("creating a project offers to open it, and the notice can be dismissed", async () => {
  const admin = await loadAdmin();
  admin.element("#projectName").value = "Sample";
  admin.element("#plainText").value = sampleText;
  await admin.element("#createProject").listeners.click();
  assert.equal(admin.element("#successNotice").hidden, false);
  assert.equal(admin.element("#successTitle").textContent, "Created “Sample”");

  admin.element("#dismissNotice").listeners.click();
  assert.equal(admin.element("#successNotice").hidden, true);
});

test("a JSON backup import names the restored project", async () => {
  const admin = await loadAdmin();
  const payload = admin.storage.serializeProject(admin.storage.createProject({ name: "Restored", sourceFile: "restored.md", sourceText: sampleText, data: { households: [{ id: "a", household_head: "Paolo Rossi" }, { id: "b", household_head: "Anna Bruno" }] } }));
  await admin.element("#importFile").listeners.change({ target: { files: [{ name: "restored.catasto.json", text: async () => payload }] } });
  await admin.settle();
  assert.equal(admin.element("#successNotice").hidden, false, admin.element("#libraryStatus").textContent);
  assert.equal(admin.element("#successTitle").textContent, "Imported “Restored”");
  assert.match(admin.element("#successDetail").textContent, /^2 households ready/);
});

const italianText = "Andrea Morrone bracciale — anni 46\nLucrezia Aijello moglie — anni 40\nAbita in casa propria sita in San Nicola, giusta li beni di Agostino Serpe e via publica.";

test("ENG is selected until IT is saved as the default", async () => {
  const fresh = await loadAdmin();
  assert.equal(fresh.element("#sourceLanguage").value, "en");
  assert.equal(fresh.element("#saveLanguageDefault").checked, false);

  fresh.element("#sourceLanguage").value = "it";
  fresh.element("#sourceLanguage").listeners.change();
  fresh.element("#saveLanguageDefault").checked = true;
  fresh.element("#saveLanguageDefault").listeners.change();
  assert.equal(fresh.preferences.get("catasto-source-language"), "it");

  const reopened = await loadAdmin({ preferences: fresh.preferences });
  assert.equal(reopened.element("#sourceLanguage").value, "it");
  assert.equal(reopened.element("#saveLanguageDefault").checked, true);
  reopened.element("#saveLanguageDefault").checked = false;
  reopened.element("#saveLanguageDefault").listeners.change();
  assert.equal(reopened.preferences.has("catasto-source-language"), false);
});

test("an Italian transcription is created with IT and refused with ENG", async () => {
  const admin = await loadAdmin();
  admin.element("#plainText").value = italianText;
  await admin.element("#createProject").listeners.click();
  assert.match(admin.element("#createStatus").textContent, /looks Italian, but ENG is selected\. Choose IT/);
  assert.equal(admin.stored.size, 1);

  admin.element("#sourceLanguage").value = "it";
  await admin.element("#createProject").listeners.click();
  const created = [...admin.stored.values()].find(project => project.id !== "existing");
  assert.equal(created.data.source_language, "it");
  assert.equal(created.data.households[0].household_head, "Andrea Morrone");
});

const click = (admin, projectId, button) => admin.element("#projectList").listeners.click({
  target: { closest: selector => selector === "[data-project-id]" ? { dataset: { projectId } } : selector === button ? {} : null }
});

test("a previous version that predates the record rules is repaired, shown, and then restored", async () => {
  const admin = await loadAdmin();
  const restored = [];
  admin.storage.getSnapshot = async () => ({
    createdAt: "2026-01-01T00:00:00.000Z", reason: "Before converting to permanent household ids",
    data: { households: [{ id: "same", household_head: "A" }, { id: "same", household_head: "B" }] }
  });
  admin.storage.restoreSnapshot = async (project, data) => { restored.push({ project, data }); return project; };
  await click(admin, "existing", ".restore");
  assert.match(admin.confirmations[0], /was repaired/);
  assert.match(admin.confirmations[0], /shared the id “same”/);
  assert.equal(restored.length, 1);
  assert.equal(new Set(restored[0].data.households.map(record => record.id)).size, 2);
  assert.equal(admin.messages.at(-1).reason, "restored");
});

test("an export carries the previous version, and importing it brings the version back", async () => {
  const admin = await loadAdmin();
  const previous = { createdAt: "2026-01-01T00:00:00.000Z", reason: "Before reparsing", data: { households: [{ id: "old", household_head: "Old" }] } };
  const project = admin.storage.createProject({ name: "With history", data: { households: [{ id: "a", household_head: "A" }] } });
  const payload = JSON.parse(admin.storage.serializeProject(project, previous));
  assert.deepEqual(payload.project.previousVersion, previous);
  const [imported] = admin.storage.projectsFromImport(payload, "x");
  assert.deepEqual(JSON.parse(JSON.stringify(imported.previousVersion)), previous);
});

test("a delete refused because another tab saved is reported and nothing is removed", async () => {
  const admin = await loadAdmin();
  admin.storage.deleteProject = async () => { throw new Error("This project was changed in another tab or window after you opened it."); };
  await click(admin, "existing", ".delete");
  assert.equal(admin.stored.has("existing"), true);
  assert.match(admin.element("#libraryStatus").textContent, /changed in another tab/);
  assert.equal(admin.messages.some(message => message.reason === "deleted"), false);
});

test("Name Index opens with the suggested village and exports JSON, CSV, Markdown, and XLSX without saving", async () => {
  const admin = await loadAdmin();
  const data = admin.storage.createProject({ name: "Marano", data: { source_title: "Marano Marchesato 1754", households: [] } }).data;
  data.households = [{ id: "h-1", household_head: "Paolo Rossi", members_text: "Paolo Rossi, day laborer, age 40\nPietro, son, age 3", source_entry: `${sampleText.replace("age 40", "age 40\nPietro, son, age 3")} He pays to Giuseppe Loizzo of the Land of Rende, for a principal of ten ducats.` }];
  admin.stored.set("marano", { id: "marano", name: "Marano 1754", data });
  const before = JSON.stringify(data);

  await click(admin, "marano", ".name-index");
  assert.equal(admin.element("#nameIndexDialog").open, true);
  assert.equal(admin.element("#nameIndexVillage").value, "Marano Marchesato");
  assert.equal(admin.element("#nameIndexProject").textContent, "Marano 1754");

  admin.element("#nameIndexJson").listeners.click();
  admin.element("#nameIndexCsv").listeners.click();
  admin.element("#nameIndexMarkdown").listeners.click();
  assert.deepEqual(admin.downloads.map(download => download.name), ["marano-1754-name-index.json", "marano-1754-name-index.csv", "marano-1754-name-index.md"]);
  const people = JSON.parse(admin.downloads[0].blob.text).people.map(person => `${person.given_name} ${person.surname} (${person.residential_location})`);
  assert.deepEqual(people, ["Paolo Rossi (Marano Marchesato)", "Pietro Rossi (Marano Marchesato)", "Giuseppe Loizzo (Rende)"]);
  assert.equal(admin.downloads[1].blob.type, "text/csv");
  assert.match(admin.downloads[1].blob.text, /^\ufeff"Honorific",/);
  assert.equal(admin.downloads[2].blob.type, "text/markdown");
  assert.match(admin.element("#nameIndexStatus").textContent, /^Exported 3 people\.$/);
  admin.element("#nameIndexXlsx").listeners.click();
  assert.equal(admin.downloads[3].name, "marano-1754-index.xlsx");
  assert.equal(admin.downloads[3].blob.type, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  assert.deepEqual(Array.from(admin.downloads[3].blob.parts[0].slice(0, 2)), [0x50, 0x4B]);
  assert.match(admin.element("#nameIndexStatus").textContent, /^Exported 3 rows/);
  assert.equal(JSON.stringify(data), before);
  assert.deepEqual(admin.messages, []);
});

test("a project with households merged by an earlier version gets no index, and says why", async () => {
  const admin = await loadAdmin();
  const first = "Bruno Ventrella, day laborer, age 44\nLucia Serra, wife, age 40\nHe lives in his own house in Borgo Alto.";
  const second = "Bruno Ventrella, day laborer, age 44\nCarlo, son, age 12\nHe lives in his own house in Borgo Alto.";
  const data = { source_title: "Casale Esempio 1760", households: [{
    id: "h-1", household_head: "Bruno Ventrella", aliases: [], source_entry: `${first}\n\n${second}`,
    members_text: "Bruno Ventrella, day laborer, age 44\nLucia Serra, wife, age 40\nCarlo Ventrella, son, age 12",
    source_entries: [{ text: first, pages: [1] }, { text: second, pages: [2] }]
  }] };
  admin.stored.set("legacy", { id: "legacy", name: "Legacy", data });
  await click(admin, "legacy", ".name-index");
  assert.match(admin.element("#nameIndexStatus").textContent, /1 merged household from an earlier version \(Bruno Ventrella\)/);
  for (const id of ["#nameIndexJson", "#nameIndexCsv", "#nameIndexMarkdown", "#nameIndexXlsx"]) {
    assert.equal(admin.element(id).disabled, true, id);
    admin.element(id).listeners.click();
  }
  assert.equal(admin.downloads.length, 0);
  assert.match(admin.element("#nameIndexStatus").textContent, /Correct the transcript/);
  // A project without merged households is offered the exports again.
  await click(admin, "existing", ".name-index");
  assert.equal(admin.element("#nameIndexXlsx").disabled, false);
});

test("a project that cannot be read for an action is reported, not ignored", async () => {
  const admin = await loadAdmin();
  admin.storage.getProject = async () => { throw new Error("The project folder could not be read."); };
  await click(admin, "existing", ".export");
  assert.match(admin.element("#libraryStatus").textContent, /could not be completed: The project folder could not be read/);
  assert.equal(admin.downloads.length, 0);
});
