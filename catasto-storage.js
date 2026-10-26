(function () {
  "use strict";

  const DATABASE_NAME = "catasto-visualizer";
  const PROJECT_STORE = "projects";
  const EXCHANGE_FORMAT = "catasto-visualizer-project";
  // Version 2 exports carry permanent household ids; version 1 exports are converted when imported.
  const EXCHANGE_VERSION = 2;

  const STORAGE_UNAVAILABLE = "Project storage is not available. Start the app with the “Start Catasto Visualizer” launcher in the app folder, then reload this page.";
  // Set once this browser's old IndexedDB projects have been copied to the project folder.
  const MIGRATED_KEY = "catasto-browser-projects-migrated";

  // Projects are files in a per-user folder, saved by serve.py. Server refusals arrive as { error }.
  async function request(method, path, body) {
    if (window.location?.protocol === "file:") throw new Error(STORAGE_UNAVAILABLE);
    let response;
    try {
      response = await fetch(`api/${path}`, {
        method,
        headers: body === undefined ? {} : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new Error(STORAGE_UNAVAILABLE);
    }
    const payload = await response.json().catch(() => undefined);
    // Any other server answers without the JSON this API sends.
    if (payload === undefined) throw new Error(STORAGE_UNAVAILABLE);
    if (!response.ok) {
      const error = new Error(payload.error || STORAGE_UNAVAILABLE);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  // Reads the projects earlier versions kept in this browser. Never creates or changes that database.
  async function readBrowserProjects() {
    if (typeof indexedDB === "undefined") return [];
    if (typeof indexedDB.databases === "function") {
      const databases = await indexedDB.databases();
      if (!databases.some(database => database.name === DATABASE_NAME)) return [];
    }
    const database = await new Promise((resolve, reject) => {
      const opening = indexedDB.open(DATABASE_NAME);
      opening.addEventListener("success", () => resolve(opening.result));
      opening.addEventListener("error", () => reject(opening.error));
    });
    try {
      if (!database.objectStoreNames.contains(PROJECT_STORE)) return [];
      return await new Promise((resolve, reject) => {
        const reading = database.transaction(PROJECT_STORE, "readonly").objectStore(PROJECT_STORE).getAll();
        reading.addEventListener("success", () => resolve(reading.result));
        reading.addEventListener("error", () => reject(reading.error));
      });
    } finally {
      database.close();
    }
  }

  function storedFlag() {
    try {
      return window.localStorage?.getItem(MIGRATED_KEY);
    } catch {
      return null;
    }
  }

  // Copies this browser's old projects to the project folder once. The server skips projects it
  // already has or copied before, so a repeat (say, with localStorage blocked) restores nothing deleted.
  // The browser copy is left in place.
  async function migrateBrowserProjects() {
    if (storedFlag()) return;
    let projects;
    try {
      projects = await readBrowserProjects();
    } catch (error) {
      console.warn("Projects saved in this browser by an earlier version could not be read.", error);
      return;
    }
    // The server accepts only well-formed records, so old browser projects are repaired the same way an
    // import is before they are sent; one that cannot be read is left in the browser.
    const repaired = projects.flatMap(project => {
      try {
        window.CatastoRecords.repairProjectData(project.data);
        return [project];
      } catch (error) {
        console.warn(`“${project?.name}” could not be copied from this browser.`, error);
        return [];
      }
    });
    if (repaired.length) await request("POST", "migrate", { projects: repaired });
    try {
      window.localStorage?.setItem(MIGRATED_KEY, new Date().toISOString());
    } catch {
      // The server's record of copied projects still prevents duplicates.
    }
  }

  let migration = null;
  function ready() {
    migration ||= migrateBrowserProjects().catch(error => {
      migration = null;
      throw error;
    });
    return migration;
  }

  function newId() {
    return crypto.randomUUID ? crypto.randomUUID() : `catasto-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function validateData(data) {
    if (!data || typeof data !== "object" || !Array.isArray(data.households)) {
      throw new Error("This file does not contain valid Catasto household data.");
    }
    return data;
  }

  // Every new or imported project is repaired and given permanent household ids before it is saved.
  // What was changed is listed in the project's importChanges, which is not stored.
  function createProject({ name, sourceFile, sourceText, data }) {
    const now = new Date().toISOString();
    const projectData = validateData(data);
    const changes = window.CatastoRecords.repairProjectData(projectData);
    const conversion = window.CatastoRecords.convertToPermanentIds(projectData);
    const project = {
      id: newId(),
      name: String(name || "Untitled Catasto").trim() || "Untitled Catasto",
      sourceFile: String(sourceFile || ""),
      sourceText: String(sourceText || ""),
      createdAt: now,
      updatedAt: now,
      data: projectData
    };
    Object.defineProperty(project, "importChanges", { value: [...changes, ...(conversion?.dropped || [])] });
    return project;
  }

  // Returns each project's id, name, source file, household count, language, and snapshot date.
  async function listProjects() {
    await ready();
    const projects = await request("GET", "projects");
    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function getProject(id) {
    await ready();
    try {
      return await request("GET", `projects/${encodeURIComponent(id)}`);
    } catch (error) {
      if (error.status === 404) return undefined;
      throw error;
    }
  }

  // The server refuses to overwrite a project another tab saved or deleted after this copy was loaded.
  // New projects must be saved with { create: true }.
  // With { snapshot: reason }, the server first keeps the stored data as the project's snapshot.
  async function saveProject(project, { create = false, snapshot = null } = {}) {
    validateData(project.data);
    const saved = await request("PUT", `projects/${encodeURIComponent(project.id)}`, {
      project,
      loadedUpdatedAt: project.updatedAt,
      create,
      ...(snapshot ? { snapshot: { reason: snapshot } } : {})
    });
    project.updatedAt = saved.updatedAt;
    return project;
  }

  // Stores every project or none of them.
  async function saveImportedProjects(projects) {
    if (!Array.isArray(projects) || !projects.length) {
      throw new Error("No projects were selected for import.");
    }
    projects.forEach(project => validateData(project.data));
    await request("POST", "projects/import", { projects });
    return projects;
  }

  // The project and its previous version, read together so they come from the same save.
  async function exportProject(id) {
    return request("GET", `projects/${encodeURIComponent(id)}/export`);
  }

  async function getSnapshot(id) {
    try {
      return await request("GET", `projects/${encodeURIComponent(id)}/snapshot`);
    } catch (error) {
      if (error.status === 404) return undefined;
      throw error;
    }
  }

  // Puts the snapshot's data back; the replaced data becomes the snapshot, so a restore can be undone.
  // `data` is the reviewed, repaired copy of the previous version that is to become current.
  async function restoreSnapshot(project, data) {
    return request("POST", `projects/${encodeURIComponent(project.id)}/restore`, { loadedUpdatedAt: project.updatedAt, data });
  }

  // The server refuses the deletion if the project was saved after this copy was loaded.
  async function deleteProject(project) {
    await request("DELETE", `projects/${encodeURIComponent(project.id)}`, { loadedUpdatedAt: project.updatedAt });
  }

  // An export carries the project's previous version, when it has one, exactly as stored, so a
  // re-imported project can still be restored to it.
  function serializeProject(project, previousVersion = null) {
    return JSON.stringify({
      format: EXCHANGE_FORMAT,
      version: EXCHANGE_VERSION,
      exportedAt: new Date().toISOString(),
      project: {
        name: project.name,
        sourceFile: project.sourceFile,
        sourceText: project.sourceText || "",
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        data: validateData(project.data),
        ...(previousVersion ? {
          previousVersion: { createdAt: previousVersion.createdAt, reason: previousVersion.reason, data: previousVersion.data }
        } : {})
      }
    }, null, 2);
  }

  function projectsFromImport(payload, fallbackName) {
    let candidates;
    if (payload?.format === EXCHANGE_FORMAT && Number(payload.version) > EXCHANGE_VERSION) {
      throw new Error("This backup was exported by a newer version of the Catasto Visualizer. Update the app, then import it again.");
    }
    if (payload?.format === EXCHANGE_FORMAT && payload.project) {
      candidates = [payload.project];
    } else if (payload?.format === EXCHANGE_FORMAT && Array.isArray(payload.projects)) {
      candidates = payload.projects;
    } else if (Array.isArray(payload?.households)) {
      candidates = [{ name: fallbackName, sourceFile: fallbackName, data: payload }];
    } else {
      throw new Error("The selected file is not a Catasto Visualizer project or household data file.");
    }

    return candidates.map(candidate => {
      const project = createProject({
        name: candidate.name || fallbackName,
        sourceFile: candidate.sourceFile || fallbackName,
        sourceText: candidate.sourceText || "",
        data: candidate.data
      });
      // Sent with the import and stored by the server as the project's snapshot, unrepaired.
      if (candidate.previousVersion?.data && typeof candidate.previousVersion.data === "object") {
        project.previousVersion = candidate.previousVersion;
      }
      return project;
    });
  }

  window.CatastoStorage = {
    createProject,
    deleteProject,
    exportProject,
    getProject,
    getSnapshot,
    listProjects,
    restoreSnapshot,
    projectsFromImport,
    saveImportedProjects,
    saveProject,
    serializeProject
  };
}());
