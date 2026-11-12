(function () {
  "use strict";

  const projectList = document.querySelector("#projectList");
  const libraryStatus = document.querySelector("#libraryStatus");
  const createStatus = document.querySelector("#createStatus");
  const projectName = document.querySelector("#projectName");
  window.name = "catasto-admin";
  const textFile = document.querySelector("#textFile");
  const plainText = document.querySelector("#plainText");
  const importFile = document.querySelector("#importFile");
  const successNotice = document.querySelector("#successNotice");
  const successTitle = document.querySelector("#successTitle");
  const successDetail = document.querySelector("#successDetail");
  const openVisualizer = document.querySelector("#openVisualizer");
  const sourceLanguage = document.querySelector("#sourceLanguage");
  const saveLanguageDefault = document.querySelector("#saveLanguageDefault");
  const languageDefaultKey = "catasto-source-language";
  let selectedSourceName = "";

  function savePreference(key, value) {
    try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
  }

  function readPreference(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  function removePreference(key) {
    try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
  }

  // ENG unless the user saved IT as the default. The checkbox shows whether the current choice is the saved default.
  function selectedLanguage() {
    return sourceLanguage.value === "it" ? "it" : "en";
  }

  function syncLanguageDefault() {
    const saved = readPreference(languageDefaultKey);
    saveLanguageDefault.checked = saved !== null && saved === selectedLanguage();
  }

  sourceLanguage.value = readPreference(languageDefaultKey) === "it" ? "it" : "en";
  syncLanguageDefault();
  sourceLanguage.addEventListener("change", syncLanguageDefault);
  saveLanguageDefault.addEventListener("change", () => {
    if (saveLanguageDefault.checked) savePreference(languageDefaultKey, selectedLanguage());
    else removePreference(languageDefaultKey);
  });

  function parseTranscription(text) {
    const mismatch = CatastoParser.languageMismatch(text, selectedLanguage());
    if (mismatch) throw new Error(mismatch.message);
    return CatastoParser.parsePlainText(text, selectedLanguage());
  }

  // Tells open Visualizer tabs to reload their project list.
  function announceLibraryChange(reason, projectId = null) {
    if (typeof BroadcastChannel !== "function") return;
    const channel = new BroadcastChannel("catasto-projects");
    channel.postMessage({ type: "projects-changed", reason, projectId });
    channel.close();
  }

  // Confirms a new project and offers the next step. The link targets the Visualizer tab by name, so an
  // open Visualizer is reused; it has already switched to the project.
  function showSuccess(title, detail) {
    successTitle.textContent = title;
    successDetail.textContent = detail;
    successNotice.hidden = false;
    openVisualizer.focus();
  }

  function hideSuccess() {
    successNotice.hidden = true;
  }

  document.querySelector("#dismissNotice").addEventListener("click", hideSuccess);
  openVisualizer.addEventListener("click", hideSuccess);

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

  // Lists what repairing the file changed, so nothing is altered without the user seeing it first.
  function importReport(changes) {
    const shown = changes.slice(0, 12).map(change => `• ${change}`);
    if (changes.length > shown.length) shown.push(`• …and ${changes.length - shown.length} more.`);
    return `Some records in this file had to be repaired before import:\n\n${shown.join("\n")}\n\nImport the repaired projects?`;
  }

  function downloadFile(contents, fileName, type = "application/json") {
    const blob = new Blob([contents], { type });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = fileName;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 60_000);
  }

  async function downloadProject(project) {
    const exported = await CatastoStorage.exportProject(project.id);
    downloadFile(CatastoStorage.serializeProject(exported.project, exported.previousVersion), `${slugify(exported.project.name) || "catasto-project"}.catasto.json`);
  }

  // The previous version exactly as stored, as a project file that Admin can import (repairing it then).
  async function downloadPreviousVersion(project) {
    const previous = await CatastoStorage.getSnapshot(project.id);
    if (!previous) return;
    const payload = {
      format: "catasto-visualizer-project",
      version: 2,
      exportedAt: new Date().toISOString(),
      project: {
        name: `${project.name} (previous version, ${formatDate(previous.createdAt)})`,
        sourceFile: project.sourceFile,
        sourceText: project.sourceText || "",
        createdAt: previous.createdAt,
        updatedAt: previous.updatedAt,
        data: previous.data
      }
    };
    downloadFile(JSON.stringify(payload, null, 2), `${slugify(project.name) || "catasto-project"}-previous-version.catasto.json`);
  }

  // A previous version saved before the current record rules is repaired on a copy; the user sees each
  // repair before the copy replaces the current data.
  async function restorePreviousVersion(project) {
    const previous = await CatastoStorage.getSnapshot(project.id);
    if (!previous) return null;
    const data = JSON.parse(JSON.stringify(previous.data));
    const changes = CatastoRecords.repairProjectData(data);
    const repairs = changes.length
      ? `\n\nThis version predates the current record rules, so a copy of it was repaired:\n${changes.slice(0, 12).map(change => `• ${change}`).join("\n")}${changes.length > 12 ? `\n• …and ${changes.length - 12} more.` : ""}\nUse Download previous version first to keep it exactly as saved.`
      : "";
    const question = `Restore “${project.name}” to the version saved ${formatDate(previous.createdAt)} (${previous.reason.toLowerCase()})? The current version becomes the previous version, so this can be undone.${repairs}`;
    if (!window.confirm(question)) return null;
    await CatastoStorage.restoreSnapshot(project, data);
    return `Restored the previous version of “${project.name}”.`;
  }

  // Name Index: built by catasto-name-index.js from the stored project when exported; nothing is saved.
  const nameIndexDialog = document.querySelector("#nameIndexDialog");
  const nameIndexVillage = document.querySelector("#nameIndexVillage");
  const nameIndexStatus = document.querySelector("#nameIndexStatus");
  let nameIndexProject = null;
  const nameIndexExports = ["#nameIndexJson", "#nameIndexCsv", "#nameIndexMarkdown", "#nameIndexXlsx"].map(id => document.querySelector(id));

  function openNameIndex(project) {
    nameIndexProject = project;
    document.querySelector("#nameIndexProject").textContent = project.name;
    nameIndexVillage.value = CatastoNameIndex.suggestedVillage(project.data);
    const refusal = CatastoNameIndex.refusalFor(project.data);
    nameIndexStatus.textContent = refusal;
    nameIndexExports.forEach(button => { button.disabled = Boolean(refusal); });
    nameIndexDialog.showModal();
  }

  function exportNameIndex(format) {
    if (!nameIndexProject) return;
    const index = CatastoNameIndex.buildNameIndex(nameIndexProject.data, { village: nameIndexVillage.value, projectName: nameIndexProject.name });
    const base = `${slugify(nameIndexProject.name) || "catasto-project"}-name-index`;
    if (format === "md") downloadFile(CatastoNameIndex.toMarkdown(index), `${base}.md`, "text/markdown");
    else if (format === "csv") downloadFile(CatastoNameIndex.toCsv(index), `${base}.csv`, "text/csv");
    else downloadFile(CatastoNameIndex.toJson(index), `${base}.json`);
    const derived = index.people.filter(person => person.surname_derived).length;
    nameIndexStatus.textContent = `Exported ${index.people.length} people${derived ? `, ${derived} with a derived surname to review` : ""}.`;
  }

  // The Customizable Transcriber's Catasto Onciario Index layout: one row per person, with ages and parents.
  function exportXlsxIndex() {
    if (!nameIndexProject) return;
    const index = CatastoXlsxIndex.buildXlsxIndex(nameIndexProject.data, { village: nameIndexVillage.value, projectName: nameIndexProject.name });
    downloadFile(CatastoXlsxIndex.toXlsx(index), `${slugify(nameIndexProject.name) || "catasto-project"}-index.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const review = index.rows.filter(row => /check the source/.test(row[row.length - 1])).length;
    nameIndexStatus.textContent = `Exported ${index.rows.length} rows${review ? `, ${review} marked to check against the source` : ""}.`;
  }

  // An index that cannot be made (see CatastoNameIndex.refusalFor) is reported, and nothing is downloaded.
  const reportingFailure = action => () => {
    try {
      action();
    } catch (error) {
      nameIndexStatus.textContent = error.message;
    }
  };
  document.querySelector("#nameIndexJson").addEventListener("click", reportingFailure(() => exportNameIndex("json")));
  document.querySelector("#nameIndexCsv").addEventListener("click", reportingFailure(() => exportNameIndex("csv")));
  document.querySelector("#nameIndexMarkdown").addEventListener("click", reportingFailure(() => exportNameIndex("md")));
  document.querySelector("#nameIndexXlsx").addEventListener("click", reportingFailure(exportXlsxIndex));

  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "earlier" : date.toLocaleString();
  }

  async function renderProjects() {
    const projects = await CatastoStorage.listProjects();
    projectList.innerHTML = projects.length ? projects.map(project => {
      if (project.unavailable) {
        return `
        <article class="project">
          <div>
            <h3>${escapeHtml(project.name)}</h3>
            <div class="meta">Unavailable: ${escapeHtml(project.unavailable)}</div>
          </div>
        </article>`;
      }
      const count = project.householdCount;
      const language = project.sourceLanguage === "it" ? " · Italian" : "";
      const restore = project.snapshotCreatedAt
        ? `<button class="secondary restore" type="button" title="Saved ${escapeHtml(formatDate(project.snapshotCreatedAt))}">Restore previous version</button>
           <button class="secondary download-previous" type="button">Download previous version</button>`
        : "";
      return `
        <article class="project" data-project-id="${escapeHtml(project.id)}">
          <div>
            <h3>${escapeHtml(project.name)}</h3>
            <div class="meta">${count} household${count === 1 ? "" : "s"}${language}${project.sourceFile ? ` · ${escapeHtml(project.sourceFile)}` : ""}</div>
          </div>
          <div class="actions">
            <button class="secondary export" type="button">Export Project JSON</button>
            <button class="secondary name-index" type="button">Export Name Index</button>
            ${restore}
            <button class="danger delete" type="button">Delete</button>
          </div>
        </article>`;
    }).join("") : '<div class="empty">No Catasto projects are saved yet.</div>';
  }

  // Every action reports a failure in the library status rather than ending silently.
  projectList.addEventListener("click", event => handleProjectAction(event).catch(error => {
    libraryStatus.textContent = `The action could not be completed: ${error.message} Reload the page and try again.`;
  }));

  async function handleProjectAction(event) {
    const projectElement = event.target.closest("[data-project-id]");
    if (!projectElement) return;
    const project = await CatastoStorage.getProject(projectElement.dataset.projectId);
    if (!project) {
      libraryStatus.textContent = "This project is no longer saved. The list has been updated.";
      await renderProjects();
      return;
    }
    if (event.target.closest(".export")) {
      await downloadProject(project);
    } else if (event.target.closest(".name-index")) {
      openNameIndex(project);
    } else if (event.target.closest(".download-previous")) {
      await downloadPreviousVersion(project);
    } else if (event.target.closest(".restore")) {
      let message;
      try {
        message = await restorePreviousVersion(project);
        if (!message) return;
        announceLibraryChange("restored", project.id);
      } catch (error) {
        message = `Restore failed: ${error.message}`;
      }
      await renderProjects();
      libraryStatus.textContent = message;
    } else if (event.target.closest(".delete")) {
      if (!window.confirm(`Delete “${project.name}” from this computer? Its previous version is deleted too. Export Project JSON first if you need a backup; the export includes the previous version.`)) return;
      let message = "";
      try {
        await CatastoStorage.deleteProject(project);
        announceLibraryChange("deleted", project.id);
      } catch (error) {
        message = error.message;
      }
      await renderProjects();
      if (message) libraryStatus.textContent = message;
    }
  }

  textFile.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    selectedSourceName = file.name;
    plainText.value = await file.text();
    if (!projectName.value.trim()) projectName.value = file.name.replace(/\.[^.]+$/, "");
    const mismatch = CatastoParser.languageMismatch(plainText.value, selectedLanguage());
    createStatus.textContent = mismatch
      ? `${file.name} loaded. ${mismatch.message.replace(" and try again", " before creating the project")}`
      : `${file.name} loaded and ready to parse.`;
  });

  document.querySelector("#createProject").addEventListener("click", async () => {
    const text = plainText.value.trim();
    if (!text) {
      createStatus.textContent = "Add plain text or choose a text file first.";
      return;
    }
    try {
      const data = parseTranscription(text);
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
      const count = data.households.length;
      createStatus.textContent = `Created “${project.name}” with ${count} household${count === 1 ? "" : "s"}.`;
      await renderProjects();
      showSuccess(`Created “${project.name}”`, `${count} household${count === 1 ? "" : "s"} ready to explore.`);
    } catch (error) {
      hideSuccess();
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
        const data = parseTranscription(contents);
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
      const changes = projects.flatMap(project => project.importChanges.map(change => projects.length > 1 ? `${project.name}: ${change}` : change));
      if (changes.length && !window.confirm(importReport(changes))) {
        libraryStatus.textContent = "Import cancelled; nothing was saved.";
        return;
      }
      await CatastoStorage.saveImportedProjects(projects);
      savePreference("catasto-active-project", projects.at(-1).id);
      announceLibraryChange("imported", projects.at(-1).id);
      await renderProjects();
      const opened = projects.at(-1);
      const count = opened.data.households.length;
      libraryStatus.textContent = `Imported ${projects.length} project${projects.length === 1 ? "" : "s"}.`;
      showSuccess(
        projects.length === 1 ? `Imported “${opened.name}”` : `Imported ${projects.length} projects`,
        `${projects.length === 1 ? "" : `“${opened.name}” opens first. `}${count} household${count === 1 ? "" : "s"} ready to explore.`
      );
    } catch (error) {
      hideSuccess();
      libraryStatus.textContent = `Import failed: ${error.message}`;
    } finally {
      importFile.value = "";
    }
  });

  renderProjects().catch(error => {
    libraryStatus.textContent = `Could not open local project storage: ${error.message}`;
  });
}());
