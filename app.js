// The Visualizer page: project library, household list, search, source editing, and migrations.
// Name, place, and residence rules come from the canonical parser so the Visualizer and Admin agree.
const {
  canonicalPlace, expandNeighborNames, isMemberLine, isPublicAnchor, linkResidenceAdjacency, memberPersonName, normalizeName,
  parsePlainText, parseResidence, personKey, sentenceList, stripNamePrefixes, surnameFromName, surnamePhrase,
  triangulateResidenceAdjacency
} = window.CatastoParser;
// Admin's "Open in Visualizer" links target this name, so they switch to this tab instead of opening another.
window.name = "catasto-visualizer";

let households = [];
let householdById = new Map();

const list = document.querySelector("#householdList");
const personSearch = document.querySelector("#personSearch");
const runPersonSearch = document.querySelector("#runPersonSearch");
const clearPersonSearch = document.querySelector("#clearPersonSearch");
const filenameLine = document.querySelector("#filenameLine");
const projectSelect = document.querySelector("#projectSelect");
const sourceEditModal = document.querySelector("#sourceEditModal");
const sourceEditText = document.querySelector("#sourceEditText");
const sourceEditPlace = document.querySelector("#sourceEditPlace");
const sourceEditStatus = document.querySelector("#sourceEditStatus");
const sourceEditButton = document.querySelector("#editSourceEntry");
const panelDivider = document.querySelector("#panelDivider");
const duplicateModal = document.querySelector("#duplicateModal");
const duplicateComparison = document.querySelector("#duplicateComparison");
const duplicateStatus = document.querySelector("#duplicateStatus");
const duplicateDecisionActions = document.querySelector("#duplicateDecisionActions");
const duplicateUndoActions = document.querySelector("#duplicateUndoActions");
let duplicateReview = null;
const searchFilterInputs = {
  head: document.querySelector("#filterHouseholdHead"),
  member: document.querySelector("#filterFamilyMember"),
  reference: document.querySelector("#filterReference")
};
const UI_STRINGS = {
  en: {
    households: "Households", landholdings: "Landholdings", landowners: "Landowners",
    searchPeople: "Search entire Catasto", searchPlaceholder: "Any person named anywhere", search: "SEARCH", clear: "Clear",
    selectedUnit: "Selected unit", upload: "UPLOAD", currentFile: "Current file",
    exploreDistrict: "Explore district", allDistricts: "All districts", names: "Names", boundaries: "Boundaries", people: "People",
    focus: "Focus", overview: "Overview", topView: "Top view", perspective: "Perspective", details: "Details", expand: "Expand", exitExpanded: "Exit expanded",
    zoomIn: "Zoom 3D view in", zoomOut: "Zoom 3D view out", selected: "Selected", namedNeighbor: "Named neighbor",
    navigation: "Drag to pan · Right-drag to orbit · Scroll to zoom<br>Touch: one finger to pan; two fingers to pan / zoom",
    sourceEntry: "Source tax entry", loading: "Loading extracted household data...", noResidence: "No residence listed", notListed: "Not Listed",
    noMatch: "No people or references match this search.", noHouseholds: "No households found.", noLandholdings: "No landholdings found",
    noLandSource: "No landholding clauses with bordering language were detected in this source.", noHouseholdSource: "No household entries were detected in this source.",

    cancel: "Cancel", inferred: "inferred",

    noRecordsLoaded: "No data loaded", uploadToBegin: "Upload or paste Catasto text to begin.",
    edit: "Edit", editSourceTitle: "Edit source tax entry", residencePlace: "Residence place", saveChanges: "Save changes",
    editStoredLocally: "Changes are saved locally in this Catasto project.",
    householdHeadMatch: "Household head", householdMemberMatch: "Household member", residenceReferenceMatch: "Residence reference",
    landReferenceMatch: "Land reference", financialReferenceMatch: "Financial reference", sourceReferenceMatch: "Source reference",
    filterResults: "Filter search results", familyMember: "Family member", reference: "Reference",
    adjacentEvidence: "Adjacent evidence", resizePanels: "Resize text panels", back: "Back",
    backTo: name => `Back to ${name}`, openPerson: name => `Show ${name} in the Visualizer`,
    resizePanelsHint: "Drag to resize the text panels; double-click to reset"
  },
  it: {
    households: "Famiglie", landholdings: "Terreni", landowners: "Proprietari",
    searchPeople: "Cerca nell’intero Catasto", searchPlaceholder: "Qualsiasi persona citata nel Catasto", search: "CERCA", clear: "Cancella",
    selectedUnit: "Unità selezionata", upload: "CARICA", currentFile: "File corrente",
    exploreDistrict: "Esplora il rione", allDistricts: "Tutti i rioni", names: "Nomi", boundaries: "Confini", people: "Persone",
    focus: "Metti a fuoco", overview: "Panoramica", topView: "Vista dall’alto", perspective: "Prospettiva", details: "Dettagli", expand: "Espandi", exitExpanded: "Esci da schermo intero",
    zoomIn: "Ingrandisci la vista 3D", zoomOut: "Riduci la vista 3D", selected: "Selezionato", namedNeighbor: "Vicino citato",
    navigation: "Trascina per spostarti · Trascina col tasto destro per ruotare · Rotellina per zoom<br>Touch: un dito per spostarsi; due dita per spostarsi / zoom",
    sourceEntry: "Voce catastale originale", loading: "Caricamento dei dati estratti...", noResidence: "Residenza non indicata", notListed: "Non indicato",
    noMatch: "Nessuna persona o riferimento corrisponde alla ricerca.", noHouseholds: "Nessuna famiglia trovata.", noLandholdings: "Nessun terreno trovato",
    noLandSource: "Nel documento non sono state rilevate voci catastali con confini dei terreni.", noHouseholdSource: "Nel documento non sono state rilevate voci familiari.",

    cancel: "Annulla", inferred: "dedotta",

    noRecordsLoaded: "Nessun dato caricato", uploadToBegin: "Carica o incolla il testo del Catasto per iniziare.",
    edit: "Modifica", editSourceTitle: "Modifica la voce catastale", residencePlace: "Luogo di residenza", saveChanges: "Salva modifiche",
    editStoredLocally: "Le modifiche vengono salvate localmente in questo progetto catastale.",
    householdHeadMatch: "Capofamiglia", householdMemberMatch: "Componente familiare", residenceReferenceMatch: "Riferimento di residenza",
    landReferenceMatch: "Riferimento fondiario", financialReferenceMatch: "Riferimento finanziario", sourceReferenceMatch: "Riferimento nella fonte",
    filterResults: "Filtra i risultati", familyMember: "Familiare", reference: "Riferimento",
    adjacentEvidence: "Prove adiacenti", resizePanels: "Ridimensiona i pannelli di testo", back: "Indietro",
    backTo: name => `Torna a ${name}`, openPerson: name => `Mostra ${name} nel Visualizzatore`,
    resizePanelsHint: "Trascina per ridimensionare i pannelli di testo; doppio clic per ripristinare"
  }
};
function storedPreference(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function savePreference(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Storage may be disabled. */ }
}

function removePreference(key) {
  try { localStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
}

let language = storedPreference("catasto-language") === "it" ? "it" : "en";
let currentFileName = "sample extracted data";
const t = key => UI_STRINGS[language][key] || UI_STRINGS.en[key] || key;
const localizedPlace = place => place === "No residence listed" ? t("noResidence") : place === "Not Listed" ? t("notListed") : place;
function localizedRole(role) {
  if (language !== "it" || !role) return role || "";
  const translations = [
    [/\bthe same age in\b/gi, "la stessa età nel"],
    [/\baged\s+(\d+)\b/gi, "$1 anni"],
    [/\bage\s+(\d+)\b/gi, "$1 anni"],
    [/\bsenior day laborer\b/gi, "bracciante anziano"],
    [/\ba day laborer\b/gi, "bracciante"],
    [/\ba shepherd\b/gi, "pastore"],
    [/\bmaster blacksmith\b/gi, "maestro fabbro"],
    [/\bmaster shoemaker\b/gi, "maestro calzolaio"],
    [/\bmaster tailor\b/gi, "maestro sarto"],
    [/\bmanager of oxen(?:\s+\[rancher\])?/gi, "bovaro"],
    [/\bkeeper of oxen\b/gi, "bovaro"],
    [/\box manager\b/gi, "bovaro"],
    [/\bkingdom\/state notary\b/gi, "notaio del Regno"],
    [/\bregistered by the audit court\b/gi, "registrato dalla Corte dei Conti"],
    [/\bhome-based nun\b/gi, "monaca di casa"],
    [/\bdomestic nun\b/gi, "monaca di casa"],
    [/\bparish priest\b/gi, "parroco"],
    [/\bwidowed mother\b/gi, "madre vedova"],
    [/\bmother church\b/gi, "chiesa madre"],
    [/\bthis city of\b/gi, "questa città di"],
    [/\brancher\b/gi, "mandriano"],
    [/\bburdened\b/gi, "gravato"],
    [/\blikely\b/gi, "probabilmente"],
    [/\breported\b/gi, "indicato"],
    [/\bsame\b/gi, "stessa"],
    [/\bnickname\b/gi, "soprannome"],
    [/\band\b/gi, "e"],
    [/\bmagnificent\b/gi, "Magnifico"],
    [/\billustrious\b/gi, "Illustre"],
    [/\bsister\b/gi, "Suor"],
    [/\bliving nobleman\b/gi, "nobile residente"],
    [/\bliving noble\b/gi, "nobile residente"],
    [/\bvirgin and head of household\b/gi, "nubile e capofamiglia"],
    [/\bhead of household\b/gi, "capofamiglia"],
    [/\bvirgin\b/gi, "nubile"],
    [/\bday laborer\b/gi, "bracciante"],
    [/\blaborer\b/gi, "lavoratore"],
    [/\bshepherd\b/gi, "pastore"],
    [/\bmiller\b/gi, "mugnaio"],
    [/\bservant\b/gi, "servitore"],
    [/\bshoemaker\b/gi, "calzolaio"],
    [/\btailor\b/gi, "sarto"],
    [/\bblacksmith\b/gi, "fabbro"],
    [/\bpriest\b/gi, "sacerdote"],
    [/\bdeacon\b/gi, "diacono"],
    [/\bcleric\b/gi, "chierico"],
    [/\bblind\b/gi, "cieco"],
    [/\bcrippled(?:\/disabled)?\b/gi, "storpio/disabile"],
    [/\b(?:aged|decrepit)\/(?:decrepit|aged)\b/gi, "anziano e debilitato"],
    [/\bdecrepit\b/gi, "debilitato"],
    [/\bdisabled\b/gi, "disabile"],
    [/\baged\b|\bage\b/gi, "anni"],
    [/\bson of the late\b/gi, "figlio del fu"],
    [/\bdaughter of the late\b/gi, "figlia della fu"],
    [/\bwidow of the late\b/gi, "vedova del fu"],
    [/\bson of\b/gi, "figlio di"],
    [/\bdaughter of\b/gi, "figlia di"],
    [/\bwife of\b/gi, "moglie di"],
    [/\bwidow of\b/gi, "vedova di"],
    [/\bwife\b/gi, "moglie"],
    [/\bhusband\b/gi, "marito"],
    [/\bson\b/gi, "figlio"],
    [/\bdaughter\b/gi, "figlia"],
    [/\bbrother\b/gi, "fratello"],
    [/\bsister\b/gi, "sorella"],
    [/\bnephew\b/gi, "nipote"],
    [/\bniece\b/gi, "nipote"],
    [/\balso known as\b/gi, "detto anche"],
    [/\bfor his patrimony\b/gi, "per il suo patrimonio"],
    [/\balso from the land of\b/gi, "anche originario del territorio di"],
    [/\bfrom the land of\b/gi, "originario del territorio di"],
    [/\bfrom the casale of\b/gi, "originario del casale di"],
    [/\bhousehold\b/gi, "famiglia"],
    [/\bmother\b/gi, "madre"],
    [/\bfather\b/gi, "padre"],
    [/\bof the late\b/gi, "del fu"],
    [/\bthe late\b/gi, "il fu"],
    [/\bsince he was\b/gi, "poiché aveva"],
    [/\[infirm\/elderly\]/gi, "[infermo/anziano]"],
    [/\[likely\s+([^\]]+)\]/gi, "[probabilmente $1]"],
    [/\[nickname\?\]/gi, "[soprannome?]"],
    [/\s+,/g, ","],
    [/\s{2,}/g, " "]
  ];
  return translations.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), role).replace(/\s*[—-]{2,}\s*/g, " — ").trim();
}

