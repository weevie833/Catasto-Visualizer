// Admin page text in English and Italian. The page language is the Visualizer's ("catasto-language"),
// so switching in either page switches both. Static text is marked in admin.html with data-i18n
// (text), data-i18n-placeholder, data-i18n-aria-label, or data-i18n-title; the English text in the
// HTML is the fallback. Messages with values are functions.
(function () {
  "use strict";

  const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
  const languageName = { en: { en: "English", it: "Italian" }, it: { en: "inglese", it: "italiano" } };
  const code = language => language === "it" ? "IT" : "ENG";
  const section = language => language === "it" ? "Italian Transcription" : "English Translation";

  const STRINGS = {
    en: {
      adminTitle: "Catasto Admin",
      supportLine1: "Help offset the costs for", supportLine2: "developing and maintaining this application.", supportKofi: "Support on Ko-fi",
      languageSwitch: "Language", languageEnglish: "English", returnToVisualizer: "Return to Visualizer",
      openVisualizer: "Open in Visualizer", stayInAdmin: "Stay in Admin",
      languageHeading: "Transcription Language", languageLabel: "Language",
      languageOptionEn: "ENG — English Translation", languageOptionIt: "IT — Italian Transcription", saveAsDefault: "Save as default",
      languageHelp: "Applies when importing or creating a project from a Word, Markdown, or text transcription. In a bilingual file only the sections in this language are parsed; an Italian-only transcription needs IT. Italian projects show the source's Italian terms.",
      createHeading: "Create Project from Catasto Text", projectName: "Project name", sourceFile: "Source file",
      dropTitle: "Drop a file here or click to choose", dropHelp: "Word (.docx), Markdown (.md), or plain text (.txt)",
      createProject: "Create project", createIntro: "Projects are saved in a folder on this computer, outside the app folder.",
      guideHeading: "Best Practices for Creating a Project",
      guideIntro: "The Catasto Visualizer is designed to import a plain text transcript in either Italian or English, but the format of your document needs to follow some strict rules. The formatting rules allow the parser to accurately interpret your transcript into the different classifications of content.",
      guideContentTitle: "Catasto content only",
      guideContent: "Keep the transcript free of anything but the actual content of the Catasto Onciario register. If you have added any preamble or introduction, delete it.",
      guideHeaderTitle: "Header formatting",
      guideHeader: "The transcript needs to include headers that distinguish the start of each source image’s content, such as:",
      guideHeaderKey: "The key terms are “START OF RECORD” and the number at the end. This allows the app to tell you where an entry is located in the visualizer.",
      guideEntryTitle: "Entry formatting",
      guideEntry: "The start of a household begins with the list of the head of household. The list of household members should look like this:",
      guideEntryRest: "The rest of the entry can be plain text, as-is. If you upload a DOCX, MD, or TXT file and the Admin says that no households can be found, it is because of the formatting.",
      guideVariationsTitle: "Variations in Catasto content",
      guideVariations: "Not every Catasto Onciario contains relationship information, such as adjacent households or landholdings. If the transcript does not indicate any, then the visualizer cannot show relationships. However, you can still refer to the Adjacent Evidence to locate potential connections.",
      guideReplaceTitle: "Replacing a project",
      guideReplace: "If you discover that your transcript contains errors after you import it into the app, make your corrections in your source transcript, delete the old project out of the Admin, and re-upload your transcript as a new project. Keep your source transcript as the “single version of the truth.”",
      libraryHeading: "Project Library", importTitle: "Import Project JSON",
      importHelp: "Drop a Catasto Visualizer JSON backup (.catasto.json) here or click to choose. A .docx, .md, or .txt transcription is imported as a new project.",
      nameIndexHelpBefore: "Every person named in",
      nameIndexHelpAfter: ", with honorific, given name, surname, qualifier, and residential location. The XLSX Index adds ages, occupations, parents, districts, and pages, one row per person. People with no stated origin are placed in the village below.",
      nameIndexVillage: "Village covered by this Catasto",
      exportJson: "Export JSON", exportCsv: "Export CSV", exportMarkdown: "Export Markdown", exportXlsx: "Export XLSX Index", close: "Close",

      households: count => plural(count, "household", "households"),
      italianProject: "Italian", unavailable: "Unavailable",
      exportProject: "Export Project JSON", exportNameIndex: "Export Name Index",
      restorePrevious: "Restore previous version", downloadPrevious: "Download previous version", deleteProject: "Delete",
      savedAt: date => `Saved ${date}`, earlier: "earlier", noProjects: "No Catasto projects are saved yet.",
      previousVersionName: (name, date) => `${name} (previous version, ${date})`,
      moreChanges: count => `…and ${count} more.`,
      repairReport: list => `Some records in this file had to be repaired before import:\n\n${list}\n\nImport the repaired projects?`,
      restoreRepairs: list => `\n\nThis version predates the current record rules, so a copy of it was repaired:\n${list}\nUse Download previous version first to keep it exactly as saved.`,
      restoreQuestion: (name, date, reason) => `Restore “${name}” to the version saved ${date} (${reason})? The current version becomes the previous version, so this can be undone.`,
      restored: name => `Restored the previous version of “${name}”.`,
      restoreFailed: message => `Restore failed: ${message}`,
      deleteQuestion: name => `Delete “${name}” from this computer? Its previous version is deleted too. Export Project JSON first if you need a backup; the export includes the previous version.`,
      actionFailed: message => `The action could not be completed: ${message} Reload the page and try again.`,
      projectGone: "This project is no longer saved. The list has been updated.",
      exportedPeople: (count, derived) => `Exported ${plural(count, "person", "people")}${derived ? `, ${derived} with a derived surname to review` : ""}.`,
      exportedRows: (count, review) => `Exported ${plural(count, "row", "rows")}${review ? `, ${review} marked to check against the source` : ""}.`,
      notSourceFile: name => `${name} is not a .docx, .md, or .txt file.`,
      restartToUpdate: "Quit and restart the Catasto Visualizer to finish its update, then reload this page.",
      reading: name => `Reading ${name}…`,
      loaded: name => `${name} loaded and ready to parse.`,
      loadedMismatch: (name, message) => `${name} loaded. ${message}`,
      mismatchSections: (target, detected, suffix) => `This text has ${section(detected)} sections but no ${section(target)} sections. Choose ${code(detected)} ${suffix}.`,
      mismatchLooks: (target, detected, suffix) => `This text looks ${languageName.en[detected]}, but ${code(target)} is selected. Choose ${code(detected)} ${suffix}.`,
      tryAgain: "and try again", beforeCreating: "before creating the project",
      otherLanguageHasHouseholds: (selected, other, found) => `No household entries were detected in the ${languageName.en[selected]} text, but the ${languageName.en[other]} text has ${found}. Choose ${code(other)} and try again.`,
      chooseSourceFirst: "Choose or drop a source file first.",
      stillReading: "The source file is still being read. Create the project when it has loaded.",
      noHouseholds: "No household entries were detected.",
      noHouseholdsInFile: "No household entries were detected in this text file.",
      created: (name, count) => `Created “${name}” with ${plural(count, "household", "households")}.`,
      createdTitle: name => `Created “${name}”`,
      readyToExplore: count => `${plural(count, "household", "households")} ready to explore.`,
      chooseImportFile: "Choose a Catasto JSON backup or a .docx, .md, or .txt transcription.",
      importCancelled: "Import cancelled; nothing was saved.",
      imported: count => `Imported ${plural(count, "project", "projects")}.`,
      importedTitle: name => `Imported “${name}”`,
      importedManyTitle: count => `Imported ${count} projects`,
      opensFirst: name => `“${name}” opens first. `,
      importFailed: message => `Import failed: ${message}`,
      storageFailed: message => `Could not open local project storage: ${message}`
    },
    it: {
      adminTitle: "Amministrazione Catasto",
      supportLine1: "Aiuta a coprire i costi di", supportLine2: "sviluppo e manutenzione di questa applicazione.", supportKofi: "Sostieni su Ko-fi",
      languageSwitch: "Lingua", languageEnglish: "Inglese", returnToVisualizer: "Torna al Visualizer",
      openVisualizer: "Apri nel Visualizer", stayInAdmin: "Resta in Admin",
      languageHeading: "Lingua della trascrizione", languageLabel: "Lingua",
      languageOptionEn: "ENG — Traduzione inglese", languageOptionIt: "IT — Trascrizione italiana", saveAsDefault: "Salva come predefinita",
      languageHelp: "Si applica quando si importa o si crea un progetto da una trascrizione Word, Markdown o di testo. In un file bilingue vengono analizzate solo le sezioni in questa lingua; una trascrizione solo in italiano richiede IT. I progetti in italiano mostrano i termini italiani della fonte.",
      createHeading: "Crea un progetto dal testo del Catasto", projectName: "Nome del progetto", sourceFile: "File sorgente",
      dropTitle: "Trascina qui un file o fai clic per sceglierlo", dropHelp: "Word (.docx), Markdown (.md) o testo semplice (.txt)",
      createProject: "Crea progetto", createIntro: "I progetti vengono salvati in una cartella di questo computer, fuori dalla cartella dell’app.",
      guideHeading: "Buone pratiche per creare un progetto",
      guideIntro: "Catasto Visualizer è progettato per importare una trascrizione in testo semplice, in italiano o in inglese, ma il documento deve seguire alcune regole di formattazione precise. Queste regole permettono al programma di interpretare correttamente la trascrizione e di classificarne i diversi contenuti.",
      guideContentTitle: "Solo il contenuto del Catasto",
      guideContent: "La trascrizione deve contenere soltanto il testo del registro del Catasto Onciario. Se hai aggiunto un preambolo o un’introduzione, eliminali.",
      guideHeaderTitle: "Formattazione delle intestazioni",
      guideHeader: "La trascrizione deve includere intestazioni che segnalino l’inizio del contenuto di ciascuna immagine della fonte, ad esempio:",
      guideHeaderKey: "Le parti essenziali sono “START OF RECORD” e il numero finale. Permettono all’app di indicarti dove si trova una voce nel Visualizer.",
      guideEntryTitle: "Formattazione delle voci",
      guideEntry: "Una famiglia inizia con l’elenco che si apre con il capofamiglia. L’elenco dei componenti della famiglia dovrebbe essere simile a questo:",
      guideEntryRest: "Il resto della voce può essere testo semplice, così com’è. Se carichi un file DOCX, MD o TXT e l’Admin indica che non è stata trovata alcuna famiglia, la causa è la formattazione.",
      guideVariationsTitle: "Differenze tra i Catasti",
      guideVariations: "Non tutti i Catasti Onciari contengono informazioni sulle relazioni, come le famiglie confinanti o i terreni. Se la trascrizione non ne riporta, il Visualizer non può mostrare relazioni. Puoi comunque consultare le Prove adiacenti per individuare possibili collegamenti.",
      guideReplaceTitle: "Sostituire un progetto",
      guideReplace: "Se dopo l’importazione scopri errori nella trascrizione, correggili nella trascrizione originale, elimina il vecchio progetto dall’Admin e carica di nuovo la trascrizione come nuovo progetto. Considera la trascrizione originale come “l’unica versione di riferimento”.",
      libraryHeading: "Archivio dei progetti", importTitle: "Importa progetto JSON",
      importHelp: "Trascina qui un backup JSON di Catasto Visualizer (.catasto.json) o fai clic per sceglierlo. Una trascrizione .docx, .md o .txt viene importata come nuovo progetto.",
      nameIndexHelpBefore: "Tutte le persone citate in",
      nameIndexHelpAfter: ", con titolo, nome, cognome, qualifica e luogo di residenza. L’Indice XLSX aggiunge età, mestieri, genitori, rioni e pagine, una riga per persona. Le persone senza provenienza indicata vengono assegnate al paese qui sotto.",
      nameIndexVillage: "Paese a cui si riferisce questo Catasto",
      exportJson: "Esporta JSON", exportCsv: "Esporta CSV", exportMarkdown: "Esporta Markdown", exportXlsx: "Esporta Indice XLSX", close: "Chiudi",

      households: count => plural(count, "famiglia", "famiglie"),
      italianProject: "Italiano", unavailable: "Non disponibile",
      exportProject: "Esporta progetto JSON", exportNameIndex: "Esporta Indice dei nomi",
      restorePrevious: "Ripristina la versione precedente", downloadPrevious: "Scarica la versione precedente", deleteProject: "Elimina",
      savedAt: date => `Salvata il ${date}`, earlier: "in precedenza", noProjects: "Non è ancora stato salvato alcun progetto del Catasto.",
      previousVersionName: (name, date) => `${name} (versione precedente, ${date})`,
      moreChanges: count => `…e altre ${count}.`,
      repairReport: list => `Alcuni record di questo file sono stati riparati prima dell’importazione:\n\n${list}\n\nImportare i progetti riparati?`,
      restoreRepairs: list => `\n\nQuesta versione è precedente alle regole attuali dei record, quindi ne è stata riparata una copia:\n${list}\nUsa prima Scarica la versione precedente per conservarla esattamente com’era.`,
      restoreQuestion: (name, date, reason) => `Ripristinare “${name}” alla versione salvata il ${date} (${reason})? La versione attuale diventa la versione precedente, quindi l’operazione si può annullare.`,
      restored: name => `Ripristinata la versione precedente di “${name}”.`,
      restoreFailed: message => `Ripristino non riuscito: ${message}`,
      deleteQuestion: name => `Eliminare “${name}” da questo computer? Viene eliminata anche la versione precedente. Se ti serve un backup, usa prima Esporta progetto JSON; l’esportazione include la versione precedente.`,
      actionFailed: message => `Non è stato possibile completare l’operazione: ${message} Ricarica la pagina e riprova.`,
      projectGone: "Questo progetto non è più salvato. L’elenco è stato aggiornato.",
      exportedPeople: (count, derived) => `Esportate ${plural(count, "persona", "persone")}${derived ? `, ${derived} con un cognome dedotto da verificare` : ""}.`,
      exportedRows: (count, review) => `Esportate ${plural(count, "riga", "righe")}${review ? `, ${review} da verificare sulla fonte` : ""}.`,
      notSourceFile: name => `${name} non è un file .docx, .md o .txt.`,
      restartToUpdate: "Chiudi e riavvia Catasto Visualizer per completare l’aggiornamento, poi ricarica questa pagina.",
      reading: name => `Lettura di ${name}…`,
      loaded: name => `${name} caricato e pronto per l’analisi.`,
      loadedMismatch: (name, message) => `${name} caricato. ${message}`,
      mismatchSections: (target, detected, suffix) => `Questo testo ha sezioni “${section(detected)}” ma nessuna sezione “${section(target)}”. Scegli ${code(detected)} ${suffix}.`,
      mismatchLooks: (target, detected, suffix) => `Questo testo sembra in ${languageName.it[detected]}, ma è selezionato ${code(target)}. Scegli ${code(detected)} ${suffix}.`,
      tryAgain: "e riprova", beforeCreating: "prima di creare il progetto",
      otherLanguageHasHouseholds: (selected, other, found) => `Nel testo in ${languageName.it[selected]} non è stata rilevata alcuna famiglia, ma il testo in ${languageName.it[other]} ne ha ${found}. Scegli ${code(other)} e riprova.`,
      chooseSourceFirst: "Scegli o trascina prima un file sorgente.",
      stillReading: "Il file sorgente è ancora in lettura. Crea il progetto quando è stato caricato.",
      noHouseholds: "Non è stata rilevata alcuna famiglia.",
      noHouseholdsInFile: "In questo file di testo non è stata rilevata alcuna famiglia.",
      created: (name, count) => `Creato “${name}” con ${plural(count, "famiglia", "famiglie")}.`,
      createdTitle: name => `Creato “${name}”`,
      readyToExplore: count => `${plural(count, "famiglia pronta", "famiglie pronte")} da esplorare.`,
      chooseImportFile: "Scegli un backup JSON del Catasto o una trascrizione .docx, .md o .txt.",
      importCancelled: "Importazione annullata; non è stato salvato nulla.",
      imported: count => `${count === 1 ? "Importato 1 progetto" : `Importati ${count} progetti`}.`,
      importedTitle: name => `Importato “${name}”`,
      importedManyTitle: count => `Importati ${count} progetti`,
      opensFirst: name => `Si apre per primo “${name}”. `,
      importFailed: message => `Importazione non riuscita: ${message}`,
      storageFailed: message => `Impossibile aprire l’archivio locale dei progetti: ${message}`
    }
  };

  const LANGUAGE_KEY = "catasto-language";
  let language = "en";
  try { language = localStorage.getItem(LANGUAGE_KEY) === "it" ? "it" : "en"; } catch { /* Storage may be disabled. */ }

  // The text for key in the page language, called with args when it is a message with values.
  function t(key, ...args) {
    const value = STRINGS[language][key] ?? STRINGS.en[key];
    if (value === undefined) return key;
    return typeof value === "function" ? value(...args) : value;
  }

  // Sets the marked static text. A status line written by the page drops its data-i18n, so it is kept.
  function apply(root = document) {
    document.documentElement.lang = language;
    const marked = attribute => Array.from(root.querySelectorAll?.(`[${attribute}]`) || []);
    marked("data-i18n").forEach(element => { element.textContent = t(element.dataset.i18n); });
    marked("data-i18n-placeholder").forEach(element => { element.placeholder = t(element.dataset.i18nPlaceholder); });
    marked("data-i18n-aria-label").forEach(element => { element.setAttribute("aria-label", t(element.dataset.i18nAriaLabel)); });
    marked("data-i18n-title").forEach(element => { element.title = t(element.dataset.i18nTitle); });
  }

  function setLanguage(next) {
    language = next === "it" ? "it" : "en";
    try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Storage may be disabled. */ }
  }

  window.AdminI18n = { t, apply, setLanguage, language: () => language, STRINGS };
}());
