(function () {
  "use strict";

  const DATABASE_NAME = "catasto-visualizer";
  const DATABASE_VERSION = 1;
  const PROJECT_STORE = "projects";
  const EXCHANGE_FORMAT = "catasto-visualizer-project";
  const EXCHANGE_VERSION = 1;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(PROJECT_STORE)) {
          database.createObjectStore(PROJECT_STORE, { keyPath: "id" });
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
  }

  async function withStore(mode, operation) {
    const database = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(PROJECT_STORE, mode);
      const store = transaction.objectStore(PROJECT_STORE);
      let result;
      let failure = null;
      const fail = error => {
        failure = error;
        transaction.abort();
      };

      try {
        result = operation(store, fail);
      } catch (error) {
        transaction.abort();
        database.close();
        reject(error);
        return;
      }

      transaction.addEventListener("complete", () => {
        database.close();
        resolve(result);
      });
      transaction.addEventListener("error", () => {
        database.close();
        reject(transaction.error);
      });
      transaction.addEventListener("abort", () => {
        database.close();
        reject(failure || transaction.error || new Error("Storage operation was cancelled."));
      });
    });
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () => reject(request.error));
    });
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

  function createProject({ name, sourceFile, sourceText, data }) {
    const now = new Date().toISOString();
    return {
      id: newId(),
      name: String(name || "Untitled Catasto").trim() || "Untitled Catasto",
      sourceFile: String(sourceFile || ""),
      sourceText: String(sourceText || ""),
      createdAt: now,
      updatedAt: now,
      data: validateData(data)
    };
  }

  async function listProjects() {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      const projects = await requestResult(transaction.objectStore(PROJECT_STORE).getAll());
      return projects.sort((a, b) => a.name.localeCompare(b.name));
    } finally {
      database.close();
    }
  }

  async function getProject(id) {
    const database = await openDatabase();
    try {
      const transaction = database.transaction(PROJECT_STORE, "readonly");
      return await requestResult(transaction.objectStore(PROJECT_STORE).get(id));
    } finally {
      database.close();
    }
  }

  // Refuses to overwrite a project another tab saved or deleted after this copy was loaded.
  // New projects must be saved with { create: true }.
  async function saveProject(project, { create = false } = {}) {
    validateData(project.data);
    const loadedUpdatedAt = project.updatedAt;
    const updatedAt = new Date().toISOString();
    await withStore("readwrite", (store, fail) => {
      const request = store.get(project.id);
      request.addEventListener("success", () => {
        const stored = request.result;
        if (stored && stored.updatedAt !== loadedUpdatedAt) {
          fail(new Error("This project was changed in another tab or window. Reload the page before saving again; your unsaved change was not stored."));
        } else if (!stored && !create) {
          fail(new Error("This project was deleted in another tab or window. Reload the page; your unsaved change was not stored."));
        } else {
          store.put({ ...project, updatedAt });
        }
      });
    });
    project.updatedAt = updatedAt;
    return project;
  }

  async function saveImportedProjects(projects) {
    if (!Array.isArray(projects) || !projects.length) {
      throw new Error("No projects were selected for import.");
    }
    projects.forEach(project => validateData(project.data));
    await withStore("readwrite", store => {
      projects.forEach(project => store.add(project));
    });
    return projects;
  }

  async function deleteProject(id) {
    await withStore("readwrite", store => store.delete(id));
  }

  function serializeProject(project) {
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
        data: validateData(project.data)
      }
    }, null, 2);
  }

  function projectsFromImport(payload, fallbackName) {
    let candidates;
    if (payload?.format === EXCHANGE_FORMAT && payload.project) {
      candidates = [payload.project];
    } else if (payload?.format === EXCHANGE_FORMAT && Array.isArray(payload.projects)) {
      candidates = payload.projects;
    } else if (Array.isArray(payload?.households)) {
      candidates = [{ name: fallbackName, sourceFile: fallbackName, data: payload }];
    } else {
      throw new Error("The selected file is not a Catasto Visualizer project or household data file.");
    }

    return candidates.map(candidate => createProject({
      name: candidate.name || fallbackName,
      sourceFile: candidate.sourceFile || fallbackName,
      sourceText: candidate.sourceText || "",
      data: candidate.data
    }));
  }

  window.CatastoStorage = {
    createProject,
    deleteProject,
    getProject,
    listProjects,
    projectsFromImport,
    saveImportedProjects,
    saveProject,
    serializeProject
  };
}());