function applyLanguage() {
  document.documentElement.lang = language;
  const textById = {
    sidebarTitle: view.layer === "land" ? t("landowners") : t("households"),
    searchPeopleLabel: t("searchPeople"), runPersonSearch: t("search"), clearPersonSearch: t("clear"),
    selectedUnitLabel: t("selectedUnit"),
    districtLabel: t("exploreDistrict"),
    focus3d: t("focus"), fit3d: t("overview"), plan3d: document.querySelector("#plan3d").getAttribute("aria-pressed") === "true" ? t("perspective") : t("topView"),
    details3d: t("details"), expand3d: document.querySelector("#expand3d").getAttribute("aria-pressed") === "true" ? t("exitExpanded") : t("expand"),
    sourceEntryLabel: t("sourceEntry"),
    editSourceEntry: t("edit"), sourceEditTitle: t("editSourceTitle"), sourceEditPlaceLabel: t("residencePlace"),
    sourceEditTextLabel: t("sourceEntry"), sourceEditCancel: t("cancel"), sourceEditSave: t("saveChanges"),
    searchFiltersLegend: t("filterResults"), filterHouseholdHeadLabel: t("householdHeadMatch"),
    filterFamilyMemberLabel: t("familyMember"), filterReferenceLabel: t("reference")
  };
  Object.entries(textById).forEach(([id, value]) => { const element = document.getElementById(id); if (element) element.textContent = value; });
  personSearch.placeholder = t("searchPlaceholder");
  document.querySelector("#district3d").setAttribute("aria-label", t("exploreDistrict"));
  document.querySelector(".layer-toggle").setAttribute("aria-label", t("landholdings"));
  document.querySelector("#stage").setAttribute("aria-label", language === "it" ? "Visualizzazione della prossimità tra le famiglie" : "Household proximity visualization");
  document.querySelector("#scene3d").setAttribute("aria-label", language === "it" ? "Ambiente 3D interattivo delle famiglie" : "Interactive 3D household environment");
  document.querySelector("#sceneInspector").setAttribute("aria-label", language === "it" ? "Dettagli della famiglia selezionata" : "Selected household details");
  document.querySelector("#closer3d").setAttribute("aria-label", t("zoomIn"));
  document.querySelector("#farther3d").setAttribute("aria-label", t("zoomOut"));
  document.querySelector("#focus3d").title = t("focus") + " (F)";
  document.querySelector("#fit3d").title = t("overview") + " (H)";
  document.querySelector("#plan3d").title = (language === "it" ? "Attiva la vista dall’alto" : "Toggle overhead view") + " (T)";
  document.querySelector("#navigationHelp").innerHTML = t("navigation");
  document.querySelector(".scene-key").innerHTML = '<i></i> ' + t("selected") + ' <i></i> ' + t("namedNeighbor");
  sourceEditStatus.textContent = t("editStoredLocally");
  panelDivider.setAttribute("aria-label", t("resizePanels"));
  panelDivider.title = t("resizePanelsHint");
  document.querySelector("#languageEnglish").setAttribute("aria-pressed", String(language === "en"));
  document.querySelector("#languageItalian").setAttribute("aria-pressed", String(language === "it"));
  document.querySelector("#languageEnglish").setAttribute("aria-label", language === "it" ? "Inglese" : "English");
  document.querySelector("#languageItalian").setAttribute("aria-label", "Italiano");
  document.querySelector(".language-switch").setAttribute("aria-label", language === "it" ? "Lingua" : "Language");
  setFilenameLabel(currentFileName);
  renderLayerToggle();
  renderList();
  if (view.selectedId) selectHousehold(view.selectedId);
  window.dispatchEvent(new CustomEvent("catasto:language-change", { detail: { language } }));
}

const view = {
  x: 500,
  y: 325,
  scale: 1,
  selectedId: null,
  // Who the Adjacent Evidence report is about: null for the selected unit's household head, or a
  // CatastoRelations subject ({ householdId, position } or { name, candidateIds }).
  subject: null,
  // The people visited by clicking names in the report, for its Back link. Kept for this session only.
  reportHistory: [],
  layer: "household",
  search: ""
};

let activeData = null;
let activeProject = null;

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitHonorificName(name) {
  const tokens = String(name || "").replace(/[.,]/g, "").trim().split(/\s+/).filter(Boolean);
  const honorifics = [];
  while (tokens.length) {
    const one = tokens[0];
    const two = tokens.slice(0, 2).join(" ");
    if (/^(Most Illustrious)$/i.test(two)) {
      honorifics.push(tokens.splice(0, 2).join(" "));
    } else if (/^(Illustrious|Illustrius|Magnificent|Reverend|Venerable|Nobleman|Noblewoman|Noble|Master|Mastro|Maestro|Donna|Dona|Don|D\.|Dr\.|Doctor|Priest|Father|Padre|Marchese|Marchesa|Magnific[oa]|Reverend[oa]|Signor[ae]?|Venerabile|Suor[ae]?|C(?:h)?ierico|Cherico)$/i.test(one)) {
      honorifics.push(tokens.shift());
    } else {
      break;
    }
  }
  return { honorifics, nameParts: tokens };
}

function firstAndSurname(name, householdSurname) {
  const { honorifics, nameParts } = splitHonorificName(name);
  if (!nameParts.length) return honorifics.join(" ");
  if (nameParts.length === 1 && householdSurname) {
    return [...honorifics, nameParts[0], householdSurname].join(" ");
  }
  if (nameParts.length > 2) {
    return [...honorifics, ...nameParts].join(" ");
  }
  const surname = surnamePhrase(nameParts);
  return [...honorifics, nameParts[0], surname].filter(Boolean).join(" ");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  })[char]);
}

function isPublicRoad(name) {
  return /public road|via pub+lica|strada/i.test(name);
}

function detectAssets(entry, hasResidence) {
  const text = entry.toLowerCase();
  const assets = [];
  if (hasResidence) assets.push({ type: "house" });
  if (/landholding|portion of land|property called|owns a portion|possesses a property|garden|vineyard|moggio|moggia|possessione|porzione|vigna|\borto\b/i.test(entry)) {
    assets.push({ type: "land" });
  }
  if (/chestnut|castagn|castaneto/i.test(entry)) {
    assets.push({ type: "trees" });
  }
  if (/industry|labor|sheep|flock|mare|mule|donkey|sows|livestock|taxable heads|industria|bracciale|pecor|giumenta|somaro|buoi|\bmul[oie]\b|porc[ie]|capre|teste/i.test(text)) {
    assets.push({ type: "work" });
  }
  return assets.slice(0, 4);
}

function memberLines(record) {
  const lines = String(record.members_text || "")
    .split("\n")
    .map(line => line.trim())
    .filter(Boolean);
  return window.CatastoParser.inferFamilyRelationships(lines).members;
}

function parseMemberLine(line, householdSurname, index) {
  if (window.CatastoParser.isItalianMemberLine(line)) {
    const member = window.CatastoParser.splitItalianMemberLine(line);
    const relation = member.relation || (index === 0 ? "head" : "member");
    return `${firstAndSurname(member.name, householdSurname)}, ${relation} (${member.age || "?"})`;
  }
  const cleaned = line
    .replace(/\[[^\]]+\]/g, "")
    .replace(/[.;]\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const ageMatch = cleaned.match(/\baged?\s+(\d+)\b|\bage\s+(\d+)\b/i);
  const age = ageMatch ? (ageMatch[1] || ageMatch[2]) : "?";
  const beforeAge = ageMatch ? cleaned.slice(0, ageMatch.index).replace(/[,—-]\s*$/g, "").trim() : cleaned;
  const chunks = beforeAge.split(",").map(part => part.trim()).filter(Boolean);
  const rawName = chunks[0] || cleaned;
  let relation = chunks.find(part => /\b(wife|husband|son|daughter|brother|sister|niece|nephew|mother|father|law|servant|maidservant|farmhand|worker|laborer|widow|head)\b/i.test(part)) || "";
  relation = relation
    .replace(/\b(his|her|and|first-born child)\b/gi, "")
    .replace(/\ba\s+/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!relation && index === 0) relation = "head";
  if (!relation) relation = "member";
  return `${firstAndSurname(rawName, householdSurname)}, ${relation} (${age})`;
}

function householdMemberIdentities(record, surname) {
  const lines = memberLines(record);
  const displays = lines.map((line, index) => parseMemberLine(line, surname, index));
  return lines.map((line, index) => {
    const rawName = window.CatastoParser.isItalianMemberLine(line)
      ? window.CatastoParser.splitItalianMemberLine(line).name
      : line.replace(/\[[^\]]+\]/g, "").split(",")[0].trim();
    return {
      id: index === 0 ? record.id : `${record.id}-member-${String(index).padStart(2, "0")}`,
      householdId: record.id,
      identityType: index === 0 ? "household-head" : "household-member",
      position: index,
      name: firstAndSurname(rawName, surname),
      display: displays[index],
      sourceLine: line
    };
  });
}

function headIdentityEvidence(record) {
  const headLine = memberLines(record)[0] || record.members_text?.split("\n")[0] || record.household_head || "";
  const italian = window.CatastoParser.isItalianMemberLine(headLine);
  const patronymic = italian
    ? window.CatastoParser.splitItalianMemberLine(headLine).patronymic
    : headLine.match(/\b(?:son|daughter)\s+of\s+(?:the\s+late\s+)?([^,—;]+?)(?=,|—|;|\bage(?:d)?\b|$)/i)?.[0]?.trim() || "";
  const age = headLine.match(/\b(?:age|aged|anni)\s+(\d+)\b/i)?.[1] || "";
  const spouseLine = memberLines(record).slice(1).find(line => /\b(?:wife|husband|moglie|marito)\b/i.test(line));
  const spouse = spouseLine ? window.CatastoParser.memberPersonName(spouseLine) : "";
  return { patronymic, age, spouse };
}

function householdIdentityLabels(records) {
  const byName = recordsByPersonName(records);
  const labels = new Map();
  records.forEach((record, index) => {
    const peers = byName.get(personKey(record.household_head)) || [record];
    if (peers.length === 1) {
      labels.set(record.id, record.household_head);
      return;
    }
    const evidence = headIdentityEvidence(record);
    const peerEvidence = peers.map(headIdentityEvidence);
    const patronymicUnique = evidence.patronymic && peerEvidence.filter(item => searchKey(item.patronymic) === searchKey(evidence.patronymic)).length === 1;
    const ageUnique = evidence.age && peerEvidence.filter(item => item.age === evidence.age).length === 1;
    const spouseUnique = evidence.spouse && peerEvidence.filter(item => personKey(item.spouse) === personKey(evidence.spouse)).length === 1;
    const qualifier = patronymicUnique ? evidence.patronymic : ageUnique ? `age ${evidence.age}` : spouseUnique ? `spouse ${evidence.spouse}` : `household ${record.projectRecordIndex ?? index + 1}`;
    labels.set(record.id, `${record.household_head} — ${qualifier}`);
  });
  return labels;
}

function isLandholdingSentence(sentence) {
  return /\b(possesses|owns|also owns|landholding|property called|garden|vineyard|chestnut grove|grove|portion of land)\b/i.test(sentence) &&
    /\b(landholding|portion of land|property called|garden|vineyard|chestnut grove|grove|land|property)\b/i.test(sentence) &&
    /\bbordering\b/i.test(sentence);
}

function landholdingName(sentence, index) {
  const quoted = sentence.match(/"([^"]+)"/);
  if (quoted) return quoted[1];
  const called = sentence.match(/\bcalled\s+([^,;]+?)(?=,?\s+(?:with|of)\s+(?:(?:a|the)\s+)?capacity|,|;|\s+bordering|\.)/i);
  if (called) return normalizeName(called[1]);
  const located = sentence.match(/\bin\s+(?:the\s+)?(?:district\s+of\s+)?([^,;]+?)(?=,?\s+(?:with|of)\s+(?:(?:a|the)\s+)?capacity|,|;|\s+bordering|\.)/i);
  if (located) return normalizeName(located[1]);
  const slopes = sentence.match(/\bon\s+(?:the\s+)?slopes?\s+of\s+([^,;]+?)(?=,?\s+(?:with|of)\s+(?:(?:a|the)\s+)?capacity|,|;|\s+bordering|\.)/i);
  if (slopes) return normalizeName(slopes[1]);
  return `Landholding ${index + 1}`;
}

function landholdingPlace(sentence, name, previousPlace = null) {
  if (/\b(?:same|said|aforementioned) place\b/i.test(sentence) && previousPlace) return previousPlace;
  if (!/^Landholding\s+\d+$/i.test(name)) return canonicalPlace(name);
  const locationClause = sentence.split(/\bbordering\b/i)[0];
  const explicit =
    locationClause.match(/\bin\s+(?:the\s+)?(?:place|district|neighborhood|contrada)\s+(?:called\s+|of\s+)?([^,;]+?)(?=,?\s+(?:with|of)\s+(?:(?:a|the)\s+)?capacity|,|;|$)/i) ||
    locationClause.match(/\bin\s+(?:the\s+)?([^,;]+?)(?=,?\s+(?:with|of)\s+(?:(?:a|the)\s+)?capacity|,|;|$)/i) ||
    locationClause.match(/\bon\s+(?:the\s+)?slopes?\s+of\s+([^,;]+?)(?=,?\s+(?:with|of)\s+(?:(?:a|the)\s+)?capacity|,|;|$)/i);
  return canonicalPlace(explicit?.[1] || "District not listed");
}

