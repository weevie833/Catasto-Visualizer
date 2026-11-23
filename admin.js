(function () {
  "use strict";

  // A file dropped outside the source file area is ignored; otherwise the browser opens or downloads it.
  window.addEventListener("dragover", event => event.preventDefault());
  window.addEventListener("drop", event => event.preventDefault());

  const projectList = document.querySelector("#projectList");
  const libraryStatus = document.querySelector("#libraryStatus");
  const createStatus = document.querySelector("#createStatus");
  const projectName = document.querySelector("#projectName");
  window.name = "catasto-admin";
  const textFile = document.querySelector("#textFile");
  const sourceDropZone = document.querySelector("#sourceDropZone");
  const dropFileName = document.querySelector("#dropFileName");
  const importFile = document.querySelector("#importFile");
  const importDropZone = document.querySelector("#importDropZone");
  const successNotice = document.querySelector("#successNotice");
  const successTitle = document.querySelector("#successTitle");
  const successDetail = document.querySelector("#successDetail");
  const openVisualizer = document.querySelector("#openVisualizer");
  const sourceLanguage = document.querySelector("#sourceLanguage");
  const saveLanguageDefault = document.querySelector("#saveLanguageDefault");
  const languageDefaultKey = "catasto-source-language";
  const { t } = AdminI18n;
  let selectedSourceName = "";
  let sourceText = ""; // the text of the chosen or dropped source file
  // Each choice of source file is numbered; a read that finishes after a later choice is ignored, so the
  // text, file name, and project name always come from the latest file.
  let sourceRead = 0;
  let readingSource = false;
  // The project name filled in from a file name; a name the user typed is kept.
  let inferredName = "";

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
    if (mismatch) throw new Error(mismatchMessage(mismatch, t("tryAgain")));
    const data = CatastoParser.parsePlainText(text, selectedLanguage());
    if (!data.households.length) {
      // A transcription translated for only a few images can have no readable household in the translation.
      const other = selectedLanguage() === "it" ? "en" : "it";
      const found = CatastoParser.parsePlainText(text, other).households.length;
      if (found) {
        throw new Error(t("otherLanguageHasHouseholds", selectedLanguage(), other, found));
      }
    }
    return data;
  }

  // The parser's language mismatch in the page language; suffix is "and try again" or "before creating the project".
  function mismatchMessage(mismatch, suffix) {
    return t(mismatch.reason === "sections" ? "mismatchSections" : "mismatchLooks", selectedLanguage(), mismatch.detected, suffix);
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

  function changeList(changes) {
    const shown = changes.slice(0, 12).map(change => `• ${change}`);
    if (changes.length > shown.length) shown.push(`• ${t("moreChanges", changes.length - shown.length)}`);
    return shown.join("\n");
  }

  // Lists what repairing the file changed, so nothing is altered without the user seeing it first.
  function importReport(changes) {
    return t("repairReport", changeList(changes));
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
        name: t("previousVersionName", project.name, formatDate(previous.createdAt)),
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
    const repairs = changes.length ? t("restoreRepairs", changeList(changes)) : "";
    const question = t("restoreQuestion", project.name, formatDate(previous.createdAt), previous.reason.toLowerCase()) + repairs;
    if (!window.confirm(question)) return null;
    await CatastoStorage.restoreSnapshot(project, data);
    return t("restored", project.name);
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
    nameIndexStatus.textContent = t("exportedPeople", index.people.length, derived);
  }

  // The Customizable Transcriber's Catasto Onciario Index layout: one row per person, with ages and parents.
  function exportXlsxIndex() {
    if (!nameIndexProject) return;
    const index = CatastoXlsxIndex.buildXlsxIndex(nameIndexProject.data, { village: nameIndexVillage.value, projectName: nameIndexProject.name });
    downloadFile(CatastoXlsxIndex.toXlsx(index), `${slugify(nameIndexProject.name) || "catasto-project"}-index.xlsx`,
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    const review = index.rows.filter(row => /check the source/.test(row[row.length - 1])).length;
    nameIndexStatus.textContent = t("exportedRows", index.rows.length, review);
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
    return Number.isNaN(date.getTime()) ? t("earlier") : date.toLocaleString();
  }

  async function renderProjects() {
    const projects = await CatastoStorage.listProjects();
    projectList.innerHTML = projects.length ? projects.map(project => {
      if (project.unavailable) {
        return `
        <article class="project">
          <div>
            <h3>${escapeHtml(project.name)}</h3>
            <div class="meta">${t("unavailable")}: ${escapeHtml(project.unavailable)}</div>
          </div>
        </article>`;
      }
      const count = project.householdCount;
      const language = project.sourceLanguage === "it" ? ` · ${t("italianProject")}` : "";
      const restore = project.snapshotCreatedAt
        ? `<button class="secondary restore" type="button" title="${escapeHtml(t("savedAt", formatDate(project.snapshotCreatedAt)))}">${t("restorePrevious")}</button>
           <button class="secondary download-previous" type="button">${t("downloadPrevious")}</button>`
        : "";
      return `
        <article class="project" data-project-id="${escapeHtml(project.id)}">
          <div>
            <h3>${escapeHtml(project.name)}</h3>
            <div class="meta">${t("households", count)}${language}${project.sourceFile ? ` · ${escapeHtml(project.sourceFile)}` : ""}</div>
          </div>
          <div class="actions">
            <button class="secondary export" type="button">${t("exportProject")}</button>
            <button class="secondary name-index" type="button">${t("exportNameIndex")}</button>
            ${restore}
            <button class="danger delete" type="button">${t("deleteProject")}</button>
          </div>
        </article>`;
    }).join("") : `<div class="empty">${t("noProjects")}</div>`;
  }

  // Every action reports a failure in the library status rather than ending silently.
  projectList.addEventListener("click", event => handleProjectAction(event).catch(error => {
    libraryStatus.textContent = t("actionFailed", error.message);
  }));

  async function handleProjectAction(event) {
    const projectElement = event.target.closest("[data-project-id]");
    if (!projectElement) return;
    const project = await CatastoStorage.getProject(projectElement.dataset.projectId);
    if (!project) {
      libraryStatus.textContent = t("projectGone");
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
        message = t("restoreFailed", error.message);
      }
      await renderProjects();
      libraryStatus.textContent = message;
    } else if (event.target.closest(".delete")) {
      if (!window.confirm(t("deleteQuestion", project.name))) return;
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

  // A message in the create status line, which then no longer shows the translated intro.
  function status(element, text) {
    if (element.dataset) delete element.dataset.i18n;
    element.textContent = text;
  }

  async function loadSourceFile(file) {
    if (!file) return;
    const read = ++sourceRead;
    sourceText = "";
    selectedSourceName = "";
    dropFileName.textContent = "";
    readingSource = false;
    if (!/\.(?:docx?|md|txt)$/i.test(file.name)) {
      status(createStatus, t("notSourceFile", file.name));
      return;
    }
    if (typeof CatastoDocx === "undefined") {
      // The page is newer than the running server, which does not yet serve the Word reader.
      status(createStatus, t("restartToUpdate"));
      return;
    }
    status(createStatus, t("reading", file.name));
    readingSource = true;
    let text;
    try {
      text = await CatastoDocx.readSourceFile(file);
    } catch (error) {
      if (read !== sourceRead) return;
      readingSource = false;
      status(createStatus, error.message);
      textFile.value = "";
      sourceText = "";
      selectedSourceName = "";
      dropFileName.textContent = "";
      return;
    }
    if (read !== sourceRead) return;
    readingSource = false;
    selectedSourceName = file.name;
    dropFileName.textContent = file.name;
    sourceText = text;
    if (!projectName.value.trim() || projectName.value === inferredName) {
      inferredName = file.name.replace(/\.[^.]+$/, "");
      projectName.value = inferredName;
    }
    const mismatch = CatastoParser.languageMismatch(sourceText, selectedLanguage());
    status(createStatus, mismatch
      ? t("loadedMismatch", file.name, mismatchMessage(mismatch, t("beforeCreating")))
      : t("loaded", file.name));
  }

  // A file area that also takes a dropped file; onFile receives it either way.
  function dropZone(zone, input, onFile) {
    let depth = 0;
    input.addEventListener("change", event => onFile(event.target.files?.[0]));
    zone.addEventListener("dragenter", event => {
      event.preventDefault();
      depth += 1;
      zone.classList.add("dragging");
    });
    zone.addEventListener("dragleave", () => {
      depth = Math.max(0, depth - 1);
      if (!depth) zone.classList.remove("dragging");
    });
    zone.addEventListener("dragover", event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    });
    zone.addEventListener("drop", event => {
      event.preventDefault();
      depth = 0;
      zone.classList.remove("dragging");
      input.value = "";
      onFile(event.dataTransfer.files?.[0]);
    });
  }

  dropZone(sourceDropZone, textFile, loadSourceFile);

  document.querySelector("#createProject").addEventListener("click", async () => {
    const text = sourceText.trim();
    if (readingSource) {
      status(createStatus, t("stillReading"));
      return;
    }
    if (!text) {
      status(createStatus, t("chooseSourceFirst"));
      return;
    }
    try {
      const data = parseTranscription(text);
      if (!data.households.length) throw new Error(t("noHouseholds"));
      const project = CatastoStorage.createProject({
        name: projectName.value,
        sourceFile: selectedSourceName,
        sourceText: text,
        data
      });
      await CatastoStorage.saveProject(project, { create: true });
      savePreference("catasto-active-project", project.id);
      announceLibraryChange("created", project.id);
      projectName.value = "";
      inferredName = "";
      sourceRead += 1;
      sourceText = "";
      textFile.value = "";
      selectedSourceName = "";
      dropFileName.textContent = "";
      const count = data.households.length;
      status(createStatus, t("created", project.name, count));
      await renderProjects();
      showSuccess(t("createdTitle", project.name), t("readyToExplore", count));
    } catch (error) {
      hideSuccess();
      status(createStatus, error.message);
    }
  });

  async function importProjectFile(file) {
    if (!file) return;
    if (typeof CatastoDocx === "undefined") {
      // The page is newer than the running server, which does not yet serve the Word reader.
      libraryStatus.textContent = t("restartToUpdate");
      return;
    }
    libraryStatus.textContent = t("reading", file.name);
    try {
      const contents = await CatastoDocx.readSourceFile(file);
      let projects;
      if (/\.(?:catasto\.)?json$/i.test(file.name) || /\.catasto$/i.test(file.name)) {
        const payload = JSON.parse(contents);
        projects = CatastoStorage.projectsFromImport(payload, file.name.replace(/\.(?:catasto\.)?(?:json|catasto)$/i, ""));
      } else if (/\.(?:docx|md|txt)$/i.test(file.name)) {
        const data = parseTranscription(contents);
        if (!data.households.length) throw new Error(t("noHouseholdsInFile"));
        projects = [CatastoStorage.createProject({
          name: file.name.replace(/\.[^.]+$/, ""),
          sourceFile: file.name,
          sourceText: contents,
          data
        })];
      } else {
        throw new Error(t("chooseImportFile"));
      }
      const changes = projects.flatMap(project => project.importChanges.map(change => projects.length > 1 ? `${project.name}: ${change}` : change));
      if (changes.length && !window.confirm(importReport(changes))) {
        libraryStatus.textContent = t("importCancelled");
        return;
      }
      await CatastoStorage.saveImportedProjects(projects);
      savePreference("catasto-active-project", projects.at(-1).id);
      announceLibraryChange("imported", projects.at(-1).id);
      await renderProjects();
      const opened = projects.at(-1);
      const count = opened.data.households.length;
      libraryStatus.textContent = t("imported", projects.length);
      showSuccess(
        projects.length === 1 ? t("importedTitle", opened.name) : t("importedManyTitle", projects.length),
        `${projects.length === 1 ? "" : t("opensFirst", opened.name)}${t("readyToExplore", count)}`
      );
    } catch (error) {
      hideSuccess();
      libraryStatus.textContent = t("importFailed", error.message);
    } finally {
      importFile.value = "";
    }
  }

  dropZone(importDropZone, importFile, importProjectFile);

  renderProjects().catch(error => {
    libraryStatus.textContent = t("storageFailed", error.message);
  });

  // Page language: the Visualizer's ENG / IT setting, shared through localStorage, so a switch in either
  // page applies to both. The project list is redrawn; status lines already shown keep their language.
  const languageButtons = { en: document.querySelector("#languageEnglish"), it: document.querySelector("#languageItalian") };
  function applyPageLanguage() {
    AdminI18n.apply();
    Object.entries(languageButtons).forEach(([code, button]) => button.setAttribute("aria-pressed", String(AdminI18n.language() === code)));
    renderProjects().catch(() => {});
  }
  Object.entries(languageButtons).forEach(([code, button]) => button.addEventListener("click", () => {
    if (AdminI18n.language() === code) return;
    AdminI18n.setLanguage(code);
    applyPageLanguage();
  }));
  window.addEventListener("storage", event => {
    if (event.key !== "catasto-language" || (event.newValue === "it" ? "it" : "en") === AdminI18n.language()) return;
    AdminI18n.setLanguage(event.newValue);
    applyPageLanguage();
  });
  AdminI18n.apply();
  Object.entries(languageButtons).forEach(([code, button]) => button.setAttribute("aria-pressed", String(AdminI18n.language() === code)));
}());
