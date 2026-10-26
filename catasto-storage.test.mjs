import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./catasto-storage.js", import.meta.url), "utf8");
const recordsSource = await readFile(new URL("./catasto-records.js", import.meta.url), "utf8");
const context = {
  window: {},
  crypto: { randomUUID: () => "restored-project-id" }
};
vm.createContext(context);
vm.runInContext(recordsSource, context);
vm.runInContext(source, context);
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
  assert.deepEqual(JSON.parse(JSON.stringify(restored.data)), JSON.parse(JSON.stringify(original.data)));
  assert.equal(restored.data.households[0].residence.place, "San Nicola");
  assert.equal(restored.data.households[0].legacy_id, "giuseppe-covello");
});

test("a version-1 backup is converted to permanent ids with its links and decisions", () => {
  const payload = {
    format: "catasto-visualizer-project",
    version: 1,
    project: {
      name: "Old backup",
      data: {
        households: [
          { id: "paolo-rossi", household_head: "Paolo Rossi", residence_links: [{ name: "Anna Bruno", household_id: "anna-bruno", candidate_household_ids: ["anna-bruno"] }] },
          { id: "anna-bruno", household_head: "Anna Bruno", residence_links: [{ name: "Gone", household_id: "nobody" }] }
        ],
        duplicate_decisions: [{ key: "anna-bruno|paolo-rossi", status: "separate" }]
      }
    }
  };
  let counter = 0;
  const converted = vm.runInContext(`(() => {
    crypto.randomUUID = () => "id-" + (++globalThis.counter);
    return window.CatastoStorage.projectsFromImport(${JSON.stringify(payload)}, "backup")[0];
  })()`, Object.assign(context, { counter }));
  const [paolo, anna] = converted.data.households;
  assert.match(paolo.id, /^h-id-/);
  assert.equal(paolo.residence_links[0].household_id, anna.id);
  assert.equal(converted.data.duplicate_decisions[0].key, [paolo.id, anna.id].sort().join("|"));
  assert.equal(anna.residence_links[0].household_id, null);
  assert.equal(converted.importChanges.length, 1);
  assert.match(converted.importChanges[0], /“nobody” matched no single household/);
});

test("a backup from a newer app version is refused", () => {
  assert.throws(() => projectsFromImport({ format: "catasto-visualizer-project", version: 99, project: { data: { households: [] } } }, "x"), /newer version/);
});

// Answers storage requests the way serve.py does and records each one. `respond` may return
// { status, body } for a request; anything it leaves alone gets { ok: true }.
function storageWithServer({ respond = () => undefined, browserProjects = null, flags = new Map() } = {}) {
  const requests = [];
  let nextId = 0;
  const fetch = async (url, options = {}) => {
    const call = { url, method: options.method, body: options.body === undefined ? undefined : JSON.parse(options.body) };
    requests.push(call);
    const answer = respond(call) || { status: 200, body: { ok: true } };
    if (answer.network) throw new TypeError("Failed to fetch");
    return {
      ok: answer.status < 400,
      status: answer.status,
      json: async () => {
        if (answer.html) throw new SyntaxError("Unexpected token <");
        return structuredClone(answer.body);
      }
    };
  };
  const storageContext = {
    window: {
      location: { protocol: "http:" },
      localStorage: { getItem: key => flags.get(key) ?? null, setItem: (key, value) => flags.set(key, value) }
    },
    fetch,
    console: { warn() {} },
    structuredClone,
    crypto: { randomUUID: () => `project-${++nextId}` }
  };
  if (browserProjects) storageContext.indexedDB = fakeBrowserDatabase(browserProjects);
  vm.createContext(storageContext);
  vm.runInContext(recordsSource, storageContext);
  vm.runInContext(source, storageContext);
  return { storage: storageContext.window.CatastoStorage, requests, flags };
}

// The IndexedDB database earlier versions saved projects in, reduced to what migration reads.
function fakeBrowserDatabase(projects) {
  const later = callback => setTimeout(callback, 0);
  const succeed = (target, result) => later(() => {
    target.result = result;
    target.dispatchEvent(new Event("success"));
  });
  const database = {
    objectStoreNames: { contains: name => name === "projects" },
    close() {},
    transaction: () => ({
      objectStore: () => ({
        getAll() {
          const reading = new EventTarget();
          succeed(reading, structuredClone(projects));
          return reading;
        }
      })
    })
  };
  return {
    databases: async () => [{ name: "catasto-visualizer" }],
    open() {
      const opening = new EventTarget();
      succeed(opening, database);
      return opening;
    }
  };
}