function landholdingType(sentence) {
  if (/chestnut grove|castagneto|castaneto/i.test(sentence)) return "chestnut grove";
  if (/vineyard|vigna/i.test(sentence)) return "vineyard";
  if (/garden|orto/i.test(sentence)) return "garden";
  if (/grove/i.test(sentence)) return "grove";
  return "property";
}

function landholdingCapacity(sentence) {
  const match = sentence.match(/\b(?:capacity of|measuring)\s+([^,;]+?)(?=\s+bordering|,|;|\.|$)/i);
  return match ? match[1].trim() : "Capacity not listed";
}

function landholdingIncome(sentence) {
  const match = sentence.match(/\b(?:annual\s+)?income\s+(?:is\s+|amounts?\s+to\s+|from\s+which\s+is\s+)?([^.;]+(?:[.;]|$))/i);
  return match ? match[0].replace(/[.;]\s*$/, "").trim() : "Income not listed";
}

// Italian clauses keep their source terms for type, capacity, and income.
function italianLandholding(record, sentence, index, previousPlace) {
  const holding = window.CatastoParser.parseItalianLandholding(sentence);
  const name = holding.name || holding.place || `Landholding ${index + 1}`;
  const placeInfo = holding.name || holding.place
    ? canonicalPlace(holding.place || holding.name)
    : /\b(?:stesso|medesimo|dett[oa]|ind['’]o)\s+luogo\b/i.test(sentence) && previousPlace ? previousPlace : canonicalPlace("District not listed");
  return {
    id: `${record.id}-land-${index + 1}`,
    owner: record.household_head,
    name,
    place: placeInfo.label,
    placeKey: placeInfo.key,
    type: holding.type,
    capacity: holding.capacity || "Capacity not listed",
    income: holding.income || "Income not listed",
    source_entry: sentence,
    adjacent_to: holding.adjacent_to,
    boundary_features: holding.adjacent_to.filter(isPublicAnchor),
    hasPublicRoad: holding.adjacent_to.some(isPublicRoad)
  };
}

function parseLandholdings(record) {
  let previousPlace = null;
  // Italian clauses often end with a dash rather than a period; a line opening a new clause starts a new sentence.
  const entry = record.source_entry.replace(/[ \t]*\n(?=[ \t]*(?:Più\s+)?(?:Possiede|Paga|Abita|Habita|Riporto|Pesi|Un['’]altr[ao]|Un|Una|Altr[ao])\b)/g, "\n\n");
  return sentenceList(entry)
    .filter(sentence => isLandholdingSentence(sentence) || window.CatastoParser.isItalianLandholdingSentence(sentence))
    .map((sentence, index) => {
      if (window.CatastoParser.isItalianLandholdingSentence(sentence)) {
        const holding = italianLandholding(record, sentence, index, previousPlace);
        previousPlace = { key: holding.placeKey, label: holding.place };
        return holding;
      }
      const borderMatch = sentence.match(/\bbordering\s+(?:the )?(?:property|properties)?\s*(?:of)?\s*([\s\S]*?)(?:;|\.|$)/i);
      const rawAdjacentNames = borderMatch ? expandNeighborNames(borderMatch[1]) : [];
      const name = landholdingName(sentence, index);
      const placeInfo = landholdingPlace(sentence, name, previousPlace);
      previousPlace = placeInfo;
      return {
        id: `${record.id}-land-${index + 1}`,
        owner: record.household_head,
        name,
        place: placeInfo.label,
        placeKey: placeInfo.key,
        type: landholdingType(sentence),
        capacity: landholdingCapacity(sentence),
        income: landholdingIncome(sentence),
        source_entry: sentence,
        adjacent_to: rawAdjacentNames,
        boundary_features: rawAdjacentNames.filter(isPublicAnchor),
        hasPublicRoad: rawAdjacentNames.some(isPublicRoad)
      };
    });
}

function householdRole(record) {
  const headLine = memberLines(record)[0];
  if (headLine && window.CatastoParser.isItalianMemberLine(headLine)) {
    const member = window.CatastoParser.splitItalianMemberLine(headLine);
    return [member.rest, member.age ? `anni ${member.age}` : ""].filter(Boolean).join(", ") || "household";
  }
  return headLine?.replace(record.household_head, "").replace(/^,\s*/, "") || "household";
}

function createHouseholdFromRecord(record, x, y, displayHead = record.household_head) {
  const rawAdjacentNames = record.residence?.adjacent_to || [];
  const adjacentNames = rawAdjacentNames.filter(name => !isPublicAnchor(name));
  const placeInfo = canonicalPlace(record.residence?.place || "No residence listed");
  const surname = surnameFromName(record.household_head);
  const memberIdentities = householdMemberIdentities(record, surname);
  return {
    id: record.id,
    householdId: record.id,
    identityType: "household-head",
    source: "extracted",
    head: record.household_head,
    displayHead,
    identityEvidence: headIdentityEvidence(record),
    surname,
    role: householdRole(record),
    place: placeInfo.label,
    placeKey: placeInfo.key,
    x,
    y,
    members: memberIdentities.map(member => member.display),
    memberIdentities,
    assets: detectAssets(record.source_entry, Boolean(record.residence?.description)),
    signal: adjacentNames.length ? `${adjacentNames.length} residence neighbor${adjacentNames.length === 1 ? "" : "s"} from source` : "No residence adjacency listed",
    sourceEntry: record.source_entry,
    recordIndex: record.projectRecordIndex,
    neighbors: [],
    sourcePages: record.source_pages,
    sourcePagesInferred: Boolean(record.source_pages_inferred),
    adjacentNames,
    hasPublicRoad: rawAdjacentNames.some(isPublicRoad)
  };
}

function recordsByPersonName(records) {
  const byName = new Map();
  records.forEach(record => {
    const key = personKey(record.household_head);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(record);
  });
  return byName;
}

function bestMatchingRecord(records, sourceRecord) {
  if (!records?.length) return null;
  if (records.length === 1) return records[0];
  if (!sourceRecord) return null;
  const storedLink = (sourceRecord.residence_links || []).find(link =>
    link.household_id && records.some(record => record.id === link.household_id) &&
    personKey(link.name) === personKey(records[0].household_head)
  );
  if (storedLink) return records.find(record => record.id === storedLink.household_id) || null;
  const sourceName = personKey(sourceRecord.household_head);
  const reciprocal = records.filter(record =>
    (record.residence?.adjacent_to || []).some(name => personKey(name) === sourceName)
  );
  if (reciprocal.length === 1) return reciprocal[0];
  const sourcePlace = canonicalPlace(sourceRecord.residence?.place || "No residence listed").key;
  const samePlace = records.filter(record => canonicalPlace(record.residence?.place || "No residence listed").key === sourcePlace);
  return samePlace.length === 1 ? samePlace[0] : null;
}

function buildHouseholds(data) {
  const records = data.households;
  const actualByName = recordsByPersonName(records);
  const identityLabels = householdIdentityLabels(records);
  const all = records.map(record => createHouseholdFromRecord(record, 0, 0, identityLabels.get(record.id)));
  const byId = new Map(all.map(household => [household.id, household]));

  const ensurePlaceholder = (name, sourceHousehold) => {
    const candidates = actualByName.get(personKey(name)) || [];
    const actualRecord = bestMatchingRecord(candidates, records.find(record => record.id === sourceHousehold.id));
    if (actualRecord) return actualRecord.id;

    const ambiguous = candidates.length > 1;
    const id = ambiguous ? `adjacent-ambiguous-${slugify(name)}-${slugify(sourceHousehold.id)}` : `adjacent-${slugify(name)}`;
    if (byId.has(id)) return id;

    const placeholder = {
      id,
      householdId: null,
      identityType: ambiguous ? "ambiguous-household-reference" : "unresolved-household-reference",
      resolutionStatus: ambiguous ? "ambiguous" : "unresolved",
      candidateHouseholdIds: candidates.map(record => record.id),
      source: "adjacent-placeholder",
      head: name,
      displayHead: ambiguous ? `${name} — unresolved identity` : name,
      surname: surnameFromName(name),
      role: "adjacent property owner",
      place: sourceHousehold.place,
      x: 0,
      y: 0,
      members: [name],
      assets: [{ type: "house" }],
      signal: `Named residence neighbor of ${sourceHousehold.head}`,
      sourceEntry: ambiguous
        ? `${name} is named as an adjacent residence/property owner in ${sourceHousehold.head}'s extracted tax entry. Multiple household heads have this name, and the source does not identify which one is intended.`
        : `${name} is named as an adjacent residence/property owner in ${sourceHousehold.head}'s extracted tax entry. A matching household entry was not found.`,
      neighbors: [sourceHousehold.id],
      sourcePages: sourceHousehold.sourcePages,
      sourcePagesInferred: sourceHousehold.sourcePagesInferred,
      adjacentNames: [],
      hasPublicRoad: false
    };
    all.push(placeholder);
    byId.set(id, placeholder);
    return id;
  };

  [...all].filter(household => household.source === "extracted").forEach(household => {
    household.adjacentNames.forEach(name => {
      const neighborId = ensurePlaceholder(name, household);
      if (neighborId !== household.id && !household.neighbors.includes(neighborId)) {
        household.neighbors.push(neighborId);
      }
      const neighbor = byId.get(neighborId);
      if (neighbor && !neighbor.neighbors.includes(household.id)) {
        neighbor.neighbors.push(household.id);
      }
    });
  });

  return all;
}

function createLandParcelUnit(record, holding, holdingIndex, holdingCount, displayHead = record.household_head) {
  const rawAdjacentNames = holding.adjacent_to;
  const adjacentNames = [...new Set(rawAdjacentNames.filter(name => !isPublicAnchor(name)))];
  return {
    id: holding.id,
    householdId: record.id,
    identityType: "household-head-landholding",
    source: "extracted",
    head: record.household_head,
    displayHead,
    ownerName: record.household_head,
    ownerKey: record.id,
    surname: surnameFromName(record.household_head),
    role: holding.type,
    parcelName: holding.name,
    parcelIndex: holdingIndex,
    parcelCount: holdingCount,
    place: holding.place,
    placeKey: holding.placeKey,
    capacity: holding.capacity,
    income: holding.income,
    boundaryFeatures: holding.boundary_features,
    x: 0,
    y: 0,
    members: [record.household_head, holding.name, holding.capacity],
    assets: [{ type: "land" }, ...(/grove|castagn|oliv|bosco|selva/i.test(holding.type) ? [{ type: "trees" }] : [])],
    signal: adjacentNames.length ? `${adjacentNames.length} land neighbor${adjacentNames.length === 1 ? "" : "s"} from source` : "No land adjacency listed",
    sourceEntry: holding.source_entry,
    recordIndex: record.projectRecordIndex,
    neighbors: [],
    neighborEvidence: {},
    sourcePages: record.source_pages || [],
    sourcePagesInferred: Boolean(record.source_pages_inferred),
    adjacentNames,
    hasPublicRoad: rawAdjacentNames.some(isPublicRoad)
  };
}

function buildLandholdings(data) {
  const identityLabels = householdIdentityLabels(data.households);
  const ownerRecords = data.households
    .map(record => ({ record, holdings: parseLandholdings(record) }))
    .filter(item => item.holdings.length);
  const all = ownerRecords.flatMap(({ record, holdings }) =>
    holdings.map((holding, index) => createLandParcelUnit(record, holding, index, holdings.length, identityLabels.get(record.id)))
  );
  const byId = new Map(all.map(unit => [unit.id, unit]));
  const parcelsByOwner = new Map();
  all.forEach(unit => {
    if (!parcelsByOwner.has(unit.ownerKey)) parcelsByOwner.set(unit.ownerKey, []);
    parcelsByOwner.get(unit.ownerKey).push(unit);
  });
  const ownersByName = new Map();
  ownerRecords.forEach(owner => {
    const key = personKey(owner.record.household_head);
    if (!ownersByName.has(key)) ownersByName.set(key, []);
    ownersByName.get(key).push(owner);
  });

  const ensurePlaceholder = (name, sourceUnit) => {
    const candidateOwners = ownersByName.get(personKey(name)) || [];
    const reciprocalOwners = candidateOwners.filter(owner =>
      (parcelsByOwner.get(owner.record.id) || []).some(parcel =>
        parcel.placeKey === sourceUnit.placeKey &&
        parcel.adjacentNames.some(adjacent => personKey(adjacent) === personKey(sourceUnit.head))
      )
    );
    const sameDistrictOwners = candidateOwners.filter(owner =>
      (parcelsByOwner.get(owner.record.id) || []).some(parcel => parcel.placeKey === sourceUnit.placeKey)
    );
    const resolvedOwner = reciprocalOwners.length === 1
      ? reciprocalOwners[0]
      : candidateOwners.length === 1
        ? candidateOwners[0]
        : sameDistrictOwners.length === 1
          ? sameDistrictOwners[0]
          : null;
    const ownerParcels = resolvedOwner ? parcelsByOwner.get(resolvedOwner.record.id) || [] : [];
    const sameDistrict = ownerParcels.filter(parcel => parcel.placeKey === sourceUnit.placeKey);
    const reciprocal = sameDistrict.filter(parcel =>
      parcel.adjacentNames.some(adjacent => personKey(adjacent) === personKey(sourceUnit.head))
    );
    if (reciprocal.length === 1) return reciprocal[0].id;
    if (!reciprocal.length && sameDistrict.length === 1) return sameDistrict[0].id;

    const ambiguousOwner = candidateOwners.length > 1 && !resolvedOwner;
    const id = resolvedOwner
      ? `land-unassigned-${slugify(resolvedOwner.record.id)}-${slugify(sourceUnit.placeKey)}`
      : `land-adjacent-${ambiguousOwner ? "ambiguous-" : ""}${slugify(name)}-${slugify(sourceUnit.id)}`;
    if (byId.has(id)) return id;

    const placeholder = {
      id,
      householdId: resolvedOwner?.record.id || null,
      identityType: ambiguousOwner ? "ambiguous-landowner-reference" : "unresolved-landholding-reference",
      resolutionStatus: ambiguousOwner ? "ambiguous" : "unresolved",
      candidateHouseholdIds: candidateOwners.map(owner => owner.record.id),
      source: "adjacent-placeholder",
      head: name,
      displayHead: resolvedOwner ? identityLabels.get(resolvedOwner.record.id) : ambiguousOwner ? `${name} — unresolved identity` : name,
      surname: surnameFromName(name),
      role: "adjacent landowner",
      parcelName: "Adjacent property",
      ownerName: name,
      ownerKey: resolvedOwner?.record.id || `unresolved:${personKey(name)}:${sourceUnit.id}`,
      place: sourceUnit.place,
      placeKey: sourceUnit.placeKey,
      capacity: "Capacity not listed",
      income: "Income not listed",
      boundaryFeatures: [],
      x: 0,
      y: 0,
      members: [name],
      assets: [{ type: "land" }],
      signal: `Named land neighbor of ${sourceUnit.head}`,
      sourceEntry: ambiguousOwner
        ? `${name} is named as an adjacent landowner in ${sourceUnit.head}'s extracted landholding entry. Multiple household heads have this name, and the source does not identify which one is intended.`
        : resolvedOwner
          ? `${name} is named as an adjacent landowner in ${sourceUnit.head}'s extracted landholding entry, but the reference cannot be assigned to a specific parcel.`
          : `${name} is named as an adjacent landowner in ${sourceUnit.head}'s extracted landholding entry. A matching household head with landholdings was not found.`,
      neighbors: [sourceUnit.id],
      neighborEvidence: { [sourceUnit.id]: { inbound: true, outbound: false } },
      sourcePages: [],
      adjacentNames: [],
      hasPublicRoad: false
    };
    all.push(placeholder);
    byId.set(id, placeholder);
    return id;
  };

  [...all].filter(unit => unit.source === "extracted").forEach(unit => {
    unit.adjacentNames.forEach(name => {
      const neighborId = ensurePlaceholder(name, unit);
      if (neighborId !== unit.id && !unit.neighbors.includes(neighborId)) {
        unit.neighbors.push(neighborId);
      }
      unit.neighborEvidence[neighborId] = {
        ...(unit.neighborEvidence[neighborId] || {}),
        outbound: true
      };
      const neighbor = byId.get(neighborId);
      if (neighbor && !neighbor.neighbors.includes(unit.id)) {
        neighbor.neighbors.push(unit.id);
      }
      if (neighbor) {
        neighbor.neighborEvidence = neighbor.neighborEvidence || {};
        neighbor.neighborEvidence[unit.id] = {
          ...(neighbor.neighborEvidence[unit.id] || {}),
          inbound: true
        };
      }
    });
  });

  return all;
}

function buildUnits(data) {
  return view.layer === "land" ? buildLandholdings(data) : buildHouseholds(data);
}

function matchingUnitIdForPerson(person) {
  if (!person) return null;
  const householdId = typeof person === "object" ? person.householdId : null;
  const personName = typeof person === "object" ? person.name : person;
  const recordIndex = typeof person === "object" ? person.recordIndex : null;
  if (Number.isInteger(recordIndex)) {
    const recordMatch = households.find(household =>
      household.source === "extracted" && household.recordIndex === recordIndex
    );
    if (recordMatch) return recordMatch.id;
  }
  if (householdId) {
    const identityMatch = households.find(household =>
      household.source === "extracted" && household.householdId === householdId
    );
    if (identityMatch) return identityMatch.id;
  }
  if (typeof personName !== "string") return null;
  const matches = households.filter(household =>
    household.source === "extracted" &&
    household.head.toLowerCase() === personName.toLowerCase()
  );
  return matches.length === 1 ? matches[0].id : null;
}

function surnameSortKey(household) {
  const surname = stripNamePrefixes(household.head || "")
    .replace(/[.,]/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(-1)[0] || "";
  return `${surname.toLowerCase()} ${String(household.head || "").toLowerCase()}`;
}

function searchKey(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function sourceMatchContext(sourceEntry, query) {
  const source = String(sourceEntry || "");
  const exactIndex = source.toLowerCase().indexOf(String(query || "").toLowerCase());
  const start = exactIndex >= 0 ? Math.max(0, source.lastIndexOf("\n", exactIndex) + 1) : 0;
  const endLine = exactIndex >= 0 ? source.indexOf("\n", exactIndex) : -1;
  const end = endLine >= 0 ? endLine : source.length;
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function sourceMatchDetail(context, query) {
  const line = String(context || "");
  if (line.length <= 180) return line;
  const matchIndex = searchKey(line).indexOf(searchKey(query));
  const start = matchIndex > 60 ? matchIndex - 60 : 0;
  const excerpt = line.slice(start, start + 174);
  return `${start ? "…" : ""}${excerpt}${start + excerpt.length < line.length ? "…" : ""}`;
}

function sourceReferenceType(context) {
  if (/\b(?:bordering|adjacent|neighbor|property of|giusta|confin\w*|contigu\w*)\b/i.test(context)) return view.layer === "land" ? "landReferenceMatch" : "residenceReferenceMatch";
  if (/\b(?:pays? to|collects? from|receives? from|creditor|debtor|principal|interest|rent|paga|capitale|affitto|esige)\b/i.test(context)) return "financialReferenceMatch";
  return "sourceReferenceMatch";
}

function sourceReferenceName(context, query) {
  const source = String(context || "");
  const needle = searchKey(query);
  if (!needle) return String(query || "").trim();

  const knownNames = new Set();
  households.forEach(record => {
    if (record.head) knownNames.add(record.head.trim());
    (record.members || []).forEach(member => {
      const name = String(member).split(",")[0].trim();
      if (name) knownNames.add(name);
    });
    (record.adjacentNames || []).forEach(name => {
      if (name) knownNames.add(String(name).trim());
    });
  });

  const sourceKey = searchKey(source);
  const knownMatch = [...knownNames]
    .filter(name => {
      const key = searchKey(name);
      return key.includes(needle) && sourceKey.includes(key) && key.split(" ").length > 1;
    })
    .sort((a, b) => b.length - a.length)[0];
  if (knownMatch) {
    const pattern = knownMatch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
    return source.match(new RegExp(pattern, "i"))?.[0] || knownMatch;
  }

  const words = [...source.matchAll(/\p{L}[\p{L}’'’-]*/gu)];
  let first = -1;
  let last = -1;
  const rawQuery = String(query || "").trim();
  if (rawQuery) {
    const pattern = rawQuery
      .split(/\s+/)
      .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("\\s+");
    const directMatch = source.match(new RegExp(pattern, "i"));
    if (directMatch?.index !== undefined) {
      const start = directMatch.index;
      const end = start + directMatch[0].length;
      first = words.findIndex(word => word.index + word[0].length > start);
      last = words.findLastIndex(word => word.index < end);
    }
  }
  if (first < 0 || last < first) {
    outer: for (let start = 0; start < words.length; start++) {
      for (let end = start; end < Math.min(words.length, start + 6); end++) {
        const phrase = source.slice(words[start].index, words[end].index + words[end][0].length);
        if (searchKey(phrase) !== needle) continue;
        first = start;
        last = end;
        break outer;
      }
    }
  }
  if (first < 0 || last < first) return rawQuery;

  const isNameWord = word => /^[A-ZÀ-ÖØ-Þ]/.test(word) || /^(?:da|de|del|della|di)$/i.test(word);
  const matchedFirst = first;
  const matchedLast = last;
  while (first > 0 && matchedFirst - first < 3) {
    const previous = words[first - 1];
    const separator = source.slice(previous.index + previous[0].length, words[first].index);
    if (!/^\s+$/.test(separator) || !isNameWord(previous[0])) break;
    first -= 1;
  }
  while (last < words.length - 1 && last - matchedLast < 5) {
    const next = words[last + 1];
    const separator = source.slice(words[last].index + words[last][0].length, next.index);
    if (!/^\s+$/.test(separator) || !isNameWord(next[0])) break;
    last += 1;
  }
  return source.slice(words[first].index, words[last].index + words[last][0].length);
}

// A person named in another entry: their own household when that entry's stored link identifies it,
// otherwise the name alone.
function referenceSubject(unit, name) {
  const record = activeData?.households.find(item => item.id === unit.householdId);
  const link = (record?.residence_links || []).find(item => personKey(item.name) === personKey(name));
  if (link?.household_id && ["resolved", "inferred"].includes(link.resolution_status)) return { householdId: link.household_id, position: 0 };
  return { name, candidateIds: link?.candidate_household_ids?.length ? link.candidate_household_ids : undefined };
}

function householdSearchMatches(household, query) {
  const needle = searchKey(query);
  if (!needle) return [];
  const matches = [];
  if (searchKey(household.head).includes(needle)) {
    matches.push({ primary: household.head, detail: household.role || "household", type: "householdHeadMatch", category: "head", highlight: household.head });
  }
  (household.members || []).slice(1).forEach((member, index) => {
    if (!searchKey(member).includes(needle)) return;
    const [name, ...details] = member.split(",");
    const identity = household.memberIdentities?.[index + 1];
    // The member's whole source line marks the right person when two members share a first name.
    const sourceLine = identity?.sourceLine && household.sourceEntry.includes(identity.sourceLine) ? identity.sourceLine : "";
    matches.push({
      primary: name.trim(), personId: identity?.id || null, detail: `${details.join(",").trim()} · ${household.displayHead || household.head} household`,
      type: "householdMemberMatch", category: "member", highlight: sourceLine || name.trim().split(/\s+/)[0],
      subject: household.householdId ? { householdId: household.householdId, position: index + 1 } : null
    });
  });
  (household.adjacentNames || []).forEach(name => {
    if (!searchKey(name).includes(needle)) return;
    matches.push({ primary: name, detail: `Mentioned in ${household.head}'s entry`, type: view.layer === "land" ? "landReferenceMatch" : "residenceReferenceMatch", category: "reference", highlight: name, subject: referenceSubject(household, name) });
  });
  if (!matches.length && searchKey(household.sourceEntry).includes(needle)) {
    const context = sourceMatchContext(household.sourceEntry, query);
    const referenceName = sourceReferenceName(context, query);
    matches.push({ primary: referenceName, detail: sourceMatchDetail(context, query) || `Mentioned in ${household.head}'s entry`, type: sourceReferenceType(context), category: "reference", highlight: referenceName, subject: referenceSubject(household, referenceName) });
  }
  return matches;
}

function filteredHouseholdList() {
  const query = view.search.trim();
  const extracted = households.filter(household => household.source === "extracted");
  if (view.layer === "land") {
    const byOwner = new Map();
    extracted.forEach(parcel => {
      if (!byOwner.has(parcel.ownerKey)) byOwner.set(parcel.ownerKey, []);
      byOwner.get(parcel.ownerKey).push(parcel);
    });
    const ownerResults = [...byOwner.values()].map(parcels => {
      const representative = parcels.find(parcel => parcel.id === view.selectedId) || parcels[0];
      const districts = new Set(parcels.map(parcel => parcel.placeKey));
      return {
        household: representative,
        match: null,
        summary: `${parcels.length} landholding${parcels.length === 1 ? "" : "s"} · ${districts.size} district${districts.size === 1 ? "" : "s"}`
      };
    });
    if (!query) {
      return ownerResults.sort((a, b) => surnameSortKey(a.household).localeCompare(surnameSortKey(b.household), undefined, { sensitivity: "base" }));
    }
    const needle = searchKey(query);
    const matchingOwners = ownerResults.filter(result => searchKey(result.household.head).includes(needle));
    if (matchingOwners.length) {
      return matchingOwners.sort((a, b) => surnameSortKey(a.household).localeCompare(surnameSortKey(b.household), undefined, { sensitivity: "base" }));
    }
    return extracted.flatMap(parcel => householdSearchMatches(parcel, query)
      .filter(match => searchFilterInputs[match.category]?.checked !== false)
      .map(match => ({ household: parcel, match, summary: `${parcel.parcelName} · ${parcel.place}` })))
      .sort((a, b) => a.match.primary.localeCompare(b.match.primary, undefined, { sensitivity: "base" }));
  }
  if (!query) {
    return extracted
      .sort((a, b) => surnameSortKey(a).localeCompare(surnameSortKey(b), undefined, { sensitivity: "base" }))
      .map(household => ({ household, match: null }));
  }
  return extracted.flatMap(household => householdSearchMatches(household, query)
    .filter(match => searchFilterInputs[match.category]?.checked !== false)
    .map(match => ({ household, match })))
    .sort((a, b) => a.match.primary.localeCompare(b.match.primary, undefined, { sensitivity: "base" }) || surnameSortKey(a.household).localeCompare(surnameSortKey(b.household)));
}

function renderList() {
  const results = filteredHouseholdList();
  if (!results.length) {
    list.innerHTML = `<p class="list-empty">${view.search ? t("noMatch") : t("noHouseholds")}</p>`;
    return;
  }

  const selectedOwnerKey = view.layer === "land" ? householdById.get(view.selectedId)?.ownerKey : null;
  list.innerHTML = results.map(({ household, match, summary }, index) => `
    <button class="household-button ${household.id === view.selectedId || (view.layer === "land" && household.ownerKey === selectedOwnerKey) ? "active" : ""}" data-id="${escapeHtml(household.id)}" data-result-index="${index}">
      <span class="household-name">${escapeHtml(localizedRole(match?.primary || household.displayHead || household.head))}</span>
      <span class="household-meta">${escapeHtml(localizedRole(match?.detail || summary || household.role || "household"))}${match || summary ? "" : `<br>${escapeHtml(localizedPlace(household.place))}`}</span>
      ${match ? `<span class="search-result-type">${escapeHtml(t(match.type))}</span>` : ""}
    </button>
  `).join("");

  list.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      const result = results[Number(button.dataset.resultIndex)];
      view.reportHistory = [];
      selectHousehold(button.dataset.id, result?.match?.highlight || "", result?.match?.subject || null);
    });
  });
}

function renderLayerToggle() {
  document.querySelectorAll(".layer-toggle button").forEach(button => {
    button.classList.toggle("active", button.dataset.layer === view.layer);
    button.textContent = button.dataset.layer === "land" ? t("landholdings") : t("households");
  });
  document.querySelector("#sidebarTitle").textContent = view.layer === "land" ? t("landowners") : t("households");
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameTarget(target, subject) {
  if (!target || !subject) return false;
  if (target.householdId) return target.householdId === subject.householdId && (target.position || 0) === (subject.position || 0);
  return !subject.householdId && personKey(target.name) === personKey(subject.name);
}

// Where each linked name appears in the source text. A household member is looked for only in their own
// line; a neighbor wherever the entry names them. Overlapping matches keep the earlier, longer one.
function sourceLinkRanges(raw, links, current) {
  const ranges = [];
  links.forEach(link => {
    if (!link.label || sameTarget(link.target, current)) return;
    const words = String(link.label).trim().split(/\s+/).map(escapeRegExp).join("\\s+");
    const pattern = new RegExp(`(?<![\\p{L}\\p{M}])${words}(?![\\p{L}\\p{M}])`, "giu");
    let from = 0;
    let to = raw.length;
    if (link.line) {
      from = raw.indexOf(link.line);
      if (from < 0) return;
      to = from + link.line.length;
    }
    const scope = raw.slice(from, to);
    for (const match of scope.matchAll(pattern)) {
      ranges.push({ start: from + match.index, end: from + match.index + match[0].length, target: link.target });
      if (link.line) break;
    }
  });
  ranges.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept = [];
  ranges.forEach(range => {
    if (!kept.length || range.start >= kept[kept.length - 1].end) kept.push(range);
  });
  return kept;
}

function linkedSourceNodes(raw, from, to, ranges) {
  const nodes = [];
  let cursor = from;
  ranges.filter(range => range.start >= from && range.end <= to).forEach(range => {
    if (range.start > cursor) nodes.push(document.createTextNode(raw.slice(cursor, range.start)));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "report-link source-link";
    button.textContent = raw.slice(range.start, range.end);
    button.title = t("openPerson")(button.textContent);
    button.addEventListener("click", () => followReportLink(range.target));
    nodes.push(button);
    cursor = range.end;
  });
  if (cursor < to) nodes.push(document.createTextNode(raw.slice(cursor, to)));
  return nodes;
}

// links: people the entry names (CatastoRelations.sourceEntryLinks); each becomes a button that shows
// that person, as names in the report do. current: the person already shown, left unlinked.
function showSourceEntry(text, highlight = "", links = [], current = null) {
  const source = document.querySelector("#sourceEntry");
  const raw = String(text || "");
  const requested = String(highlight || "").trim();
  let index = requested ? raw.toLowerCase().indexOf(requested.toLowerCase()) : -1;
  let matchedText = requested;
  if (index < 0 && requested.includes(" ")) {
    matchedText = requested.split(/\s+/)[0];
    index = raw.toLowerCase().indexOf(matchedText.toLowerCase());
  }
  const hasMark = index >= 0 && Boolean(matchedText);
  const markStart = hasMark ? index : raw.length;
  const markEnd = hasMark ? index + matchedText.length : raw.length;
  // A link that straddles the highlight's edge would be cut in two, so it is left as text.
  const ranges = sourceLinkRanges(raw, links, current)
    .filter(range => range.end <= markStart || range.start >= markEnd || (range.start >= markStart && range.end <= markEnd));
  if (!hasMark) {
    source.replaceChildren(...linkedSourceNodes(raw, 0, raw.length, ranges));
    return;
  }
  const mark = document.createElement("mark");
  mark.className = "source-highlight";
  mark.replaceChildren(...linkedSourceNodes(raw, markStart, markEnd, ranges));
  source.replaceChildren(...linkedSourceNodes(raw, 0, markStart, ranges), mark, ...linkedSourceNodes(raw, markEnd, raw.length, ranges));
  mark.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function updateSourceEntryLabel(household) {
  const pages = [...new Set((household?.sourcePages || []).filter(Number.isFinite))].sort((a, b) => a - b);
  if (!pages.length) {
    document.querySelector("#sourceEntryLabel").textContent = t("sourceEntry");
    return;
  }
  const sourceTitle = activeData?.source_title || activeProject?.name?.replace(/\s*·\s*/g, " ") || "Catasto";
  const pageLabel = pages.length === 1 ? `Page ${pages[0]}` : `Pages ${pages.join(", ")}`;
  const inferred = household.sourcePagesInferred ? ` (${t("inferred")})` : "";
  document.querySelector("#sourceEntryLabel").textContent = `${t("sourceEntry")}: ${sourceTitle}: ${pageLabel}${inferred}`;
}

function reportSubject(unit) {
  if (view.subject) return view.subject;
  if (unit.householdId && activeData?.households.some(record => record.id === unit.householdId)) return { householdId: unit.householdId, position: 0 };
  return { name: unit.head, candidateIds: unit.candidateHouseholdIds };
}

// A report line, with each linked name made a button that shows that person in the Visualizer.
function reportParagraph(className, text, links = []) {
  const paragraph = document.createElement("p");
  paragraph.className = className;
  const parts = [];
  let cursor = 0;
  links.forEach(link => {
    const start = link.label ? text.indexOf(link.label, cursor) : -1;
    if (start < 0) return;
    if (start > cursor) parts.push(document.createTextNode(text.slice(cursor, start)));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "report-link";
    button.textContent = link.label;
    button.title = t("openPerson")(link.label);
    button.addEventListener("click", () => followReportLink(link.target));
    parts.push(button);
    cursor = start + link.label.length;
  });
  if (!parts.length) {
    paragraph.textContent = text;
    return paragraph;
  }
  if (cursor < text.length) parts.push(document.createTextNode(text.slice(cursor)));
  paragraph.replaceChildren(...parts);
  return paragraph;
}

// The unit showing a household in the current layer: the household itself, or one of its parcels.
function unitForHousehold(householdId) {
  return households.find(unit => unit.source === "extracted" && unit.householdId === householdId) || null;
}

function showReportTarget(target, subject) {
  if (target.householdId) {
    let unit = unitForHousehold(target.householdId);
    if (!unit && view.layer === "land") {
      // An owner without landholdings is shown in the Households view.
      view.layer = "household";
      useData(activeData, null, { keepReportHistory: true });
      unit = unitForHousehold(target.householdId);
    }
    if (!unit) return false;
    const member = target.position > 0 ? unit.memberIdentities?.[target.position] : null;
    const highlight = member?.sourceLine && unit.sourceEntry.includes(member.sourceLine) ? member.sourceLine : member?.name || unit.head;
    selectHousehold(unit.id, highlight, subject);
    return true;
  }
  // Someone known only by name: their placeholder in the 3D view when there is one, otherwise the
  // current entry, which names them.
  const placeholder = households.find(unit => unit.source === "adjacent-placeholder" && personKey(unit.head) === personKey(target.name));
  selectHousehold(placeholder?.id || view.selectedId, target.name, subject);
  return true;
}

function followReportLink(target) {
  const from = { selectedId: view.selectedId, subject: view.subject, layer: view.layer, highlight: view.sourceHighlight || "", name: currentReportName };
  const subject = target.householdId ? { householdId: target.householdId, position: target.position || 0 } : { name: target.name, candidateIds: target.candidateIds };
  if (showReportTarget(target, subject)) view.reportHistory.push(from);
  renderEvidenceReport();
}

function goBackInReport() {
  const previous = view.reportHistory.pop();
  if (!previous) return;
  if (previous.layer !== view.layer) {
    view.layer = previous.layer;
    useData(activeData, null, { keepReportHistory: true });
  }
  if (householdById.has(previous.selectedId)) selectHousehold(previous.selectedId, previous.highlight, previous.subject);
  renderEvidenceReport();
}

let currentReportName = "";

// Builds the Adjacent Evidence report for the selected person. It is computed each time and never saved.
function renderEvidenceReport() {
  const container = document.querySelector("#evidenceReport");
  const label = document.querySelector("#evidenceReportLabel");
  const back = document.querySelector("#evidenceBack");
  const previous = view.reportHistory[view.reportHistory.length - 1];
  back.hidden = !previous;
  back.textContent = t("back");
  back.title = previous ? t("backTo")(previous.name) : "";
  const unit = householdById.get(view.selectedId);
  if (!unit || !activeData || !window.CatastoRelations) {
    label.textContent = t("adjacentEvidence");
    currentReportName = "";
    container.replaceChildren();
    return;
  }
  const report = window.CatastoRelations.buildPersonReport(activeData, reportSubject(unit), {
    language,
    sourceTitle: activeData.source_title || activeProject?.name?.replace(/\s*·\s*/g, " ")
  });
  label.textContent = `${report.title}: ${report.subjectName}`;
  label.title = label.textContent;
  currentReportName = report.subjectName;
  const nodes = report.summary.map(item => reportParagraph("report-line", item.text, item.links));
  report.sections.forEach(part => {
    nodes.push(reportParagraph("report-heading", part.heading));
    if (part.emptyText) nodes.push(reportParagraph("report-empty", part.emptyText));
    part.items.forEach(item => {
      const kindClass = { subheading: "report-subheading", note: "report-pending", empty: "report-empty", lead: `report-lead report-${item.strength}` };
      nodes.push(reportParagraph(kindClass[item.kind] || "report-line", item.text, item.links));
      if (item.derived) nodes.push(reportParagraph("report-note", `(${item.derived})`));
      (item.clues || []).forEach(clue => nodes.push(reportParagraph("report-clue", `– ${clue}`)));
    });
  });
  container.replaceChildren(...nodes);
  container.scrollTop = 0;
}

// subject: who the report is about (see view.subject); leaving it out keeps the current person when the
// same unit is selected again, as when the language changes.
function selectHousehold(id, sourceHighlight = "", subject) {
  const household = householdById.get(id);
  if (!household) return;
  if (subject !== undefined || id !== view.selectedId) view.subject = subject || null;
  view.selectedId = id;
  view.sourceHighlight = sourceHighlight;
  document.querySelector("#selectedTitle").textContent = view.layer === "land"
    ? `${household.displayHead || household.head} - ${household.parcelName} · ${localizedPlace(household.place)}`
    : `${household.displayHead || household.head} - ${localizedPlace(household.place)}`;
  updateSourceEntryLabel(household);
  const sourceLinks = household.source === "extracted" && household.householdId && window.CatastoRelations?.sourceEntryLinks
    ? window.CatastoRelations.sourceEntryLinks(activeData, household.householdId)
    : [];
  showSourceEntry(household.sourceEntry, sourceHighlight, sourceLinks, reportSubject(household));
  sourceEditButton.hidden = view.layer !== "household" || household.source !== "extracted" || !Number.isInteger(household.recordIndex);
  renderEvidenceReport();
  renderList();
  announceScene();
}

function withUniqueRecordIds(data) {
  const seen = new Map();
  return {
    ...data,
    households: data.households.map((record, index) => {
      const baseId = slugify(record.id || record.household_head || `household-${index + 1}`) || `household-${index + 1}`;
      const count = seen.get(baseId) || 0;
      seen.set(baseId, count + 1);
      return {
        ...record,
        id: count ? `${baseId}-${count + 1}` : baseId
      };
    })
  };
}

function useData(data, preferredPerson = null, { keepReportHistory = false } = {}) {
  const preparedData = withUniqueRecordIds(data);
  activeData = preparedData;
  renderLayerToggle();
  households = buildUnits(preparedData);
  householdById = new Map(households.map(household => [household.id, household]));
  view.subject = null;
  if (!keepReportHistory) view.reportHistory = [];
  view.selectedId = matchingUnitIdForPerson(preferredPerson) || households[0]?.id || null;
  if (view.selectedId) {
    selectHousehold(view.selectedId);
  } else {
    list.innerHTML = "";
    document.querySelector("#selectedTitle").textContent = view.layer === "land" ? t("noLandholdings") : t("noHouseholds");
    document.querySelector("#sourceEntry").textContent = view.layer === "land"
      ? t("noLandSource")
      : t("noHouseholdSource");
    renderEvidenceReport();
    announceScene();
  }
}

function setFilenameLabel(name) {
  currentFileName = name;
  filenameLine.textContent = `${t("currentFile")}: ${name}`;
}

function renderProjectOptions(projects, selectedId) {
  projectSelect.innerHTML = "";
  if (!projects.length) {
    projectSelect.add(new Option("No projects saved", ""));
    projectSelect.disabled = true;
    return;
  }
  projectSelect.disabled = false;
  projects.forEach(project => {
    // A project still being recovered from an interrupted update is shown but cannot be opened.
    const option = new Option(project.unavailable ? `${project.name} (being recovered)` : project.name, project.id);
    option.disabled = Boolean(project.unavailable);
    projectSelect.add(option);
  });
  projectSelect.value = selectedId;
}

// Gives the renderer the field types it reads, so an incomplete imported record cannot stop the app.
// Only the display copy is normalized; the stored project is unchanged.
function renderableRecord(value) {
  const record = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const text = field => typeof field === "string" ? field : field == null ? "" : String(field);
  const residence = record.residence && typeof record.residence === "object" ? record.residence : {};
  return {
    ...record,
    household_head: text(record.household_head),
    members_text: text(record.members_text),
    source_entry: text(record.source_entry),
    source_pages: Array.isArray(record.source_pages) ? record.source_pages.filter(Number.isFinite) : [],
    residence: {
      ...residence,
      place: typeof residence.place === "string" ? residence.place : null,
      description: typeof residence.description === "string" ? residence.description : null,
      adjacent_to: Array.isArray(residence.adjacent_to) ? residence.adjacent_to.filter(name => typeof name === "string") : []
    },
    residence_links: Array.isArray(record.residence_links)
      ? record.residence_links.filter(link => link && typeof link === "object")
      : []
  };
}

function projectScopedData(project) {
  const data = JSON.parse(JSON.stringify(project.data));
  data.households = data.households.map((stored, index) => {
    const record = renderableRecord(stored);
    return {
      ...record,
      projectRecordIndex: index,
      id: `${project.id}-${record.id || record.household_head || index + 1}`,
      household_id: `${project.id}-${record.household_id || record.id || record.household_head || index + 1}`,
      residence_links: record.residence_links.map(link => ({
        ...link,
        name: typeof link.name === "string" ? link.name : "",
        household_id: link.household_id ? `${project.id}-${link.household_id}` : null,
        candidate_household_ids: (Array.isArray(link.candidate_household_ids) ? link.candidate_household_ids : []).map(id => `${project.id}-${id}`)
      }))
    };
  });
  return data;
}

// Restores member source lines erased by the earlier identity-recalculation defect.
function backfillMemberSourceLines(data) {
  let changed = false;
  (data?.households || []).forEach(record => {
    if (!Array.isArray(record?.member_identities)) return;
    const lines = memberLines(record);
    record.member_identities.forEach(member => {
      if (member && member.source_line === undefined && typeof lines[member.position] === "string") {
        member.source_line = lines[member.position];
        changed = true;
      }
    });
  });
  return changed;
}

// Rebuilds the links between households from each record's stored neighbors. Residences are never
// reread from source text here, so curated and merged neighbors survive.
function recalculateStoredIdentityGraph(data) {
  if (!Array.isArray(data?.households)) return false;
  // Records keep their permanent ids; only the links between them are recalculated.
  const records = data.households.map(record => ({ ...record, household_id: record.id, head: record.household_head }));
  const resolved = triangulateResidenceAdjacency(linkResidenceAdjacency(records));
  resolved.forEach((record, index) => {
    data.households[index].household_id = record.id;
    data.households[index].residence_links = record.residence_links;
    data.households[index].member_identities = householdMemberIdentities(data.households[index], surnameFromName(record.household_head)).map(member => ({
      id: member.id,
      household_id: record.id,
      identity_type: member.identityType,
      position: member.position,
      source_line: member.sourceLine
    }));
  });
  data.identity_resolution_version = 4;
  data.pipeline_version = "semantic-cleaning-v2-identity-triangulation";
  return true;
}




// Applies the changes that lose nothing as a project opens: permanent ids when every link can be kept,
// and member lines erased by an earlier defect. A conversion that would drop links waits for review.
async function prepareProject(project) {
  let changed = backfillMemberSourceLines(project.data);
  const conversion = CatastoRecords.planPermanentIds(project.data);
  if (conversion && !conversion.dropped.length) {
    project.data = conversion.data;
    changed = true;
  }
  if (!changed) return project;
  try {
    return await CatastoStorage.saveProject(project);
  } catch (error) {
    console.warn(`Project “${project.name}” was not updated.`, error);
    return project;
  }
}

async function activateProject(id) {
  const loaded = id ? await CatastoStorage.getProject(id) : null;
  if (!loaded) return;
  let project = loaded;
  try {
    project = await prepareProject(loaded);
  } catch (error) {
    console.warn(`Project “${loaded.name}” could not be prepared.`, error);
  }
  view.layer = "household";
  view.search = "";
  personSearch.value = "";
  try {
    activeProject = project;
    useData(projectScopedData(project));
  } catch (error) {
    console.error("Project could not be displayed:", error);
    showUnavailableProject(project, error);
    return;
  }
  const projectParts = project.name.split(/\s*·\s*/);
  document.querySelector("#catastoTitle").textContent = `${projectParts[0] || project.name} Catasto Onciario${projectParts[1] ? ` ${projectParts.slice(1).join(" ")}` : ""}`;
  setFilenameLabel(`${project.name} · ${project.data.households.length} households`);
  savePreference("catasto-active-project", project.id);
  updateReparseNotice();
}

// A project with links that permanent ids cannot keep, or parsed by an older parser, is offered an
// update. Nothing is changed until the user reviews it; the previous data is kept as the snapshot.
const MAX_PROJECT_BYTES = 50 * 1024 * 1024;
const postponedReparse = new Set();
const reparseNotice = document.querySelector("#reparseNotice");
const reparseNoticeText = document.querySelector("#reparseNoticeText");
const reparseModal = document.querySelector("#reparseModal");
const reparseSummary = document.querySelector("#reparseSummary");
const reparseChanges = document.querySelector("#reparseChanges");
const reparseStatus = document.querySelector("#reparseStatus");
const reparseApply = document.querySelector("#reparseApply");
let pendingReparse = null;

function pendingUpdateKind(project) {
  if (!project) return null;
  if (project.data.record_id_version !== CatastoRecords.RECORD_ID_VERSION) return "ids";
  return CatastoRecords.needsReparse(project) ? "reparse" : null;
}

function updateReparseNotice() {
  const kind = pendingUpdateKind(activeProject);
  reparseNotice.hidden = !kind || postponedReparse.has(activeProject.id);
  if (reparseNotice.hidden) return;
  const it = language === "it";
  reparseNoticeText.textContent = kind === "ids"
    ? (it
      ? "Questo progetto usa identificativi basati sui nomi. Alcuni collegamenti non possono essere mantenuti con identificativi permanenti; rivedi l’aggiornamento prima di applicarlo."
      : "This project uses name-based record ids. Some of its links cannot be kept when it moves to permanent ids; review the update before applying it.")
    : (it
      ? "Questo progetto è stato letto da una versione precedente del parser. Un aggiornamento può aggiungere residenze e collegamenti tra vicini; le tue modifiche restano."
      : "This project was read by an older version of the parser. An update can fill in more residences and neighbor links; your edits are kept.");
}

function graphCounts(data) {
  const records = data.households || [];
  return {
    households: records.length,
    residences: records.filter(record => record.residence?.place).length,
    links: records.flatMap(record => record.residence_links || []).filter(link => link.household_id).length
  };
}

function projectBytes(project) {
  return new TextEncoder().encode(JSON.stringify(project)).length;
}

function changeLine(change) {
  const it = language === "it";
  if (change.kind === "added") return it ? `${change.head}: nuova voce` : `${change.head}: new record`;
  if (change.kind === "removed") return it ? `${change.head}: rimossa (non modificata, non più trovata)` : `${change.head}: removed (unedited, no longer found)`;
  if (change.kind === "place") return `${change.head}: ${it ? "residenza" : "residence"} ${change.from || "—"} → ${change.to || "—"}`;
  const parts = [
    ...change.added.map(name => `+ ${name}`),
    ...change.removed.map(name => `− ${name}`)
  ];
  return `${change.head}: ${it ? "vicini" : "neighbors"} ${parts.join(", ")}`;
}

function idConversionPlan(project) {
  const plan = CatastoRecords.planPermanentIds(project.data);
  const it = language === "it";
  return {
    data: plan.data,
    reason: "Before converting to permanent household ids",
    items: [it
      ? `${plan.dropped.length} riferimenti non possono essere mantenuti e verranno rimossi:`
      : `${plan.dropped.length} reference${plan.dropped.length === 1 ? "" : "s"} cannot be kept and will be removed:`],
    changes: plan.dropped,
    blocked: ""
  };
}

function reparsePlan(project) {
  const parsed = parsePlainText(project.sourceText, project.data.source_language);
  const plan = CatastoRecords.planReparse(project, parsed);
  recalculateStoredIdentityGraph(plan.data);
  const before = graphCounts(project.data);
  const after = graphCounts(plan.data);
  const it = language === "it";
  const kept = plan.summary.keptEdits + plan.summary.keptUnmatchedEdits;
  const items = [
    it ? `Famiglie: ${before.households} → ${after.households}` : `Households: ${before.households} → ${after.households}`,
    it ? `Famiglie con residenza: ${before.residences} → ${after.residences}` : `Households with a residence: ${before.residences} → ${after.residences}`,
    it ? `Collegamenti tra vicini: ${before.links} → ${after.links}` : `Resolved neighbor links: ${before.links} → ${after.links}`,
    it ? `Voci abbinate a quelle salvate: ${plan.summary.matched}` : `Records matched to saved records: ${plan.summary.matched}`,
    it ? `Voci con modifiche o unioni, mantenute invariate: ${kept}` : `Records with your edits or merges, kept unchanged: ${kept}`,
    it ? `Residenze salvate mantenute dove il nuovo parser legge diversamente: ${plan.summary.keptPlaces}` : `Saved residences kept where the new parse reads them differently: ${plan.summary.keptPlaces}`,
    it ? `Voci con vicini diversi: ${plan.summary.neighborChanges}` : `Records whose neighbors change: ${plan.summary.neighborChanges}`,
    it ? `Nuove voci: ${plan.summary.added}` : `New records: ${plan.summary.added}`,
    it ? `Voci non modificate e non più trovate, rimosse: ${plan.summary.removed}` : `Unedited records no longer found, removed: ${plan.summary.removed}`
  ];
  if (plan.summary.inferredPages) {
    items.push(it ? `Pagine dedotte dalla posizione: ${plan.summary.inferredPages}` : `Page numbers inferred from position: ${plan.summary.inferredPages}`);
  }
  const blocked = plan.uncertainMerges.length
    ? (it
      ? `Aggiornamento bloccato: le voci unite di ${plan.uncertainMerges.join(", ")} non corrispondono con certezza al nuovo testo. Annulla l’unione o correggi la voce, poi riprova.`
      : `Update blocked: the merged entries of ${plan.uncertainMerges.join(", ")} do not match the new parse with certainty. Undo the merge or correct the entry, then try again.`)
    : "";
  return {
    data: plan.data,
    reason: `Before reparsing with parser version ${window.CatastoParser.PARSER_VERSION}`,
    items,
    changes: plan.changes.map(changeLine),
    blocked
  };
}

function openReparseReview() {
  if (!activeProject) return;
  const project = structuredClone(activeProject);
  const kind = pendingUpdateKind(project);
  if (!kind) return;
  const plan = kind === "ids" ? idConversionPlan(project) : reparsePlan(project);
  const it = language === "it";
  const updated = { ...project, data: plan.data };
  const tooLarge = projectBytes(updated) > MAX_PROJECT_BYTES;
  reparseSummary.innerHTML = plan.items.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  const shown = plan.changes.slice(0, 300);
  reparseChanges.innerHTML = shown.map(line => `<li>${escapeHtml(line)}</li>`).join("") +
    (plan.changes.length > shown.length ? `<li>${escapeHtml(it ? `…e altre ${plan.changes.length - shown.length}` : `…and ${plan.changes.length - shown.length} more`)}</li>` : "");
  reparseChanges.hidden = !plan.changes.length;
  const blocked = plan.blocked || (tooLarge
    ? (it ? "Aggiornamento bloccato: il progetto aggiornato supererebbe 50 MB." : "Update blocked: the updated project would be larger than 50 MB.")
    : "");
  reparseStatus.textContent = blocked || (it
    ? "I dati attuali vengono conservati come versione precedente, ripristinabile da Admin."
    : "The current data is kept as the previous version, which Admin can restore.");
  reparseApply.disabled = Boolean(blocked);
  pendingReparse = blocked ? null : { projectId: project.id, data: plan.data, reason: plan.reason };
  reparseModal.classList.add("open");
  reparseModal.setAttribute("aria-hidden", "false");
  (blocked ? document.querySelector("#reparseCancel") : reparseApply).focus();
}

function closeReparseReview() {
  pendingReparse = null;
  reparseModal.classList.remove("open");
  reparseModal.setAttribute("aria-hidden", "true");
}

async function applyReparse() {
  if (!pendingReparse || activeProject?.id !== pendingReparse.projectId) return;
  const editedProject = structuredClone(activeProject);
  // The snapshot is now a separate file; an older in-project backup is no longer kept.
  delete editedProject.entryBoundaryMigrationBackup;
  delete editedProject.migrationSnapshot;
  editedProject.data = pendingReparse.data;
  reparseApply.disabled = true;
  try {
    await CatastoStorage.saveProject(editedProject, { snapshot: pendingReparse.reason });
    closeReparseReview();
    activeProject = editedProject;
    useData(projectScopedData(activeProject));
    setFilenameLabel(`${activeProject.name} · ${activeProject.data.households.length} households`);
    updateReparseNotice();
  } catch (error) {
    reparseStatus.textContent = error.message;
  } finally {
    reparseApply.disabled = false;
  }
}

document.querySelector("#reparseReview").addEventListener("click", openReparseReview);
document.querySelector("#reparseLater").addEventListener("click", () => {
  if (activeProject) postponedReparse.add(activeProject.id);
  updateReparseNotice();
});
document.querySelector("#reparseCancel").addEventListener("click", closeReparseReview);
reparseApply.addEventListener("click", () => {
  applyReparse();
});
reparseModal.addEventListener("keydown", event => {
  if (event.key === "Escape") closeReparseReview();
  trapModalFocus(event, reparseModal);
});

// Leaves the project selector usable and stops the broken project from reopening at startup.
function showUnavailableProject(project, error) {
  if (storedPreference("catasto-active-project") === project.id) removePreference("catasto-active-project");
  activeProject = null;
  activeData = null;
  households = [];
  householdById = new Map();
  view.selectedId = null;
  list.innerHTML = "";
  sourceEditButton.hidden = true;
  document.querySelector("#selectedTitle").textContent = "Project could not be displayed";
  document.querySelector("#sourceEntry").textContent = `“${project.name}” could not be displayed (${error.message}). Choose another project, or export, repair, or delete it in Admin.`;
  setFilenameLabel(`${project.name} · could not be displayed`);
  announceScene();
}

// A new installation has no projects; the user creates or imports one in Admin.
function showEmptyLibrary() {
  activeProject = null;
  activeData = null;
  households = [];
  householdById = new Map();
  view.selectedId = null;
  list.innerHTML = "";
  sourceEditButton.hidden = true;
  document.querySelector("#catastoTitle").textContent = "Catasto Onciario";
  document.querySelector("#selectedTitle").textContent = "No projects yet";
  document.querySelector("#sourceEntry").textContent = "No projects are saved on this computer yet. Open ADMIN to create a project from a transcription file or import a .catasto.json backup.";
  setFilenameLabel("No projects saved");
  announceScene();
}

async function refreshProjects(preferredId = null) {
  const projects = await CatastoStorage.listProjects();
  if (!projects.length) {
    renderProjectOptions(projects, "");
    showEmptyLibrary();
    return;
  }
  const rememberedId = storedPreference("catasto-active-project");
  const available = projects.filter(project => !project.unavailable);
  const selectedId = [preferredId, rememberedId, available[0]?.id]
    .find(id => id && available.some(project => project.id === id));
  renderProjectOptions(projects, selectedId);
  if (!selectedId) {
    showEmptyLibrary();
    document.querySelector("#sourceEntry").textContent = "Every saved project is still being recovered from an interrupted update. Restart the app; if this message remains, check the launcher window for the error.";
    return;
  }
  await activateProject(selectedId);
}

function isEditingProject() {
  return sourceEditModal.classList.contains("open") || duplicateModal.classList.contains("open");
}

// Applies a project-library change announced by Admin in another tab. A newly imported or created
// project opens at once, unless an edit is open here; then only the selector list is updated.
async function applyLibraryChange(change) {
  if (change?.type !== "projects-changed") return;
  const opensProject = (change.reason === "imported" || change.reason === "created") && change.projectId;
  if (opensProject && !isEditingProject()) {
    await refreshProjects(change.projectId);
    return;
  }
  // A project restored in Admin is reopened here so the restored data is shown.
  if (change.reason === "restored" && change.projectId === activeProject?.id && !isEditingProject()) {
    await refreshProjects(change.projectId);
    return;
  }
  const projects = await CatastoStorage.listProjects();
  if (activeProject && projects.some(project => project.id === activeProject.id)) {
    renderProjectOptions(projects, activeProject.id);
  } else if (isEditingProject()) {
    renderProjectOptions(projects, "");
  } else {
    await refreshProjects();
  }
}

let libraryChanges = Promise.resolve();
function queueLibraryChange(change) {
  libraryChanges = libraryChanges.then(() => applyLibraryChange(change)).catch(error => {
    filenameLine.textContent = error.message;
  });
  return libraryChanges;
}

if (typeof BroadcastChannel === "function") {
  new BroadcastChannel("catasto-projects").addEventListener("message", event => queueLibraryChange(event.data));
}

function selectedProjectRecord() {
  const selected = householdById.get(view.selectedId);
  if (!activeProject || view.layer !== "household" || !Number.isInteger(selected?.recordIndex)) return null;
  return activeProject.data.households[selected.recordIndex] || null;
}

function openSourceEditor() {
  const record = selectedProjectRecord();
  if (!record) return;
  sourceEditText.value = record.source_entry || "";
  sourceEditPlace.value = record.residence?.place || "";
  sourceEditStatus.textContent = t("editStoredLocally");
  sourceEditModal.classList.add("open");
  sourceEditModal.setAttribute("aria-hidden", "false");
  sourceEditPlace.focus();
}

function closeSourceEditor() {
  sourceEditModal.classList.remove("open");
  sourceEditModal.setAttribute("aria-hidden", "true");
  sourceEditButton.focus();
}

function duplicateDecisionKey(first, second) {
  return [first.id, second.id].sort().join("|");
}

function findStrongDuplicate(record) {
  const key = personKey(record.household_head);
  if (!key) return null;
  return activeProject.data.households.find(candidate => {
    if (candidate === record || personKey(candidate.household_head) !== key) return false;
    const decisionKey = duplicateDecisionKey(record, candidate);
    return !(activeProject.data.duplicate_decisions || []).some(decision => decision.key === decisionKey && decision.status === "separate");
  }) || null;
}

function recordPageSummary(record) {
  const pages = [...new Set(record.source_pages || [])].sort((a, b) => a - b);
  if (!pages.length) return "Page not recorded";
  return `${pages.length === 1 ? "Page" : "Pages"} ${pages.join(", ")}${record.source_pages_inferred ? ` (${t("inferred")})` : ""}`;
}

function duplicateRecordCard(record, label) {
  const members = memberLines(record).slice(1).join("; ") || "No additional household members listed";
  const references = (record.residence?.adjacent_to || []).join(", ") || "No residence references listed";
  return `<section class="duplicate-record" aria-label="${escapeHtml(label)}">
    <h3>${escapeHtml(record.household_head)}</h3>
    <p><strong>${escapeHtml(label)}</strong> · ${escapeHtml(recordPageSummary(record))}</p>
    <p><strong>Residence:</strong> ${escapeHtml(record.residence?.place || "Not listed")}</p>
    <p><strong>Household:</strong> ${escapeHtml(members)}</p>
    <p><strong>References:</strong> ${escapeHtml(references)}</p>
    <p class="duplicate-source">${escapeHtml(record.source_entry || "")}</p>
  </section>`;
}

function focusableElements(modal) {
  return [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.closest("[hidden]"));
}

function trapModalFocus(event, modal) {
  if (event.key !== "Tab") return;
  const focusable = focusableElements(modal);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function openDuplicateReview(editedRecord, candidateRecord) {
  duplicateReview = { editedId: editedRecord.id, candidateId: candidateRecord.id, mergeId: null };
  duplicateComparison.innerHTML = duplicateRecordCard(editedRecord, "Corrected record") + duplicateRecordCard(candidateRecord, "Existing record");
  duplicateStatus.textContent = `Both records normalize to “${candidateRecord.household_head}”. No merge will occur without your confirmation.`;
  duplicateDecisionActions.hidden = false;
  duplicateUndoActions.hidden = true;
  duplicateModal.classList.add("open");
  duplicateModal.setAttribute("aria-hidden", "false");
  document.querySelector("#duplicateLater").focus();
}

function closeDuplicateReview() {
  duplicateModal.classList.remove("open");
  duplicateModal.setAttribute("aria-hidden", "true");
  duplicateReview = null;
  sourceEditButton.focus();
}

function uniqueLines(...values) {
  const seen = new Set();
  return values.flatMap(value => String(value || "").split("\n"))
    .map(line => line.trim()).filter(line => {
      const key = line.toLowerCase();
      if (!line || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

// Selects a stored record by position so same-name household heads cannot be confused.
function storedRecordSelection(project, record) {
  const recordIndex = project.data.households.indexOf(record);
  return { recordIndex: recordIndex >= 0 ? recordIndex : null, name: record.household_head };
}

function sourceEvidence(record) {
  return record.source_entries?.length ? record.source_entries : [{
    text: record.source_entry || "",
    pages: record.source_pages || []
  }];
}

async function mergeDuplicateRecords() {
  if (!duplicateReview) return;
  const editedProject = structuredClone(activeProject);
  const records = editedProject.data.households;
  const editedIndex = records.findIndex(record => record.id === duplicateReview.editedId);
  const candidateIndex = records.findIndex(record => record.id === duplicateReview.candidateId);
  if (editedIndex < 0 || candidateIndex < 0 || editedIndex === candidateIndex) return;
  const edited = records[editedIndex];
  const canonical = records[candidateIndex];
  const mergeId = `merge-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const history = {
    id: mergeId,
    mergedAt: new Date().toISOString(),
    canonicalIndex: candidateIndex,
    duplicateIndex: editedIndex,
    canonicalBefore: JSON.parse(JSON.stringify(canonical)),
    duplicateBefore: JSON.parse(JSON.stringify(edited))
  };
  const evidence = [...sourceEvidence(canonical), ...sourceEvidence(edited)];
  canonical.source_entries = evidence;
  canonical.source_pages = [...new Set(evidence.flatMap(item => item.pages || []))].sort((a, b) => a - b);
  canonical.source_entry = evidence.map(item => {
    const pages = item.pages?.length ? `${item.pages.length === 1 ? "Page" : "Pages"} ${item.pages.join(", ")}` : "Additional source entry";
    return `${pages}\n${item.text}`;
  }).join("\n\n");
  canonical.members_text = uniqueLines(canonical.members_text, edited.members_text).join("\n");
  canonical.aliases = [...new Set([...(canonical.aliases || []), ...(edited.aliases || []), edited.household_head])]
    .filter(name => personKey(name) !== personKey(canonical.household_head));
  canonical.residence = canonical.residence || {};
  canonical.residence.adjacent_to = [...new Set([...(canonical.residence.adjacent_to || []), ...(edited.residence?.adjacent_to || [])])];
  if (!canonical.residence.place && edited.residence?.place) canonical.residence.place = edited.residence.place;
  canonical.family_relationships = [...(canonical.family_relationships || []), ...(edited.family_relationships || [])];
  editedProject.data.merge_history = [...(editedProject.data.merge_history || []), history];
  records.splice(editedIndex, 1);
  editedProject.data.requested_household_count = records.length;
  editedProject.data.extracted_household_count = records.length;
  await CatastoStorage.saveProject(editedProject);
  activeProject = editedProject;
  duplicateReview.mergeId = mergeId;
  useData(projectScopedData(activeProject), storedRecordSelection(activeProject, canonical));
  setFilenameLabel(`${activeProject.name} · ${records.length} households`);
  duplicateStatus.textContent = `Merged into “${canonical.household_head}”. Both source entries, page citations, and former names were preserved.`;
  duplicateDecisionActions.hidden = true;
  duplicateUndoActions.hidden = false;
  document.querySelector("#duplicateUndo").focus();
}

async function undoDuplicateMerge() {
  const mergeId = duplicateReview?.mergeId;
  const editedProject = structuredClone(activeProject);
  const historyIndex = (editedProject.data.merge_history || []).findIndex(item => item.id === mergeId);
  if (historyIndex < 0) return;
  const history = editedProject.data.merge_history[historyIndex];
  const records = editedProject.data.households;
  const canonicalIndex = records.findIndex(record => record.id === history.canonicalBefore.id);
  if (canonicalIndex >= 0) records.splice(canonicalIndex, 1);
  const restored = [
    { index: history.canonicalIndex, record: history.canonicalBefore },
    { index: history.duplicateIndex, record: history.duplicateBefore }
  ].sort((a, b) => a.index - b.index);
  restored.forEach(item => records.splice(Math.min(item.index, records.length), 0, item.record));
  editedProject.data.merge_history.splice(historyIndex, 1);
  editedProject.data.requested_household_count = records.length;
  editedProject.data.extracted_household_count = records.length;
  await CatastoStorage.saveProject(editedProject);
  activeProject = editedProject;
  closeDuplicateReview();
  useData(projectScopedData(activeProject), storedRecordSelection(activeProject, history.duplicateBefore));
  setFilenameLabel(`${activeProject.name} · ${records.length} households`);
}

async function keepDuplicateSeparate() {
  if (!duplicateReview) return;
  const first = activeProject.data.households.find(record => record.id === duplicateReview.editedId);
  const second = activeProject.data.households.find(record => record.id === duplicateReview.candidateId);
  if (first && second) {
    const editedProject = structuredClone(activeProject);
    editedProject.data.duplicate_decisions = [...(editedProject.data.duplicate_decisions || []), {
      key: duplicateDecisionKey(first, second), status: "separate", decidedAt: new Date().toISOString()
    }];
    await CatastoStorage.saveProject(editedProject);
    activeProject = editedProject;
  }
  closeDuplicateReview();
}

async function saveSourceEntry() {
  const selectedRecord = selectedProjectRecord();
  if (!selectedRecord) return;
  const sourceEntry = sourceEditText.value.trim();
  if (!sourceEntry) {
    sourceEditStatus.textContent = language === "it" ? "La voce catastale non può essere vuota." : "The source tax entry cannot be empty.";
    sourceEditText.focus();
    return;
  }

  const recordIndex = activeProject.data.households.indexOf(selectedRecord);
  if (recordIndex < 0) return;
  const editedProject = structuredClone(activeProject);
  const record = editedProject.data.households[recordIndex];
  const previousHead = record.household_head;
  const parsedResidence = parseResidence(sourceEntry);
  const residencePlace = sourceEditPlace.value.trim();
  const parsedMembers = sourceEntry.split("\n").map(line => line.trim()).filter(isMemberLine);
  record.source_entry = sourceEntry;
  record.source_edited_at = new Date().toISOString();
  if (residencePlace && residencePlace !== parsedResidence.place) record.residence_edited_at = record.source_edited_at;
  record.residence = {
    ...record.residence,
    ...parsedResidence,
    place: residencePlace || parsedResidence.place || null
  };
  if (parsedMembers.length) {
    const family = window.CatastoParser.inferFamilyRelationships(parsedMembers);
    record.members_text = family.members.join("\n");
    record.family_relationships = family.relationships;
    const correctedHead = memberPersonName(parsedMembers[0]);
    if (correctedHead && correctedHead !== previousHead) {
      record.household_head = correctedHead;
      record.aliases = [...new Set([...(record.aliases || []), previousHead])];
    }
  }

  sourceEditStatus.textContent = language === "it" ? "Salvataggio…" : "Saving…";
  document.querySelector("#sourceEditSave").disabled = true;
  try {
    recalculateStoredIdentityGraph(editedProject.data);
    await CatastoStorage.saveProject(editedProject);
    activeProject = editedProject;
    const duplicate = findStrongDuplicate(record);
    closeSourceEditor();
    useData(projectScopedData(activeProject), storedRecordSelection(activeProject, record));
    setFilenameLabel(`${activeProject.name} · ${activeProject.data.households.length} households`);
    if (duplicate) openDuplicateReview(record, duplicate);
  } catch (error) {
    sourceEditStatus.textContent = error.message;
  } finally {
    document.querySelector("#sourceEditSave").disabled = false;
  }
}

sourceEditButton.addEventListener("click", openSourceEditor);
document.querySelector("#sourceEditCancel").addEventListener("click", closeSourceEditor);
document.querySelector("#sourceEditSave").addEventListener("click", () => {
  saveSourceEntry();
});
document.querySelector("#duplicateLater").addEventListener("click", closeDuplicateReview);
document.querySelector("#duplicateDone").addEventListener("click", closeDuplicateReview);
document.querySelector("#duplicateSeparate").addEventListener("click", () => {
  keepDuplicateSeparate().catch(error => { duplicateStatus.textContent = error.message; });
});
document.querySelector("#duplicateMerge").addEventListener("click", () => {
  mergeDuplicateRecords().catch(error => { duplicateStatus.textContent = error.message; });
});
document.querySelector("#duplicateUndo").addEventListener("click", () => {
  undoDuplicateMerge().catch(error => { duplicateStatus.textContent = error.message; });
});
sourceEditModal.addEventListener("click", event => {
  if (event.target === sourceEditModal) closeSourceEditor();
});
sourceEditModal.addEventListener("keydown", event => {
  if (event.key === "Escape") closeSourceEditor();
  trapModalFocus(event, sourceEditModal);
});
duplicateModal.addEventListener("click", event => {
  if (event.target === duplicateModal) closeDuplicateReview();
});
duplicateModal.addEventListener("keydown", event => {
  if (event.key === "Escape") closeDuplicateReview();
  trapModalFocus(event, duplicateModal);
});
projectSelect.addEventListener("change", event => {
  activateProject(event.target.value).catch(error => {
    filenameLine.textContent = error.message;
  });
});
document.querySelector("#evidenceBack").addEventListener("click", goBackInReport);
document.querySelector("#languageEnglish").addEventListener("click", () => {
  if (language === "en") return;
  language = "en";
  savePreference("catasto-language", language);
  applyLanguage();
});
document.querySelector("#languageItalian").addEventListener("click", () => {
  if (language === "it") return;
  language = "it";
  savePreference("catasto-language", language);
  applyLanguage();
});
function submitPersonSearch() {
  view.search = personSearch.value.trim();
  renderList();
  announceScene();
}

function clearSidebarSearch() {
  personSearch.value = "";
  view.search = "";
  renderList();
  announceScene();
}

runPersonSearch.addEventListener("click", submitPersonSearch);
clearPersonSearch.addEventListener("click", clearSidebarSearch);
Object.values(searchFilterInputs).forEach(input => {
  input.addEventListener("change", () => {
    renderList();
  });
});
personSearch.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  submitPersonSearch();
});
document.querySelectorAll(".layer-toggle button").forEach(button => {
  button.addEventListener("click", () => {
    const selectedUnit = householdById.get(view.selectedId);
    const selectedPerson = selectedUnit ? { householdId: selectedUnit.householdId, name: selectedUnit.head } : null;
    view.layer = button.dataset.layer;
    if (activeData) {
      useData(activeData, selectedPerson);
    } else {
      renderLayerToggle();
    }
  });
});

async function loadData() {
  try {
    await refreshProjects();
  } catch (error) {
    document.querySelector("#selectedTitle").textContent = "Could not load extracted data";
    document.querySelector("#sourceEntry").textContent = error.message;
  }
}

function announceScene() {
  window.dispatchEvent(new CustomEvent("catasto:change"));
}

// The divider between the 3D view and the text panels. Its position is a display preference kept in
// this browser only; narrow windows stack the panels instead and hide it.
const evidencePanels = document.querySelector("#evidencePanels");
const visualizationView = document.querySelector(".visualization-view");
const EVIDENCE_HEIGHT_KEY = "catasto-evidence-height";
const DEFAULT_EVIDENCE_HEIGHT = 220;
const MIN_EVIDENCE_HEIGHT = 90;
const MIN_SCENE_HEIGHT = 240;
const KEYBOARD_STEP = 24;

function dividerActive() {
  return typeof window.matchMedia === "function" && window.matchMedia("(min-width: 901px)").matches;
}

function maxEvidenceHeight() {
  const scene = document.querySelector("#scene3d");
  const fixed = [...(visualizationView?.children || [])]
    .filter(element => element !== scene && element !== evidencePanels)
    .reduce((total, element) => total + (element.offsetHeight || 0), 0);
  return Math.max(MIN_EVIDENCE_HEIGHT, (visualizationView?.clientHeight || 0) - fixed - MIN_SCENE_HEIGHT);
}

function setEvidenceHeight(height, { save = false } = {}) {
  if (!dividerActive()) return;
  const max = maxEvidenceHeight();
  const value = Math.round(Math.min(max, Math.max(MIN_EVIDENCE_HEIGHT, Number(height) || DEFAULT_EVIDENCE_HEIGHT)));
  visualizationView.style.setProperty("--evidence-height", `${value}px`);
  panelDivider.setAttribute("aria-valuemin", String(MIN_EVIDENCE_HEIGHT));
  panelDivider.setAttribute("aria-valuemax", String(max));
  panelDivider.setAttribute("aria-valuenow", String(value));
  if (save) savePreference(EVIDENCE_HEIGHT_KEY, String(value));
}

function currentEvidenceHeight() {
  return evidencePanels.getBoundingClientRect().height;
}

function restoreEvidenceHeight() {
  setEvidenceHeight(Number(storedPreference(EVIDENCE_HEIGHT_KEY)) || DEFAULT_EVIDENCE_HEIGHT);
}

panelDivider.addEventListener("pointerdown", event => {
  if (!dividerActive() || event.button !== 0) return;
  event.preventDefault();
  const startY = event.clientY;
  const startHeight = currentEvidenceHeight();
  panelDivider.setPointerCapture(event.pointerId);
  panelDivider.classList.add("dragging");
  const move = moveEvent => setEvidenceHeight(startHeight - (moveEvent.clientY - startY));
  const end = () => {
    panelDivider.removeEventListener("pointermove", move);
    panelDivider.removeEventListener("pointerup", end);
    panelDivider.removeEventListener("pointercancel", end);
    panelDivider.classList.remove("dragging");
    setEvidenceHeight(currentEvidenceHeight(), { save: true });
  };
  panelDivider.addEventListener("pointermove", move);
  panelDivider.addEventListener("pointerup", end);
  panelDivider.addEventListener("pointercancel", end);
});
panelDivider.addEventListener("dblclick", () => {
  removePreference(EVIDENCE_HEIGHT_KEY);
  setEvidenceHeight(DEFAULT_EVIDENCE_HEIGHT);
});
panelDivider.addEventListener("keydown", event => {
  const changes = { ArrowUp: KEYBOARD_STEP, ArrowDown: -KEYBOARD_STEP };
  if (event.key in changes) {
    setEvidenceHeight(currentEvidenceHeight() + changes[event.key], { save: true });
  } else if (event.key === "Home" || event.key === "End") {
    setEvidenceHeight(event.key === "Home" ? MIN_EVIDENCE_HEIGHT : maxEvidenceHeight(), { save: true });
  } else {
    return;
  }
  event.preventDefault();
});
if (typeof window.addEventListener === "function") window.addEventListener("resize", restoreEvidenceHeight);
restoreEvidenceHeight();

window.catasto = {
  getState: () => ({ units: households, selectedId: view.selectedId, layer: view.layer, search: view.search }),
  getLanguage: () => language,
  // Selecting from the 3D view always reports on the household head.
  select: id => {
    view.reportHistory = [];
    selectHousehold(id, "", null);
  }
};

applyLanguage();
// Library changes announced during startup wait until the first load finishes.
libraryChanges = loadData();
