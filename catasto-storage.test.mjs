import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./catasto-storage.js", import.meta.url), "utf8");
const context = {
  window: {},
  crypto: { randomUUID: () => "restored-project-id" }
};
vm.runInNewContext(source, context);
const { createProject, projectsFromImport, serializeProject } = context.window.CatastoStorage;

test("an exported JSON backup restores source text and corrected household data", () => {
  const data = {
    households: [{ id: "giuseppe-covello", household_head: "Giuseppe Covello", residence: { place: "San Nicola" } }]
  };
  const original = createProject({
    name: "Marano Marchesato · 1754",
    sourceFile: "transcription.md",
    sourceText: "Giuseppe Covello, age 40",
    data
  });
  const [restored] = projectsFromImport(JSON.parse(serializeProject(original)), "backup");

  assert.equal(restored.name, original.name);
  assert.equal(restored.sourceFile, original.sourceFile);
  assert.equal(restored.sourceText, original.sourceText);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.data)), data);
});

// A minimal in-memory IndexedDB: requests run in order, writes commit only if the transaction
// completes, and a failed add or an explicit abort discards the transaction's writes.
function fakeIndexedDB() {
  const records = new Map();
  const later = callback => setTimeout(callback, 0);
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore() {},
    close() {},
    transaction() {
      const transaction = new EventTarget();
      const working = new Map(records);
      const queue = [];
      let finished = false;
      const finish = (type, error = null) => {
        if (finished) return;
        finished = true;
        transaction.error = error;
        if (type === "complete") {
          records.clear();
          working.forEach((value, key) => records.set(key, value));
        }
        if (type === "error") {
          transaction.dispatchEvent(new Event("error"));
          transaction.dispatchEvent(new Event("abort"));
        } else {
          transaction.dispatchEvent(new Event(type));
        }
      };
      const request = operation => {
        const pending = new EventTarget();
        pending.transaction = transaction;
        if (!queue.length) later(process);
        queue.push({ pending, operation });
        return pending;
      };
      function process() {
        while (queue.length && !finished) {
          const { pending, operation } = queue.shift();
          try {
            pending.result = operation();
          } catch (error) {
            finish("error", error);
            return;
          }
          pending.dispatchEvent(new Event("success"));
        }
        if (!finished) later(() => { if (!queue.length) finish("complete"); else process(); });
      }
      transaction.abort = () => later(() => finish("abort"));
      transaction.objectStore = () => ({
        get: id => request(() => structuredClone(working.get(id))),
        getAll: () => request(() => [...working.values()].map(value => structuredClone(value))),
        put: value => request(() => { working.set(value.id, structuredClone(value)); }),
        add: value => request(() => {
          if (working.has(value.id)) throw new Error("ConstraintError: key already exists");
          working.set(value.id, structuredClone(value));
        }),
        delete: id => request(() => { working.delete(id); })
      });
      return transaction;
    }
  };
  return {
    records,
    open() {
      const opening = new EventTarget();
      later(() => {
        opening.result = database;
        opening.dispatchEvent(new Event("upgradeneeded"));
        opening.dispatchEvent(new Event("success"));
      });
      return opening;
    }
  };
}

function storageWithDatabase() {
  const indexedDB = fakeIndexedDB();
  let nextId = 0;
  const storageContext = {
    window: {},
    indexedDB,
    structuredClone,
    crypto: { randomUUID: () => `project-${++nextId}` }
  };
  vm.runInNewContext(source, storageContext);
  return { storage: storageContext.window.CatastoStorage, records: indexedDB.records };
}

const sampleData = () => ({ households: [{ id: "paolo-rossi", household_head: "Paolo Rossi" }] });

test("a new project requires an explicit create and then saves normally", async () => {
  const { storage, records } = storageWithDatabase();
  const project = storage.createProject({ name: "Marano", data: sampleData() });
  await assert.rejects(storage.saveProject(project), /deleted in another tab/);
  assert.equal(records.size, 0);

  await storage.saveProject(project, { create: true });
  project.name = "Marano 1754";
  await storage.saveProject(project);
  assert.equal(records.get(project.id).name, "Marano 1754");
});

test("a stale copy from another tab cannot overwrite a newer save", async () => {
  const { storage, records } = storageWithDatabase();
  const project = storage.createProject({ name: "Marano", data: sampleData() });
  await storage.saveProject(project, { create: true });
  const firstTab = await storage.getProject(project.id);
  const secondTab = await storage.getProject(project.id);

  firstTab.name = "Saved first";
  await new Promise(resolve => setTimeout(resolve, 2));
  await storage.saveProject(firstTab);
  const staleUpdatedAt = secondTab.updatedAt;
  secondTab.name = "Saved second";
  await assert.rejects(storage.saveProject(secondTab), /changed in another tab/);

  assert.equal(records.get(project.id).name, "Saved first");
  assert.equal(secondTab.updatedAt, staleUpdatedAt);
});

test("a project deleted in another tab is not recreated by a later save", async () => {
  const { storage, records } = storageWithDatabase();
  const project = storage.createProject({ name: "Marano", data: sampleData() });
  await storage.saveProject(project, { create: true });
  await storage.deleteProject(project.id);
  await assert.rejects(storage.saveProject(project), /deleted in another tab/);
  assert.equal(records.size, 0);
});

test("an import that fails part-way stores none of its projects", async () => {
  const { storage, records } = storageWithDatabase();
  const existing = storage.createProject({ name: "Existing", data: sampleData() });
  await storage.saveProject(existing, { create: true });
  const fresh = storage.createProject({ name: "Fresh", data: sampleData() });
  const collision = { ...storage.createProject({ name: "Collision", data: sampleData() }), id: existing.id };

  await assert.rejects(storage.saveImportedProjects([fresh, collision]), /ConstraintError/);
  assert.deepEqual([...records.keys()], [existing.id]);
});
