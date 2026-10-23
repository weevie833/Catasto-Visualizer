import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// Runs admin.js against a minimal DOM to check that every library change is announced to
// open Visualizer tabs.
const [adminSource, storageSource, parserSource] = await Promise.all(
  ["./admin.js", "./catasto-storage.js", "./catasto-parser.js"].map(path => readFile(new URL(path, import.meta.url), "utf8"))
);
const sampleText = "Paolo Rossi, day laborer, age 40\nHe lives in his own house in the Pasolani district.";

async function loadAdmin() {
  const elements = new Map();
  const element = selector => {
    if (!elements.has(selector)) {
      const listeners = {};
      elements.set(selector, {
        value: "", textContent: "", innerHTML: "", hidden: true, listeners,
        addEventListener: (type, listener) => { listeners[type] = listener; },
        focus() { this.focused = true; }
      });
    }
    return elements.get(selector);
  };
  const messages = [];
  const stored = new Map([["existing", { id: "existing", name: "Existing", data: { households: [] } }]]);
  let nextId = 0;
  const context = {
    window: { confirm: () => true },
    document: { querySelector: element, createElement: () => ({ click() {} }) },
    localStorage: { setItem() {} },
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
  context.CatastoStorage = context.window.CatastoStorage;
  context.CatastoParser = context.window.CatastoParser;
  Object.assign(context.CatastoStorage, {
    listProjects: async () => [...stored.values()],
    getProject: async id => stored.get(id),
    saveProject: async project => { stored.set(project.id, project); return project; },
    saveImportedProjects: async projects => { projects.forEach(project => stored.set(project.id, project)); return projects; },
    deleteProject: async id => { stored.delete(id); }
  });
  vm.runInContext(adminSource, context);
  const settle = () => new Promise(resolve => setTimeout(resolve, 10));
  await settle();
  return { element, messages, stored, settle, storage: context.CatastoStorage };
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
  const payload = admin.storage.serializeProject(admin.storage.createProject({ name: "Restored", sourceFile: "restored.md", sourceText: sampleText, data: { households: [{ id: "a" }, { id: "b" }] } }));
  await admin.element("#importFile").listeners.change({ target: { files: [{ name: "restored.catasto.json", text: async () => payload }] } });
  await admin.settle();
  assert.equal(admin.element("#successNotice").hidden, false, admin.element("#libraryStatus").textContent);
  assert.equal(admin.element("#successTitle").textContent, "Imported “Restored”");
  assert.match(admin.element("#successDetail").textContent, /^2 households ready/);
});
