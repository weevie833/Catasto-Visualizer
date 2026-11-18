// Builds the Adjacent Evidence report for one person: who they are, where they live, and their
// associations by degree. The report is computed from the loaded project each time and never saved.
// Relations a household entry states (a "son" is the head's son) are kept apart from relations
// derived from them (two sons of the head are brothers), so readers can tell fact from inference.
(function () {
  "use strict";

  const STRINGS = {
    en: {
      title: "Adjacent evidence",
      degree1: "First degree: immediate family",
      degree2: "Second degree: extended family",
      degree3: "Third degree: neighbors",
      others: "Others in the household",
      noneStated: "None stated in this entry.",
      noFamilyListed: "No household entry, so no family is listed.",
      leads: "Family leads from other entries",
      leadsIntro: "Speculation from shared surnames, places, and ages, to check against the sources.",
      noLeads: "No other household is headed by someone with this surname.",
      birthFamily: (surname, count) => `Possible birth family: ${count} other ${count === 1 ? "household" : "households"} headed by a ${surname}`,
      relatives: (surname, count) => `Possible relatives: ${count} other ${count === 1 ? "household" : "households"} headed by a ${surname}`,
      lateHusband: (name, count) => `Possible family of the late husband, ${name}: ${count} ${count === 1 ? "household" : "households"}`,
      strength: { strong: "Strong lead", moderate: "Moderate lead", weak: "Weak lead" },
      clue: {
        neighbor: "lives next to this household",
        namedNeighbor: "named as a neighbor of this household, though the name matches more than one head",
        twoStep: name => `one household away, through ${name}`,
        land: "their land and this household's land border each other",
        district: place => `same district (${place})`,
        olderAge: age => `age ${age}: old enough to be a parent`,
        closeAge: age => `age ${age}: close enough in age to be a sibling or cousin`,
        youngerAge: age => `age ${age}: young enough to be a sibling's child`,
        rareSurname: count => `rare surname: only ${count} ${count === 1 ? "household head has" : "household heads have"} it`,
        commonSurname: count => `common surname: ${count} household heads have it`,
        sameName: count => `${count} household heads share this name`
      },
      onlySurname: (surname, list) => `Other ${surname} households with no stronger clue: ${list}`,
      women: surname => `Women of the ${surname} surname in other households:`,
      womanIn: (role, head) => `${role} in ${head}'s household`,
      womanWidow: "widow, head of her own household",
      livesNextTo: name => `that household lives next to ${name}'s`,
      andMore: count => `and ${count} more`,
      residenceHeading: "Residence:",
      landHeading: "Land:",
      householdResidenceHeading: "The household's residence:",
      householdLandHeading: "The household's land:",
      noResidenceNeighbors: "No residence neighbors named.",
      noLandNeighbors: "No land neighbors named.",
      bordersLand: pages => `borders this household's land${pages}`,
      namesHeadLand: pages => `names this household's head as a land neighbor${pages}`,
      namesThemLand: pages => `names them as a land neighbor${pages}`,
      maybeSomeoneElse: count => `${count} household heads have this name, so it may be someone else`,
      age: age => `age ${age}`,
      infant: "infant",
      headOf: count => `Head of a household of ${count}.`,
      memberOf: (role, head, count) => `${role} in ${head}'s household (${count} listed).`,
      memberOfUnstated: (head, count) => `Listed in ${head}'s household (${count} listed).`,
      livesIn: place => `Residence: ${place}.`,
      noResidence: "No residence listed.",
      source: (title, pages) => `Source: ${title}, ${pages}`,
      page: page => `p. ${page}`,
      inferred: "inferred",
      noEntry: "No household entry of their own.",
      couldBe: "Could be one of these household heads:",
      couldBeOne: "Could be this household head:",
      mentionedIn: (head, pages) => `Mentioned in ${head}'s entry${pages}`,
      derived: "Derived",
      namedNeighbor: pages => `named as a neighbor in this entry${pages}`,
      namesThisHousehold: pages => `names this household as a neighbor${pages}`,
      mutualNeighbor: pages => `each entry names the other as a neighbor${pages}`,
      namesThem: pages => `names them as a neighbor${pages}`,
      noHouseholdEntry: "no household entry found",
      ambiguousHeads: count => `${count} household heads have this name`,
      identifiedByNeighbors: "identified from shared neighbors",
      ofHead: role => `${role} of the head`,
      nipoteShort: "nipote",
      notes: {
        children: "both listed as children of the head",
        siblings: "both listed as siblings of the head",
        parentOfChild: "listed as the head's spouse; could be a step-parent",
        childOfSpouse: "listed as the head's child; could be a stepchild",
        spouseSibling: "listed as the head's sibling",
        siblingSpouse: "listed as the head's spouse",
        siblingParent: "listed as the head's parent",
        siblingChild: "listed as the head's child",
        parentOfSibling: "listed as the head's sibling",
        parentGrandchild: "listed as the head's child",
        parentSpouse: "listed as the head's spouse",
        childGrandparent: "listed as the head's parent",
        childUncle: "listed as the head's sibling",
        spouseParent: "listed as the head's parent",
        childInLawUnknown: "the record does not say which of the head's children they married",
        childInLawSpouse: "the spouse of one of the head's children",
        childInLawParent: "a parent of their spouse",
        inLawShares: "the in-law shares a surname with the head's wife"
      },
      relations: {
        husband: "Husband", wife: "Wife", spouse: "Spouse",
        father: "Father", mother: "Mother", parent: "Parent",
        son: "Son", daughter: "Daughter", child: "Child",
        brother: "Brother", sister: "Sister", sibling: "Brother or sister",
        stepfather: "Stepfather", stepmother: "Stepmother", stepparent: "Step-parent",
        stepson: "Stepson", stepdaughter: "Stepdaughter",
        grandfather: "Grandfather", grandmother: "Grandmother", grandparent: "Grandparent",
        grandson: "Grandson", granddaughter: "Granddaughter", grandchild: "Grandchild",
        uncle: "Uncle", aunt: "Aunt", uncleOrAunt: "Uncle or aunt",
        nephew: "Nephew", niece: "Niece", nephewOrNiece: "Nephew or niece",
        nipote: "Nipote (niece, nephew, or grandchild)",
        nipoteInverse: "Uncle, aunt, or grandparent",
        cousin: "Cousin",
        sonInLaw: "Son-in-law", daughterInLaw: "Daughter-in-law", childInLaw: "Son- or daughter-in-law",
        fatherInLaw: "Father-in-law", motherInLaw: "Mother-in-law", parentInLaw: "Parent-in-law",
        brotherInLaw: "Brother-in-law", sisterInLaw: "Sister-in-law", siblingInLaw: "Brother- or sister-in-law",
        husbandOrBrotherInLaw: "Husband or brother-in-law", wifeOrSisterInLaw: "Wife or sister-in-law",
        spouseOrSiblingInLaw: "Spouse or brother- or sister-in-law",
        servant: "Servant", member: "Household member"
      }
    },
    it: {
      title: "Prove adiacenti",
      degree1: "Primo grado: famiglia stretta",
      degree2: "Secondo grado: parenti",
      degree3: "Terzo grado: vicini",
      others: "Altri nella famiglia",
      noneStated: "Nessuno indicato in questa voce.",
      noFamilyListed: "Nessuna voce familiare propria, quindi nessun familiare è elencato.",
      leads: "Indizi di parentela da altre voci",
      leadsIntro: "Ipotesi basate su cognomi, luoghi ed età in comune, da verificare nelle fonti.",
      noLeads: "Nessun’altra famiglia ha un capofamiglia con questo cognome.",
      birthFamily: (surname, count) => `Possibile famiglia d’origine: ${count} ${count === 1 ? "altra famiglia" : "altre famiglie"} con capofamiglia ${surname}`,
      relatives: (surname, count) => `Possibili parenti: ${count} ${count === 1 ? "altra famiglia" : "altre famiglie"} con capofamiglia ${surname}`,
      lateHusband: (name, count) => `Possibile famiglia del defunto marito, ${name}: ${count} ${count === 1 ? "famiglia" : "famiglie"}`,
      strength: { strong: "Indizio forte", moderate: "Indizio medio", weak: "Indizio debole" },
      clue: {
        neighbor: "abita accanto a questa famiglia",
        namedNeighbor: "citato come vicino di questa famiglia, ma il nome corrisponde a più capifamiglia",
        twoStep: name => `a una casa di distanza, tramite ${name}`,
        land: "i terreni di questa famiglia e i suoi confinano",
        district: place => `stesso rione (${place})`,
        olderAge: age => `anni ${age}: età da genitore`,
        closeAge: age => `anni ${age}: età da fratello, sorella o cugino`,
        youngerAge: age => `anni ${age}: età da figlio di un fratello o di una sorella`,
        rareSurname: count => `cognome raro: solo ${count} ${count === 1 ? "capofamiglia lo porta" : "capifamiglia lo portano"}`,
        commonSurname: count => `cognome diffuso: lo portano ${count} capifamiglia`,
        sameName: count => `${count} capifamiglia hanno questo nome`
      },
      onlySurname: (surname, list) => `Altre famiglie ${surname} senza indizi più forti: ${list}`,
      women: surname => `Donne di cognome ${surname} in altre famiglie:`,
      womanIn: (role, head) => `${role} nella famiglia di ${head}`,
      womanWidow: "vedova, capofamiglia",
      livesNextTo: name => `quella famiglia abita accanto a ${name}`,
      andMore: count => `e altre ${count}`,
      residenceHeading: "Residenza:",
      landHeading: "Terreni:",
      householdResidenceHeading: "Residenza della famiglia:",
      householdLandHeading: "Terreni della famiglia:",
      noResidenceNeighbors: "Nessun vicino di casa citato.",
      noLandNeighbors: "Nessun vicino dei terreni citato.",
      bordersLand: pages => `confina con i terreni di questa famiglia${pages}`,
      namesHeadLand: pages => `cita il capofamiglia come vicino dei terreni${pages}`,
      namesThemLand: pages => `lo cita come vicino dei terreni${pages}`,
      maybeSomeoneElse: count => `${count} capifamiglia hanno questo nome, quindi potrebbe essere un’altra persona`,
      age: age => `anni ${age}`,
      infant: "infante",
      headOf: count => `Capofamiglia di una famiglia di ${count}.`,
      memberOf: (role, head, count) => `${role} nella famiglia di ${head} (${count} elencati).`,
      memberOfUnstated: (head, count) => `Elencato nella famiglia di ${head} (${count} elencati).`,
      livesIn: place => `Residenza: ${place}.`,
      noResidence: "Residenza non indicata.",
      source: (title, pages) => `Fonte: ${title}, ${pages}`,
      page: page => `p. ${page}`,
      inferred: "dedotta",
      noEntry: "Nessuna voce familiare propria.",
      couldBe: "Potrebbe essere uno di questi capifamiglia:",
      couldBeOne: "Potrebbe essere questo capofamiglia:",
      mentionedIn: (head, pages) => `Citato nella voce di ${head}${pages}`,
      derived: "Dedotto",
      namedNeighbor: pages => `citato come vicino in questa voce${pages}`,
      namesThisHousehold: pages => `cita questa famiglia come vicina${pages}`,
      mutualNeighbor: pages => `ciascuna voce cita l’altra come vicina${pages}`,
      namesThem: pages => `lo cita come vicino${pages}`,
      noHouseholdEntry: "nessuna voce familiare trovata",
      ambiguousHeads: count => `${count} capifamiglia hanno questo nome`,
      identifiedByNeighbors: "identificato tramite vicini comuni",
      ofHead: role => `${role} del capofamiglia`,
      nipoteShort: "nipote",
      notes: {
        children: "entrambi elencati come figli del capofamiglia",
        siblings: "entrambi elencati come fratelli del capofamiglia",
        parentOfChild: "elencato come coniuge del capofamiglia; potrebbe essere un patrigno o una matrigna",
        childOfSpouse: "elencato come figlio del capofamiglia; potrebbe essere un figliastro",
        spouseSibling: "elencato come fratello o sorella del capofamiglia",
        siblingSpouse: "elencato come coniuge del capofamiglia",
        siblingParent: "elencato come genitore del capofamiglia",
        siblingChild: "elencato come figlio del capofamiglia",
        parentOfSibling: "elencato come fratello o sorella del capofamiglia",
        parentGrandchild: "elencato come figlio del capofamiglia",
        parentSpouse: "elencato come coniuge del capofamiglia",
        childGrandparent: "elencato come genitore del capofamiglia",
        childUncle: "elencato come fratello o sorella del capofamiglia",
        spouseParent: "elencato come genitore del capofamiglia",
        childInLawUnknown: "la voce non dice quale figlio del capofamiglia abbia sposato",
        childInLawSpouse: "coniuge di uno dei figli del capofamiglia",
        childInLawParent: "genitore del coniuge",
        inLawShares: "il cognato o la cognata ha lo stesso cognome della moglie del capofamiglia"
      },
      relations: {
        husband: "Marito", wife: "Moglie", spouse: "Coniuge",
        father: "Padre", mother: "Madre", parent: "Genitore",
        son: "Figlio", daughter: "Figlia", child: "Figlio o figlia",
        brother: "Fratello", sister: "Sorella", sibling: "Fratello o sorella",
        stepfather: "Patrigno", stepmother: "Matrigna", stepparent: "Patrigno o matrigna",
        stepson: "Figliastro", stepdaughter: "Figliastra",
        grandfather: "Nonno", grandmother: "Nonna", grandparent: "Nonno o nonna",
        grandson: "Nipote (figlio di un figlio)", granddaughter: "Nipote (figlia di un figlio)", grandchild: "Nipote (di nonno)",
        uncle: "Zio", aunt: "Zia", uncleOrAunt: "Zio o zia",
        nephew: "Nipote (di zio)", niece: "Nipote (di zia)", nephewOrNiece: "Nipote (di zio o zia)",
        nipote: "Nipote",
        nipoteInverse: "Zio, zia, nonno o nonna",
        cousin: "Cugino o cugina",
        sonInLaw: "Genero", daughterInLaw: "Nuora", childInLaw: "Genero o nuora",
        fatherInLaw: "Suocero", motherInLaw: "Suocera", parentInLaw: "Suocero o suocera",
        brotherInLaw: "Cognato", sisterInLaw: "Cognata", siblingInLaw: "Cognato o cognata",
        husbandOrBrotherInLaw: "Marito o cognato", wifeOrSisterInLaw: "Moglie o cognata",
        spouseOrSiblingInLaw: "Coniuge, cognato o cognata",
        servant: "Servitore", member: "Componente della famiglia"
      }
    }
  };

  // Household roles as the source states them, relative to the head. The order matters: in-law and
  // step terms are tested before the plain terms they contain.
  const ROLE_PATTERNS = [
    ["sonInLaw", /\b(?:genero|son-in-law)\b/i],
    ["daughterInLaw", /\b(?:nuora|daughter-in-law)\b/i],
    ["brotherInLaw", /\b(?:cognato|brother-in-law)\b/i],
    ["sisterInLaw", /\b(?:cognata|sister-in-law)\b/i],
    ["fatherInLaw", /\b(?:s(?:u)?ocero|father-in-law)\b/i],
    ["motherInLaw", /\b(?:s(?:u)?ocera|mother-in-law)\b/i],
    ["stepson", /\b(?:figliastro|stepson)\b/i],
    ["stepdaughter", /\b(?:figliastra|stepdaughter)\b/i],
    ["grandson", /\bgrandson\b/i],
    ["granddaughter", /\bgranddaughter\b/i],
    ["nephew", /\bnephew\b/i],
    ["niece", /\bniece\b/i],
    ["nipote", /\bnipote\b/i],
    ["wife", /\b(?:moglie|wife)\b/i],
    ["husband", /\b(?:marito|husband)\b/i],
    ["son", /\b(?:figlio|son)\b(?!\s+(?:di|del|della|dello|d['’]|fu|of)\b)/i],
    ["daughter", /\b(?:figlia|daughter)\b(?!\s+(?:di|del|della|dello|d['’]|fu|of)\b)/i],
    ["brother", /\b(?:fratello|brother)\b/i],
    ["sister", /\b(?:sorella|sister)\b/i],
    ["mother", /\b(?:madre|mother)\b/i],
    ["father", /\b(?:padre|father)\b/i],
    ["uncle", /\b(?:zio|uncle)\b/i],
    ["aunt", /\b(?:zia|aunt)\b/i],
    ["cousin", /\b(?:cugin[oa]|cousin)\b/i],
    ["servant", /\b(?:serv[oa]|servitore|servant|maidservant|garzone|farmhand)\b/i]
  ];

  const FEMALE_ROLES = new Set(["wife", "daughter", "sister", "mother", "aunt", "niece", "granddaughter", "stepdaughter", "daughterInLaw", "sisterInLaw", "motherInLaw"]);
  const MALE_ROLES = new Set(["husband", "son", "brother", "father", "uncle", "nephew", "grandson", "stepson", "sonInLaw", "brotherInLaw", "fatherInLaw"]);
  const FIRST_DEGREE = new Set([
    "husband", "wife", "spouse", "father", "mother", "parent", "son", "daughter", "child", "brother", "sister", "sibling",
    "stepfather", "stepmother", "stepparent", "stepson", "stepdaughter"
  ]);
  const NOT_KIN = new Set(["servant", "member"]);
  const HONORIFIC = /^(?:Don|Donna|Suor[ae]?|Fra|Frate|Magnific[oa]|Signor[ae]?|Reverend[oa]|Venerabile|Mastro|Maestro|Master|Nobile|Sister|Brother|Father)$/i;

  const parser = () => window.CatastoParser;

  function normalized(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  }

  function gendered(sex, male, female, neutral) {
    return sex === "male" ? male : sex === "female" ? female : neutral;
  }

  function memberLinesOf(record) {
    const lines = String(record.members_text || "").split("\n").map(line => line.trim()).filter(Boolean);
    return parser().inferFamilyRelationships(lines).members;
  }

  function roleText(line) {
    const P = parser();
    if (P.isItalianMemberLine(line)) return P.splitItalianMemberLine(line).rest;
    const parts = String(line).split(",");
    return parts.length > 1 ? parts.slice(1).join(",") : String(line).replace(P.memberPersonName(line), "");
  }

  function roleOf(line) {
    const text = roleText(line);
    return ROLE_PATTERNS.find(([, pattern]) => pattern.test(text))?.[0] || "member";
  }

  function ageOf(line) {
    const age = String(line).match(/\b(?:age|aged|anni)\s+(\d+)\b/i)?.[1];
    if (age) return age;
    return parser().INFANT.test(line) ? "infant" : null;
  }

  // The occupation or condition written beside the name, without the relation or age.
  function descriptionOf(line, role) {
    let text = roleText(line)
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/\b(?:di\s+)?(?:anni|age|aged)\s+\d+\b.*$/i, "")
      // "an infant" is an age, not a description; the article goes with it.
      .replace(new RegExp(String.raw`\b(?:an?\s+)?${parser().INFANT.source.replace(/^\\b/, "")}`, "gi"), "");
    if (role !== "member") {
      const pattern = ROLE_PATTERNS.find(([key]) => key === role)?.[1];
      if (pattern) text = text.replace(pattern, "");
    }
    return text.replace(/[—–=]+|-{2,}/g, " ").replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ")
      .replace(/^[,;:.\s]+|[,;:.\s]+$/g, "").replace(/^(?:his|her|the|a)\s+/i, "").trim();
  }

  function surnameOf(name) {
    return parser().surnameFromName(name) || "";
  }

  // A member listed by given name only takes the head's surname, as the Visualizer shows them.
  function fullName(name, headSurname) {
    const tokens = String(name || "").trim().split(/\s+/).filter(Boolean);
    const given = tokens.filter(token => !HONORIFIC.test(token.replace(/[.,]/g, "")));
    return given.length === 1 && headSurname ? `${tokens.join(" ")} ${headSurname}` : tokens.join(" ");
  }

  function headSexOf(members) {
    const head = members[0];
    if (!head) return null;
    if (members.some(member => member.role === "wife")) return "male";
    if (members.some(member => member.role === "husband")) return "female";
    if (/\b(?:vedova|widow|in capillis|nubile|vergine|virgin|monaca|nun|Donna|Suor[ae]?)\b/i.test(head.sourceLine)) return "female";
    if (/\b(?:sacerdote|priest|Don|chierico|cleric|diacono|deacon|vedovo|widower)\b/.test(head.sourceLine)) return "male";
    // Occupations the Catasto records only for men.
    if (/\b(?:bracciale|bracciante|pecoraro|bovaro|massaro|calzolai?o|calzolaro|ferraro|sartore|mastro|maestro|mulattiere|day laborer|laborer|shepherd|cowherd|shoemaker|blacksmith|tailor|master)\b/i.test(head.sourceLine)) return "male";
    return null;
  }

  function sexOf(member, headSex) {
    if (member.position === 0) return headSex;
    if (MALE_ROLES.has(member.role)) return "male";
    if (FEMALE_ROLES.has(member.role)) return "female";
    if (/\b(?:cugina)\b/i.test(member.sourceLine)) return "female";
    if (/\b(?:cugino)\b/i.test(member.sourceLine)) return "male";
    return null;
  }

  // How the head is related to a member whose relation to the head is stated.
  function headRelativeTo(role, headSex) {
    const g = (male, female, neutral) => gendered(headSex, male, female, neutral);
    switch (role) {
      case "wife": return "husband";
      case "husband": return "wife";
      case "son": case "daughter": return g("father", "mother", "parent");
      case "stepson": case "stepdaughter": return g("stepfather", "stepmother", "stepparent");
      case "brother": case "sister": return g("brother", "sister", "sibling");
      case "mother": case "father": return g("son", "daughter", "child");
      case "nipote": return "nipoteInverse";
      case "nephew": case "niece": return g("uncle", "aunt", "uncleOrAunt");
      case "grandson": case "granddaughter": return g("grandfather", "grandmother", "grandparent");
      case "sonInLaw": case "daughterInLaw": return g("fatherInLaw", "motherInLaw", "parentInLaw");
      case "brotherInLaw": case "sisterInLaw": return g("brotherInLaw", "sisterInLaw", "siblingInLaw");
      case "fatherInLaw": case "motherInLaw": return g("sonInLaw", "daughterInLaw", "childInLaw");
      case "uncle": case "aunt": return g("nephew", "niece", "nephewOrNiece");
      case "cousin": return "cousin";
      default: return null;
    }
  }

  const CHILD = new Set(["son", "daughter"]);
  const SIBLING = new Set(["brother", "sister"]);
  const PARENT = new Set(["mother", "father"]);
  const SPOUSE = new Set(["wife", "husband"]);
  const CHILD_IN_LAW = new Set(["sonInLaw", "daughterInLaw"]);

  // How another member is related to the subject when both relations are stated only to the head.
  // Returns null when the record gives no safe inference.
  function derivedRelation(subjectRole, otherRole, otherSex) {
    const g = (male, female, neutral) => gendered(otherSex, male, female, neutral);
    if (CHILD.has(subjectRole)) {
      if (CHILD.has(otherRole)) return { key: g("brother", "sister", "sibling"), note: "children" };
      if (SPOUSE.has(otherRole)) return { key: g("father", "mother", "parent"), note: "parentOfChild" };
      if (PARENT.has(otherRole)) return { key: g("grandfather", "grandmother", "grandparent"), note: "childGrandparent" };
      if (SIBLING.has(otherRole)) return { key: g("uncle", "aunt", "uncleOrAunt"), note: "childUncle" };
      if (CHILD_IN_LAW.has(otherRole)) {
        const sameSex = (subjectRole === "son") === (otherRole === "sonInLaw");
        if (sameSex) return { key: subjectRole === "son" ? "brotherInLaw" : "sisterInLaw", note: "childInLawSpouse" };
        return { key: otherRole === "daughterInLaw" ? "wifeOrSisterInLaw" : "husbandOrBrotherInLaw", note: "childInLawUnknown" };
      }
    }
    if (SPOUSE.has(subjectRole)) {
      if (CHILD.has(otherRole)) return { key: g("son", "daughter", "child"), note: "childOfSpouse" };
      if (SIBLING.has(otherRole)) return { key: g("brotherInLaw", "sisterInLaw", "siblingInLaw"), note: "spouseSibling" };
      if (PARENT.has(otherRole)) return { key: g("fatherInLaw", "motherInLaw", "parentInLaw"), note: "spouseParent" };
      if (CHILD_IN_LAW.has(otherRole)) return { key: otherRole, note: "childInLawSpouse" };
    }
    if (SIBLING.has(subjectRole)) {
      if (SIBLING.has(otherRole)) return { key: g("brother", "sister", "sibling"), note: "siblings" };
      if (PARENT.has(otherRole)) return { key: g("father", "mother", "parent"), note: "siblingParent" };
      if (CHILD.has(otherRole)) return { key: g("nephew", "niece", "nephewOrNiece"), note: "siblingChild" };
      if (SPOUSE.has(otherRole)) return { key: g("brotherInLaw", "sisterInLaw", "siblingInLaw"), note: "siblingSpouse" };
    }
    if (PARENT.has(subjectRole)) {
      if (SIBLING.has(otherRole)) return { key: g("son", "daughter", "child"), note: "parentOfSibling" };
      if (CHILD.has(otherRole)) return { key: g("grandson", "granddaughter", "grandchild"), note: "parentGrandchild" };
      if (SPOUSE.has(otherRole)) return { key: g("sonInLaw", "daughterInLaw", "childInLaw"), note: "parentSpouse" };
    }
    if (CHILD_IN_LAW.has(subjectRole)) {
      if (CHILD.has(otherRole)) {
        const sameSex = (subjectRole === "sonInLaw") === (otherRole === "son");
        if (sameSex) return { key: subjectRole === "sonInLaw" ? "brotherInLaw" : "sisterInLaw", note: "childInLawSpouse" };
        return { key: otherRole === "son" ? "husbandOrBrotherInLaw" : "wifeOrSisterInLaw", note: "childInLawUnknown" };
      }
      if (SPOUSE.has(otherRole)) return { key: g("fatherInLaw", "motherInLaw", "parentInLaw"), note: "childInLawParent" };
    }
    return null;
  }

  const IN_LAW_SIBLING = new Set(["brotherInLaw", "sisterInLaw"]);

  // An in-law who shares the wife's surname is very likely her brother or sister. Returns null otherwise.
  function sharedSurnameRelation(subject, member, wife) {
    if (!wife) return null;
    const wifeSurname = surnameKey(wife.name);
    if (!wifeSurname) return null;
    const g = (male, female, neutral) => gendered(member.sex, male, female, neutral);
    const shares = person => IN_LAW_SIBLING.has(person.role) && surnameKey(person.name) === wifeSurname;
    if (subject.role === "wife" && shares(member)) return { key: g("brother", "sister", "sibling"), note: "inLawShares" };
    if (shares(subject)) {
      if (member.position === wife.position) return { key: "sister", note: "inLawShares" };
      if (shares(member)) return { key: g("brother", "sister", "sibling"), note: "inLawShares" };
      if (CHILD.has(member.role)) return { key: g("nephew", "niece", "nephewOrNiece"), note: "inLawShares" };
    }
    if (CHILD.has(subject.role) && shares(member)) return { key: g("uncle", "aunt", "uncleOrAunt"), note: "inLawShares" };
    return null;
  }

  function surnameKey(name) {
    return normalized(surnameOf(name));
  }

  function placeOf(record) {
    const place = parser().canonicalPlace(record.residence?.place || "No residence listed");
    return /^(?:no residence listed|not listed)$/i.test(place.key) ? null : place;
  }

  // Names bordering a household's landholdings, read from its landholding clauses the way the
  // Landholdings view reads them.
  function landNeighborNames(record) {
    const P = parser();
    const entry = String(record.source_entry || "").replace(/[ \t]*\n(?=[ \t]*(?:Più\s+)?(?:Possiede|Paga|Abita|Habita|Riporto|Pesi|Un['’]altr[ao]|Un|Una|Altr[ao])\b)/g, "\n\n");
    const names = new Map();
    P.sentenceList(entry).forEach(sentence => {
      let adjacent = [];
      if (P.isItalianLandholdingSentence(sentence)) {
        adjacent = P.parseItalianLandholding(sentence).adjacent_to || [];
      } else if (/\b(?:possesses|owns|also owns|landholding|property called|garden|vineyard|chestnut grove|grove|portion of land)\b/i.test(sentence) &&
        /\bbordering\b/i.test(sentence) && !/\b(?:lives|resides|dwells|inhabits)\b/i.test(sentence)) {
        const border = sentence.match(/\bbordering\s+(?:the )?(?:property|properties)?\s*(?:of)?\s*([\s\S]*?)(?:;|\.|$)/i);
        adjacent = border ? P.expandNeighborNames(border[1]) : [];
      }
      adjacent.filter(name => name && !P.isPublicAnchor(name)).forEach(name => names.set(P.personKey(name), name));
    });
    names.delete(P.personKey(record.household_head));
    return names;
  }

  // Lookup tables for one loaded project, built once and reused for every report.
  const indexes = new WeakMap();

  function projectIndex(data) {
    if (indexes.has(data)) return indexes.get(data);
    const P = parser();
    const records = Array.isArray(data?.households) ? data.households : [];
    const byId = new Map(records.map(record => [record.id, record]));
    const byHeadName = new Map();
    const inbound = new Map();
    records.forEach(record => {
      const key = P.personKey(record.household_head);
      if (!byHeadName.has(key)) byHeadName.set(key, []);
      byHeadName.get(key).push(record);
    });
    records.forEach(record => {
      neighborLinks(record, byHeadName).forEach(link => {
        if (!link.householdId || link.householdId === record.id) return;
        if (!inbound.has(link.householdId)) inbound.set(link.householdId, []);
        inbound.get(link.householdId).push({ from: record, link });
      });
    });
    const headsBySurname = new Map();
    const graph = new Map(records.map(record => [record.id, new Set()]));
    const land = new Map();
    const landInbound = new Map();
    records.forEach(record => {
      const surname = surnameKey(record.household_head);
      if (surname) {
        if (!headsBySurname.has(surname)) headsBySurname.set(surname, []);
        headsBySurname.get(surname).push(record);
      }
      neighborLinks(record, byHeadName).forEach(link => {
        if (!link.householdId || link.householdId === record.id || !graph.has(link.householdId)) return;
        graph.get(record.id).add(link.householdId);
        graph.get(link.householdId).add(record.id);
      });
      const names = landNeighborNames(record);
      land.set(record.id, names);
      names.forEach((name, key) => {
        if (!landInbound.has(key)) landInbound.set(key, []);
        landInbound.get(key).push(record);
      });
    });
    const index = { records, byId, byHeadName, inbound, headsBySurname, graph, land, landInbound, members: new Map(), women: null };
    indexes.set(data, index);
    return index;
  }

  // Women recorded under their own surname in other households: wives, and widows heading a household.
  function womenBySurname(index) {
    if (index.women) return index.women;
    index.women = new Map();
    index.records.forEach(record => {
      membersOf(index, record).forEach(member => {
        const widowHead = member.position === 0 && member.sex === "female" && /\b(?:vedova|widow)\b/i.test(member.sourceLine);
        if (member.role !== "wife" && !widowHead) return;
        const surname = surnameKey(member.name);
        if (!surname) return;
        if (!index.women.has(surname)) index.women.set(surname, []);
        index.women.get(surname).push({ record, member, widowHead });
      });
    });
    return index.women;
  }

  // A household's named residence neighbors, using the stored identity links where present.
  function neighborLinks(record, byHeadName) {
    const P = parser();
    const links = Array.isArray(record.residence_links) ? record.residence_links : [];
    if (links.length) {
      return links
        .filter(link => link && typeof link.name === "string" && link.name && link.kind !== "public-anchor" && !P.isPublicAnchor(link.name))
        .map(link => ({
          name: link.name,
          householdId: ["resolved", "inferred"].includes(link.resolution_status) ? link.household_id || null : null,
          status: link.resolution_status || (link.household_id ? "resolved" : "unresolved"),
          candidateIds: Array.isArray(link.candidate_household_ids) ? link.candidate_household_ids : []
        }));
    }
    return (record.residence?.adjacent_to || [])
      .filter(name => typeof name === "string" && name && !P.isPublicAnchor(name))
      .map(name => {
        const candidates = byHeadName.get(P.personKey(name)) || [];
        return {
          name,
          householdId: candidates.length === 1 ? candidates[0].id : null,
          status: candidates.length === 1 ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved",
          candidateIds: candidates.map(candidate => candidate.id)
        };
      });
  }

  function membersOf(index, record) {
    if (index.members.has(record.id)) return index.members.get(record.id);
    const P = parser();
    const headSurname = surnameOf(record.household_head);
    const members = memberLinesOf(record).map((line, position) => {
      const role = position === 0 ? "head" : roleOf(line);
      const rawName = position === 0 ? record.household_head : P.memberPersonName(line);
      return {
        position,
        name: position === 0 ? record.household_head : fullName(rawName, headSurname),
        role,
        age: ageOf(line),
        description: descriptionOf(line, role),
        sourceLine: line
      };
    });
    if (!members.length) {
      members.push({ position: 0, name: record.household_head, role: "head", age: null, description: "", sourceLine: record.household_head });
    }
    const headSex = headSexOf(members);
    members.forEach(member => { member.sex = sexOf(member, headSex); });
    index.members.set(record.id, members);
    return members;
  }

  function pagesText(S, record) {
    const pages = [...new Set((record?.source_pages || []).filter(Number.isFinite))].sort((a, b) => a - b);
    if (!pages.length) return "";
    const text = pages.map(S.page).join(", ");
    return record.source_pages_inferred ? `${text} (${S.inferred})` : text;
  }

  // " (p. 5)", or nothing when the record has no page numbers.
  function cite(pages) {
    return pages ? ` (${pages})` : "";
  }

  function describe(S, member) {
    const age = member.age === "infant" ? S.infant : member.age ? S.age(member.age) : "";
    return [member.description, age].filter(Boolean).join(", ");
  }

  function line(text, extra = {}) {
    return { text, ...extra };
  }

  // Clickable names. Each link names a substring of its line and the person it leads to: someone listed
  // in a household entry ({ householdId, position }) or someone known only by name ({ name, candidateIds }).
  function headLink(record, label = record.household_head) {
    return { label, target: { householdId: record.id, position: 0 } };
  }

  function memberLink(recordId, member) {
    return { label: member.name, target: { householdId: recordId, position: member.position } };
  }

  function nameLink(name, candidateIds) {
    return { label: name, target: { name, candidateIds } };
  }

  function familySections(S, members, subject, recordId) {
    const first = [];
    const second = [];
    const others = [];
    const head = members[0];
    members.forEach(member => {
      if (member.position === subject.position) return;
      let key = null;
      let note = null;
      if (subject.position === 0) {
        key = member.role;
      } else if (member.position === 0) {
        key = headRelativeTo(subject.role, head.sex);
      } else {
        const wife = members.find(person => person.role === "wife");
        const derived = sharedSurnameRelation(subject, member, wife) || derivedRelation(subject.role, member.role, member.sex);
        if (derived) ({ key, note } = derived);
      }
      const details = describe(S, member);
      const label = key && !NOT_KIN.has(key) ? S.relations[key] : null;
      if (!label) {
        const stated = member.position === 0 ? null : member.role === "nipote" ? S.nipoteShort : S.relations[member.role];
        const text = `${member.name}${details ? `, ${details}` : ""}${stated && member.role !== "member" ? ` (${S.ofHead(stated.toLowerCase())})` : ""}`;
        others.push(line(text, { links: [memberLink(recordId, member)] }));
        return;
      }
      const entry = line(`${label}: ${member.name}${details ? `, ${details}` : ""}`, {
        links: [memberLink(recordId, member)],
        derived: note ? `${S.derived}: ${S.notes[note]}` : null
      });
      (FIRST_DEGREE.has(key) ? first : second).push(entry);
    });
    return { first, second, others };
  }

  function neighborSection(S, index, record) {
    const items = [];
    const outbound = neighborLinks(record, index.byHeadName);
    const inbound = index.inbound.get(record.id) || [];
    const ownPages = pagesText(S, record);
    const seen = new Set();
    outbound.forEach(link => {
      const target = link.householdId ? index.byId.get(link.householdId) : null;
      if (target) {
        if (seen.has(target.id)) return;
        seen.add(target.id);
        const mutual = inbound.some(item => item.from.id === target.id);
        const pages = cite([ownPages, mutual ? pagesText(S, target) : ""].filter(Boolean).join(", "));
        const note = link.status === "inferred" ? `; ${S.identifiedByNeighbors}` : "";
        items.push(line(`${link.name} — ${mutual ? S.mutualNeighbor(pages) : S.namedNeighbor(pages)}${note}`, { household: target.id, links: [headLink(target, link.name)] }));
        return;
      }
      const reason = link.status === "ambiguous" || link.candidateIds.length > 1
        ? S.ambiguousHeads(link.candidateIds.length || 2)
        : S.noHouseholdEntry;
      items.push(line(`${link.name} — ${S.namedNeighbor(cite(ownPages))}; ${reason}`, { name: link.name, links: [nameLink(link.name, link.candidateIds)] }));
    });
    inbound.forEach(({ from }) => {
      if (seen.has(from.id)) return;
      seen.add(from.id);
      items.push(line(`${from.household_head} — ${S.namesThisHousehold(cite(pagesText(S, from)))}`, { household: from.id, links: [headLink(from)] }));
    });
    return items;
  }

  function landSection(S, index, record) {
    const P = parser();
    const items = [];
    const ownPages = cite(pagesText(S, record));
    const listed = new Set();
    (index.land.get(record.id) || new Map()).forEach((name, key) => {
      listed.add(key);
      const heads = (index.byHeadName.get(key) || []).filter(head => head.id !== record.id);
      const reason = heads.length > 1 ? `; ${S.ambiguousHeads(heads.length)}` : heads.length ? "" : `; ${S.noHouseholdEntry}`;
      items.push(line(`${name} — ${S.bordersLand(ownPages)}${reason}`, heads.length === 1
        ? { household: heads[0].id, links: [headLink(heads[0], name)] }
        : { name, links: [nameLink(name, heads.map(head => head.id))] }));
    });
    const headKey = P.personKey(record.household_head);
    const sameName = (index.byHeadName.get(headKey) || []).length;
    (index.landInbound.get(headKey) || []).forEach(from => {
      if (from.id === record.id || listed.has(P.personKey(from.household_head))) return;
      const reason = sameName > 1 ? `; ${S.maybeSomeoneElse(sameName)}` : "";
      items.push(line(`${from.household_head} — ${S.namesHeadLand(cite(pagesText(S, from)))}${reason}`, { household: from.id, links: [headLink(from)] }));
    });
    return items;
  }

  function thirdDegree(S, residence, land, isHead) {
    return [
      line(isHead ? S.residenceHeading : S.householdResidenceHeading, { kind: "subheading" }),
      ...(residence.length ? residence : [line(S.noResidenceNeighbors, { kind: "empty" })]),
      line(isHead ? S.landHeading : S.householdLandHeading, { kind: "subheading" }),
      ...(land.length ? land : [line(S.noLandNeighbors, { kind: "empty" })])
    ];
  }

  // A missing age is unknown, not zero, so it never counts as a clue. An infant is age 0, as in the exports.
  function ageNumber(member) {
    const value = member?.age;
    if (typeof value === "string" && /^\s*(?:infant|infante)\s*$/i.test(value)) return 0;
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const age = Number(value);
    return Number.isFinite(age) ? age : null;
  }

  // Ranks the households headed by one surname as possible family of the subject, from independent clues.
  function leadGroup(S, index, record, subject, surname, kind, label, surnameLabel = label) {
    const P = parser();
    const heads = index.headsBySurname.get(surname) || [];
    const candidates = heads.filter(candidate => candidate.id !== record.id);
    if (!candidates.length) return [];
    const neighbors = index.graph.get(record.id) || new Set();
    const ownLand = index.land.get(record.id) || new Map();
    const ownResidenceNames = new Set(neighborLinks(record, index.byHeadName).filter(link => !link.householdId).map(link => P.personKey(link.name)));
    const place = placeOf(record);
    const subjectAge = kind === "lateHusband" ? null : ageNumber(subject);
    const scored = candidates.map(candidate => {
      const clues = [];
      let score = 0;
      const candidateKey = P.personKey(candidate.household_head);
      if (neighbors.has(candidate.id)) {
        clues.push(S.clue.neighbor); score += 3;
      } else if (ownResidenceNames.has(candidateKey)) {
        clues.push(S.clue.namedNeighbor); score += 1;
      } else {
        const via = [...neighbors].find(id => index.graph.get(id)?.has(candidate.id));
        if (via) { clues.push(S.clue.twoStep(index.byId.get(via).household_head)); score += 2; }
      }
      if (ownLand.has(candidateKey) || index.land.get(candidate.id)?.has(P.personKey(record.household_head))) {
        clues.push(S.clue.land); score += 2;
      }
      const candidatePlace = placeOf(candidate);
      if (place && candidatePlace && candidatePlace.key === place.key) { clues.push(S.clue.district(place.label)); score += 1; }
      const candidateAge = ageNumber(membersOf(index, candidate)[0]);
      if (subjectAge !== null && candidateAge !== null) {
        const gap = candidateAge - subjectAge;
        if (gap >= 16 && gap <= 50) { clues.push(S.clue.olderAge(candidateAge)); score += 1; }
        else if (Math.abs(gap) <= 15) { clues.push(S.clue.closeAge(candidateAge)); score += 1; }
        else if (gap <= -16) clues.push(S.clue.youngerAge(candidateAge));
      }
      const sameName = (index.byHeadName.get(candidateKey) || []).length;
      if (sameName > 1) clues.push(S.clue.sameName(sameName));
      return { candidate, clues, score };
    });
    const rarity = heads.length <= 2 ? 1 : heads.length >= 10 ? -1 : 0;
    scored.forEach(item => { item.score += rarity; });
    scored.sort((a, b) => b.score - a.score || a.candidate.household_head.localeCompare(b.candidate.household_head));
    const intro = kind === "lateHusband" ? S.lateHusband(label, candidates.length) : S[kind](label, candidates.length);
    const rarityClue = rarity > 0 ? S.clue.rareSurname(heads.length) : rarity < 0 ? S.clue.commonSurname(heads.length) : null;
    const items = [line(intro, { kind: "subheading" })];
    const shown = scored.filter(item => item.score >= 2).slice(0, 8);
    shown.forEach(({ candidate, clues, score }) => {
      const strength = score >= 4 ? "strong" : "moderate";
      const head = membersOf(index, candidate)[0];
      const details = describe(S, head);
      const where = placeOf(candidate)?.label;
      items.push(line(`${S.strength[strength]}: ${candidate.household_head}${details ? `, ${details}` : ""}${where ? ` — ${where}` : ""}${cite(pagesText(S, candidate))}`, {
        kind: "lead", strength, household: candidate.id, links: [headLink(candidate)], clues: rarityClue ? [...clues, rarityClue] : clues
      }));
    });
    const rest = scored.filter(item => !shown.includes(item));
    if (rest.length) {
      const list = rest.slice(0, 10).map(({ candidate }) => {
        const where = placeOf(candidate)?.label;
        return `${candidate.household_head}${where || pagesText(S, candidate) ? ` (${[where, pagesText(S, candidate)].filter(Boolean).join(", ")})` : ""}`;
      });
      if (rest.length > 10) list.push(S.andMore(rest.length - 10));
      items.push(line(`${S.strength.weak}. ${S.onlySurname(surnameLabel, list.join("; "))}`, {
        kind: "lead", strength: "weak", links: rest.slice(0, 10).map(({ candidate }) => headLink(candidate))
      }));
    }
    return items;
  }

  // Other women of the surname: possible sisters, aunts, or cousins married into other households.
  function womenGroup(S, index, record, surname, label) {
    const women = (womenBySurname(index).get(surname) || []).filter(item => item.record.id !== record.id);
    if (!women.length) return [];
    const heads = new Set((index.headsBySurname.get(surname) || []).map(head => head.id));
    const items = [line(S.women(label), { kind: "subheading" })];
    women.slice(0, 8).forEach(({ record: home, member, widowHead }) => {
      const details = describe(S, member);
      const where = placeOf(home)?.label;
      const role = widowHead ? S.womanWidow : S.womanIn(S.relations.wife.toLowerCase(), home.household_head);
      const nextTo = [...(index.graph.get(home.id) || [])].find(id => heads.has(id));
      items.push(line(`${member.name}${details ? `, ${details}` : ""} — ${role}${where ? `, ${where}` : ""}${cite(pagesText(S, home))}`, {
        household: home.id,
        links: widowHead ? [memberLink(home.id, member)] : [memberLink(home.id, member), headLink(home)],
        clues: nextTo ? [S.livesNextTo(index.byId.get(nextTo).household_head)] : []
      }));
    });
    if (women.length > 8) items.push(line(S.andMore(women.length - 8), { kind: "empty" }));
    return items;
  }

  function familyLeads(S, index, record, members, subject) {
    const items = [];
    const subjectSurname = surnameKey(subject.name);
    const headSurname = surnameKey(members[0].name);
    const surnameLabel = name => surnameOf(name);
    // A widow heading her household is recorded under her birth surname, as wives are.
    const widowHead = subject.position === 0 && subject.sex === "female" && /\b(?:vedova|widow)\b/i.test(subject.sourceLine);
    if (subjectSurname) {
      const kind = !widowHead && (subject.position === 0 || subjectSurname === headSurname) ? "relatives" : "birthFamily";
      items.push(...leadGroup(S, index, record, subject, subjectSurname, kind, surnameLabel(subject.name)));
    }
    const late = subject.position === 0 && subject.sourceLine.match(/\b(?:widow\s+of(?:\s+the\s+late)?|vedova\s+(?:del\s+fu|di|del|dello|della))\s+([A-ZÀ-Ý][^,;—–\n]*?)(?=\s*(?:[,;—–]|\bage(?:d)?\b|\banni\b|$))/i)?.[1]?.trim();
    const lateSurname = late ? surnameKey(late) : "";
    if (lateSurname && lateSurname !== subjectSurname) items.push(...leadGroup(S, index, record, subject, lateSurname, "lateHusband", late, surnameOf(late)));
    if (subjectSurname) items.push(...womenGroup(S, index, record, subjectSurname, surnameLabel(subject.name)));
    return items;
  }

  function section(key, heading, items, emptyText, extra = []) {
    return { key, heading, items: [...items, ...extra], emptyText: items.length ? null : emptyText };
  }

  function sourceTitleOf(options, data) {
    return options.sourceTitle || data?.source_title || "Catasto";
  }

  function recordReport(S, index, record, position, options, data) {
    const members = membersOf(index, record);
    const subject = members.find(member => member.position === position) || members[0];
    const head = members[0];
    const summary = [];
    const details = describe(S, subject);
    if (details) summary.push(line(`${subject.name}, ${details}.`));
    if (subject.position === 0) {
      summary.push(line(S.headOf(members.length)));
    } else {
      const stated = S.relations[subject.role];
      summary.push(line(subject.role === "member" ? S.memberOfUnstated(head.name, members.length) : S.memberOf(stated, head.name, members.length), {
        links: [memberLink(record.id, head)]
      }));
    }
    // The district name the Visualizer shows, so the report and the 3D view agree.
    const residencePlace = placeOf(record)?.label || record.residence?.place;
    summary.push(line(residencePlace ? S.livesIn(residencePlace) : S.noResidence));
    const pages = pagesText(S, record);
    if (pages) summary.push(line(S.source(sourceTitleOf(options, data), pages)));

    const family = familySections(S, members, subject, record.id);
    const leads = familyLeads(S, index, record, members, subject);
    const neighbors = thirdDegree(S, neighborSection(S, index, record), landSection(S, index, record), subject.position === 0);
    const sections = [
      section("first", S.degree1, family.first, S.noneStated),
      section("second", S.degree2, family.second, S.noneStated),
      section("leads", S.leads, leads.length ? [line(S.leadsIntro, { kind: "note" }), ...leads] : [], S.noLeads),
      section("third", S.degree3, neighbors, null)
    ];
    if (family.others.length) sections.splice(3, 0, section("others", S.others, family.others, null));
    return { subjectName: subject.name, householdId: record.id, position: subject.position, summary, sections };
  }

  // A person known only from other entries: where they are named, and which households might be theirs.
  // Money paid is not proximity: a sentence that pays someone (rent, interest, a deduction) never counts as
  // a mention of them. Deductions lists name the person paid at the start: "To the Most Illustrious…".
  // Money words, shared with search (app.js), so a name the report leaves out as a payment is also classed
  // as a financial reference there: paying, owing, collecting, receiving, and their Italian forms.
  const FINANCIAL = /\b(?:pays?|paid|paying|payments?|owes?|owed|rent|principal|interest|debt|debtor|deductions?|liabilit(?:y|ies)|burden(?:ed)?|creditor|collect(?:s|ed|ing)?|receiv(?:es?|ed|ing)|paga|pagano|pagare|pagamento|affitto|censo|capitale|debito|debitore|creditore|interesse|pesi|esig\w*|riscuot\w*)\b/i;
  const PAYEE = /^\s*(?:to|al|alla|allo|alli|ai|agli|alle)\s/i;

  function isPaymentSentence(sentence) {
    const text = String(sentence || "").trim();
    return FINANCIAL.test(text) || PAYEE.test(text);
  }

  function referenceReport(S, index, subject) {
    const P = parser();
    const name = String(subject.name || "").trim();
    const key = P.personKey(name);
    const needle = normalized(name);
    const summary = [line(name), line(S.noEntry)];
    // Without stored candidates, any household head with the same name might be this person.
    const candidateIds = Array.isArray(subject.candidateIds) ? subject.candidateIds : (index.byHeadName.get(key) || []).map(record => record.id);
    const candidates = candidateIds.map(id => index.byId.get(id)).filter(Boolean);
    if (candidates.length) {
      summary.push(line(candidates.length === 1 ? S.couldBeOne : S.couldBe));
      candidates.forEach(record => summary.push(line(`${record.household_head}${cite(pagesText(S, record))}`, { household: record.id, links: [headLink(record)] })));
    }
    const neighborOf = [];
    const landOf = (index.landInbound.get(key) || []).map(record =>
      line(`${record.household_head} — ${S.namesThemLand(cite(pagesText(S, record)))}`, { household: record.id, links: [headLink(record)] }));
    const mentions = [];
    index.records.forEach(record => {
      const named = neighborLinks(record, index.byHeadName).some(link => P.personKey(link.name) === key);
      if (named) {
        neighborOf.push(line(`${record.household_head} — ${S.namesThem(cite(pagesText(S, record)))}`, { household: record.id, links: [headLink(record)] }));
      } else if (needle && !landOf.some(item => item.household === record.id) &&
        P.sentenceList(String(record.source_entry || "")).some(sentence => !isPaymentSentence(sentence) && normalized(sentence).includes(needle))) {
        mentions.push(line(S.mentionedIn(record.household_head, cite(pagesText(S, record))), { household: record.id, links: [headLink(record)] }));
      }
    });
    summary.push(...mentions);
    return {
      subjectName: name,
      householdId: null,
      position: null,
      summary,
      sections: [
        section("first", S.degree1, [], S.noFamilyListed),
        section("second", S.degree2, [], S.noFamilyListed),
        section("third", S.degree3, thirdDegree(S, neighborOf, landOf, true), null)
      ]
    };
  }

  // subject: { householdId, position } for someone listed in a household entry (position 0 is the head),
  // or { name, candidateIds } for someone named only in other entries.
  function buildPersonReport(data, subject, options = {}) {
    const S = STRINGS[options.language] || STRINGS.en;
    const index = projectIndex(data);
    const record = subject?.householdId ? index.byId.get(subject.householdId) : null;
    const report = record
      ? recordReport(S, index, record, Number.isInteger(subject.position) ? subject.position : 0, options, data)
      : referenceReport(S, index, subject || {});
    return { ...report, title: S.title };
  }

  // The people a household entry names, as clickable links for the source text: the head and members
  // (each with its source line, so a repeated first name finds the right person), then residence and
  // land neighbors, resolved to a household where the record allows.
  function sourceEntryLinks(data, recordId) {
    const P = parser();
    const index = projectIndex(data);
    const record = index.byId.get(recordId);
    if (!record) return [];
    const links = membersOf(index, record).map(member => ({
      label: member.position === 0 ? record.household_head : P.memberPersonName(member.sourceLine),
      line: member.sourceLine,
      target: { householdId: record.id, position: member.position }
    })).filter(link => link.label);
    const seen = new Set(links.map(link => P.personKey(link.label)));
    neighborLinks(record, index.byHeadName).forEach(link => {
      const key = P.personKey(link.name);
      if (seen.has(key)) return;
      seen.add(key);
      links.push(link.householdId && index.byId.has(link.householdId)
        ? { label: link.name, target: { householdId: link.householdId, position: 0 } }
        : nameLink(link.name, link.candidateIds));
    });
    (index.land.get(record.id) || new Map()).forEach((name, key) => {
      if (seen.has(key)) return;
      seen.add(key);
      const heads = (index.byHeadName.get(key) || []).filter(head => head.id !== record.id);
      links.push(heads.length === 1 ? headLink(heads[0], name) : nameLink(name, heads.map(head => head.id)));
    });
    return links;
  }

  function reportToText(report) {
    const lines = [`${report.title.toUpperCase()}: ${report.subjectName}`, ...report.summary.map(item => item.text)];
    report.sections.forEach(part => {
      lines.push("", part.heading.toUpperCase());
      if (part.emptyText) lines.push(part.emptyText);
      part.items.forEach(item => {
        lines.push(item.text);
        if (item.derived) lines.push(`  (${item.derived})`);
        (item.clues || []).forEach(clue => lines.push(`  - ${clue}`));
      });
    });
    return lines.join("\n");
  }

  window.CatastoRelations = { buildPersonReport, reportToText, roleOf, sourceEntryLinks, descriptionOf, landNeighborNames, isPaymentSentence };
}());
