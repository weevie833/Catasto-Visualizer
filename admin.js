(function () {
  "use strict";

  const projectList = document.querySelector("#projectList");
  const libraryStatus = document.querySelector("#libraryStatus");
  const createStatus = document.querySelector("#createStatus");
  const projectName = document.querySelector("#projectName");
  const textFile = document.querySelector("#textFile");
  const plainText = document.querySelector("#plainText");
  const importFile = document.querySelector("#importFile");
  let selectedSourceName = "";

  function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
  }

  // Tells open Visualizer tabs to reload their project list.
  function announceLibraryChange(reason, projectId = null) {
    if (typeof BroadcastChannel !== "function") return;
    const channel = new BroadcastChannel("catasto-projects");
    channel.postMessage({ type: "projects-changed", reason, projectId });
    channel.close();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
    })[character]);
  }

  function slugify(value) {
    return String(value).toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function downloadProject(project) {
    const blob = new Blob([CatastoStorage.serializeProject(project)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${slugify(project.name) || "catasto-project"}.catasto.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  }

  async function renderProjects() {
    const projects = await CatastoStorage.listProjects();
    projectList.innerHTML = projects.length ? projects.map(project => {
      const count = project.data.households.length;
      return `
        <article class="project" data-project-id="${escapeHtml(project.id)}">
          <div>
            <h3>${escapeHtml(project.name)}</h3>
            <div class="meta">${count} household${count === 1 ? "" : "s"}${project.sourceFile ? ` · ${escapeHtml(project.sourceFile)}` : ""}</div>
          </div>
          <div class="actions">
            <button class="secondary export" type="button">Export JSON</button>
            <button class="danger delete" type="button">Delete</button>
          </div>
        </article>`;
    }).join("") : '<div class="empty">No Catasto projects are saved yet.</div>';
    libraryStatus.textContent = `${projects.length} project${projects.length === 1 ? "" : "s"} stored locally.`;
  }

  projectList.addEventListener("click", async event => {
    const projectElement = event.target.closest("[data-project-id]");
    if (!projectElement) return;
    const project = await CatastoStorage.getProject(projectElement.dataset.projectId);
    if (!project) return;
    if (event.target.closest(".export")) {
      downloadProject(project);
    } else if (event.target.closest(".delete")) {
      if (!window.confirm(`Delete “${project.name}” from this browser? Export it first if you need a backup.`)) return;
      await CatastoStorage.deleteProject(project.id);
      announceLibraryChange("deleted", project.id);
      await renderProjects();
    }
  });

  textFile.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    selectedSourceName = file.name;
    plainText.value = await file.text();
    if (!projectName.value.trim()) projectName.value = file.name.replace(/\.[^.]+$/, "");
    createStatus.textContent = `${file.name} loaded and ready to parse.`;
  });

  document.querySelector("#createProject").addEventListener("click", async () => {
    const text = plainText.value.trim();
    if (!text) {
      createStatus.textContent = "Add plain text or choose a text file first.";
      return;
    }
    try {
      const data = CatastoParser.parsePlainText(text);
      if (!data.households.length) throw new Error("No household entries were detected.");
      const project = CatastoStorage.createProject({
        name: projectName.value,
        sourceFile: selectedSourceName || "pasted plain text",
        sourceText: text,
        data
      });
      await CatastoStorage.saveProject(project, { create: true });
      savePreference("catasto-active-project", project.id);
      announceLibraryChange("created", project.id);
      projectName.value = "";
      plainText.value = "";
      textFile.value = "";
      selectedSourceName = "";
      createStatus.textContent = `Created “${project.name}” with ${data.households.length} households.`;
      await renderProjects();
    } catch (error) {
      createStatus.textContent = error.message;
    }
  });

  importFile.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const contents = await file.text();
      let projects;
      if (/\.(?:catasto\.)?json$/i.test(file.name) || /\.catasto$/i.test(file.name)) {
        const payload = JSON.parse(contents);
        projects = CatastoStorage.projectsFromImport(payload, file.name.replace(/\.(?:catasto\.)?(?:json|catasto)$/i, ""));
      } else if (/\.(?:md|txt)$/i.test(file.name)) {
        const data = CatastoParser.parsePlainText(contents);
        if (!data.households.length) throw new Error("No household entries were detected in this text file.");
        projects = [CatastoStorage.createProject({
          name: file.name.replace(/\.[^.]+$/, ""),
          sourceFile: file.name,
          sourceText: contents,
          data
        })];
      } else {
        throw new Error("Choose a Catasto JSON backup, .md transcription, or .txt transcription.");
      }
      await CatastoStorage.saveImportedProjects(projects);
      savePreference("catasto-active-project", projects.at(-1).id);
      announceLibraryChange("imported", projects.at(-1).id);
      await renderProjects();
      libraryStatus.textContent = `Imported ${projects.length} project${projects.length === 1 ? "" : "s"}. An open Visualizer tab now shows it; otherwise use Return to Visualizer.`;
    } catch (error) {
      libraryStatus.textContent = `Import failed: ${error.message}`;
    } finally {
      importFile.value = "";
    }
  });

  renderProjects().catch(error => {
    libraryStatus.textContent = `Could not open local project storage: ${error.message}`;
  });
}());