const sampleData = () => ({ households: [{ id: "paolo-rossi", household_head: "Paolo Rossi" }] });

test("a save sends the loaded version and keeps the server's new one", async () => {
  const { storage, requests } = storageWithServer({
    respond: call => call.method === "PUT" ? { status: 200, body: { ...call.body.project, updatedAt: "2026-10-26T10:00:00.000Z" } } : undefined
  });
  const project = storage.createProject({ name: "Marano", data: sampleData() });
  const loaded = project.updatedAt;
  await storage.saveProject(project, { create: true });

  assert.equal(requests[0].url, `api/projects/${project.id}`);
  assert.equal(requests[0].body.loadedUpdatedAt, loaded);
  assert.equal(requests[0].body.create, true);
  assert.equal(project.updatedAt, "2026-10-26T10:00:00.000Z");
});

test("a refused save keeps the server's reason and the loaded version", async () => {
  const { storage } = storageWithServer({
    respond: () => ({ status: 409, body: { error: "This project was changed in another tab or window." } })
  });
  const project = storage.createProject({ name: "Marano", data: sampleData() });
  const loaded = project.updatedAt;
  await assert.rejects(storage.saveProject(project), /changed in another tab/);
  assert.equal(project.updatedAt, loaded);
});

test("a missing project reads as absent rather than as an error", async () => {
  const { storage } = storageWithServer({
    respond: call => call.url.startsWith("api/projects/") ? { status: 404, body: { error: "Project not found." } } : undefined
  });
  assert.equal(await storage.getProject("gone"), undefined);
});

test("an import is sent as one request so the server stores all or none", async () => {
  const { storage, requests } = storageWithServer();
  const projects = [
    storage.createProject({ name: "One", data: sampleData() }),
    storage.createProject({ name: "Two", data: sampleData() })
  ];
  await storage.saveImportedProjects(projects);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "api/projects/import");
  assert.deepEqual(requests[0].body.projects.map(project => project.name), ["One", "Two"]);
});

test("the app explains how to start it when no project server answers", async () => {
  for (const answer of [{ network: true }, { status: 404, html: true }]) {
    const { storage } = storageWithServer({ respond: () => answer });
    await assert.rejects(storage.listProjects(), /Start the app with the “Start Catasto Visualizer” launcher/);
  }
});

test("projects from an earlier version's browser storage are copied once", async () => {
  const old = [{ id: "old-1", name: "Marano", data: sampleData() }];
  const flags = new Map();
  const first = storageWithServer({ browserProjects: old, flags, respond: call => call.method === "GET" ? { status: 200, body: [] } : undefined });
  await first.storage.listProjects();
  await first.storage.listProjects();
  assert.deepEqual(first.requests.map(call => `${call.method} ${call.url}`), ["POST api/migrate", "GET api/projects", "GET api/projects"]);
  const [sent] = first.requests[0].body.projects;
  assert.equal(sent.id, "old-1");
  assert.equal(sent.data.households[0].household_head, "Paolo Rossi");
  assert.deepEqual(sent.data.households[0].residence, { place: null, description: null, adjacent_to: [] }, "repaired before sending");

  const reopened = storageWithServer({ browserProjects: old, flags, respond: call => call.method === "GET" ? { status: 200, body: [] } : undefined });
  await reopened.storage.listProjects();
  assert.deepEqual(reopened.requests.map(call => call.url), ["api/projects"]);
});

test("a failed copy is retried on the next load instead of being marked done", async () => {
  const old = [{ id: "old-1", name: "Marano", data: sampleData() }];
  let fail = true;
  const { storage, requests, flags } = storageWithServer({
    browserProjects: old,
    respond: call => call.url === "api/migrate" && fail ? { network: true } : call.method === "GET" ? { status: 200, body: [] } : undefined
  });
  await assert.rejects(storage.listProjects(), /Project storage is not available/);
  assert.equal(flags.size, 0);
  fail = false;
  await storage.listProjects();
  assert.deepEqual(requests.map(call => call.url), ["api/migrate", "api/migrate", "api/projects"]);
  assert.equal(flags.size, 1);
});
