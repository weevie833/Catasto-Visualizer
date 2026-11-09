// Name Index / Indice Onomastico: every person named in a project, as a lexicon for other projects.
// Built from the stored source entries when Admin exports it; never saved. The plan is in NAME_INDEX_PLAN.md.
(function () {
  "use strict";

  const P = () => window.CatastoParser;
  const R = () => window.CatastoRelations;

  const NAME = String.raw`[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’]*`;
  const PARTICLE = /^(?:di|de|del|della|dello|da|dal|dalla|lo|la|le|li|d'|d’)$/i;
  // Titles written before a name. "Marchese"/"Marchesa" are also given names, so they count as titles
  // only before a particle surname ("Marchesa della Valle") or another title.
  const HONORIFIC = /^(?:Most|Excellent|Excellency|Illustrious|Illustrius|Magnificent|Magnific[oa]|Reverend[oa]?|Venerable|Venerabile|Noble(?:man|woman)?|Nobile|Master|Mastro|Maestro|Don|Donna|Dona|D\.|Dr\.?|Doctor|Dottor|Priest|Sacerdote|Father|Padre|Sister|Suor[ae]?|Fra|Frate|Lady|Lord|Holy|Signor[ae]?|Cleric|C(?:h)?ierico|Cherico|Illustre)$/i;
  const NOBLE_TITLE = /^(?:Marchese|Marchesa)$/i;
  const TITLE_ONLY = /^(?:Prince|Princess|Duke|Duchess|Count|Countess|Baron|Baroness|Lord|Lady|Holy|Most)$/i;
  // Words that name a body rather than a person. Conte, Principe, and Santo are also names here, so saints'
  // names count only after "of" ("Chapel of San Rocco").
  const INSTITUTION = /\b(?:Clergy|Clero|Chapel|Cappella|Congregation|Congregazione|Monastery|Monastero|Convent|Convento|Confraternity|Confraternita|Chamber|Camera|Monte\s+(?:di|della|dei)|Fund|Church|Chiesa|Count|Duke|Duca|Princes|Princess|Baron|Barone|Court|Corte|Mensa|Abbey|Badia|Benefice|Beneficio|Chaplaincy|Cappellania|Chapter|Capitolo|Seminary|Seminario|Parish|Parrocchia|University|Università|Universit[aà]|Hospital|Ospedale|Brotherhood|Altar|Altare|Cathedral|Bishop|Vescovo|Archbishop|Curia|Family|Famiglia|Treasury|Royal|Regia|Purgatory|Purgatorio|Rosary|Rosario|Sacrament|Sacramento|Souls|Anime|Commune|Fisc|Mount|Fathers|Jesuits?|Friars|Nuns|Monks|Heirs?)\b|^Most\s+Holy\b(?!\s+Lady)|\b(?:of|di|del|della)\s+(?:San|Santa|Santo|Saint|Holy|Santissim[oa]|SS?\.)\b/;
  // Regular expressions that include NAME or PLACE are case-sensitive, so lowercase words never join a name.
  const LOCALITY = String.raw`(?:[Ll]and|[Cc]ity|[Cc]asale|[Pp]lace|[Tt]own|[Vv]illage|[Tt]erra|[Cc]ittà|[Cc]itta|[Ll]uogo)`;
  const PLACE = String.raw`${NAME}(?:\s+(?:${NAME}|di|de|del|della))*?`;

  // Clauses whose following words name people. Each match starts a list ended by the stop pattern.
  const TRIGGERS = [
    String.raw`\bbordering(?:\s+on)?`, String.raw`\bborders`, String.raw`\bbordered\s+by`, String.raw`\badjacent\s+to`,
    String.raw`\bnext\s+to`, String.raw`\bcontiguous\s+(?:to|with)`, String.raw`\bconfining\s+with`,
    String.raw`\bpays?\s+(?:to|from)`, String.raw`\bpaid\s+to`, String.raw`\bpayable\s+to`, String.raw`\bowed\s+to`,
    String.raw`\bdue\s+to`, String.raw`\bcorresponds\s+to`, String.raw`\b(?:debt|liability|weight)\s+(?:\[[^\]]*\]\s+)?to`,
    String.raw`\bcollects?\s+from`, String.raw`\breceives?\s+from`, String.raw`(?:^|[.:]\s+)(?:To|From)`,
    String.raw`\bhouses?\s+of`, String.raw`\bbelonging\s+to`, String.raw`\brented\s+from`,
    String.raw`\bgiusta\s+(?:li\s+)?beni\s+di`, String.raw`\bconfin[ae]\w*(?:\s+(?:con|a(?:lli?|i|gli)?\s+beni\s+di))?`,
    String.raw`\bcontigu[oa]\s+(?:alli\s+beni\s+di)?`, String.raw`\bpaga\s+(?:a|al|alla|alli|ai)`, String.raw`\besige\s+da`
  ];
  const TRIGGER = new RegExp(`(?:${TRIGGERS.join("|")})\\s+`, "g");
  const LIST_STOP = /[;.:—–=]|\s+(?:for|with|as|at|in|who|which|whose|from|per|con|sopra|stimat\w*|the\s+annual|an\s+annual|annual|of\s+(?:a|an|one|the\s+capacity)|capital|principal|carlini|ducats?|ducati|oncie|ounces?|grana|which|that)\b|\s+\d|,\s+(?:the|an?|with|which|for|per|stimata)\b/i;

  function clean(value) {
    return String(value || "").replace(/\\/g, "").replace(/\[\[SOURCE_PAGE:\d+\]\]/g, " ")
      .replace(/\[[^\]]*\]/g, " ").replace(/\*+/g, "").replace(/\s+/g, " ").trim();
  }

  function key(value) {
    return String(value || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
  }

  // "Marano Marchesato 1754" names the village Marano Marchesato.
  function suggestedVillage(data) {
    return clean(data?.source_title).replace(/\b\d{3,4}\b.*$/, "").replace(/[,:;\s-]+$/, "").trim();
  }

  // Places named as "of the Land of Rende" or "della Città di Cosenza" anywhere in the project.
  function knownPlaces(households) {
    const places = new Map();
    const pattern = new RegExp(String.raw`\b(?:of\s+(?:the|this)\s+${LOCALITY}\s+of|(?:della|dalla|di\s+questa)\s+${LOCALITY}\s+(?:di|de))\s+(${PLACE})(?=[\s,;.:—–)]|$)`, "g");
    households.forEach(record => {
      for (const match of clean(record.source_entry).matchAll(pattern)) places.set(key(match[1]), match[1]);
    });
    return places;
  }

  function makeContext(data, village) {
    const households = Array.isArray(data?.households) ? data.households : [];
    const places = knownPlaces(households);
    const villageKey = key(village);
    // A place written as the first word(s) of the village ("this City of Marano") is the village.
    const placeName = raw => {
      const name = clean(raw);
      if (!name) return village;
      const nameKey = key(name);
      if (nameKey === villageKey || (villageKey.startsWith(`${nameKey} `) && !places.has(`${nameKey} principato`))) return village;
      return places.get(nameKey) || name;
    };
    return { households, places, village, placeName, givenNames: givenNamesListedAlone(households) };
  }

  // Given names written alone on member lines ("Pietro, son"), so "Francesco Antonio, son" reads as one
  // compound given name rather than Francesco of the Antonio family.
  function givenNamesListedAlone(households) {
    const names = new Set();
    households.forEach(record => memberLines(record).slice(1).forEach(line => {
      const name = splitName(P().memberPersonName(clean(line)).replace(/\s+(?:son|daughter|figli[oa])\s+.*$/i, ""));
      if (name && !name.surname) names.add(key(name.given));
    }));
    return names;
  }

  // Reads a trailing origin ("of this Land", "of the City of Cosenza", "della Terra di Rende", "of Rende").
  function splitOrigin(text, context) {
    const locality = new RegExp(String.raw`,?\s+(?:[Oo]f\s+(?:[Tt]his|[Tt]he)\s+${LOCALITY}(?:\s+of\s+(${PLACE}))?|(?:della|dalla|di)\s+(?:questa\s+)?${LOCALITY}(?:\s+(?:di|de)\s+(${PLACE}))?)\s*,?$`);
    const match = text.match(locality);
    if (match) {
      const named = match[1] || match[2];
      const thisPlace = /\b(?:this|questa)\b/i.test(match[0]);
      return { text: text.slice(0, match.index).trim(), location: named ? context.placeName(named) : thisPlace ? context.village : context.village };
    }
    const bare = text.match(new RegExp(String.raw`,?\s+(?:of|di)\s+(${PLACE})\s*,?$`));
    if (bare && (context.places.has(key(bare[1])) || key(bare[1]) === key(context.village))) {
      return { text: text.slice(0, bare.index).trim(), location: context.placeName(bare[1]) };
    }
    return { text, location: null };
  }

  // "son of the late Francesco", "widow of Natale Cosentino", "figlio del fu Antonio", "di Giuseppe".
  const KIN = String.raw`((?:(?:[Ss]on|[Dd]aughter|[Ww]idow|[Ww]ife|[Ff]igli[oa]|[Vv]edova|[Mm]oglie)\s+)?(?:of(?:\s+the\s+late)?|del(?:la|lo)?(?:\s+fu)?|di|fu)\s+(${NAME}(?:\s+(?:${NAME}|di|de|del|della|lo|la)(?=\s+${NAME}|\s*$|\s*[,;—–]))*))`;
  const QUALIFIER = new RegExp(String.raw`,?\s*\b(?=[Ss]on\b|[Dd]aughter\b|[Ww]idow\b|[Ff]igli[oa]\b|[Vv]edova\b|del\s+fu\b|fu\b)${KIN}`);

  function splitQualifier(text) {
    const match = text.match(new RegExp(String.raw`,?\s+((?:[Ss]on|[Dd]aughter|[Ww]idow|[Ww]ife|[Ff]igli[oa]|[Vv]edova|[Mm]oglie)\s+(?:of(?:\s+the\s+late)?|del(?:la|lo)?(?:\s+fu)?|di|fu)\s+(${NAME}(?:\s+(?:${NAME}|di|de|del|della|lo|la))*))\s*,?$`));
    if (!match) return { text, qualifier: "", relative: "" };
    return { text: text.slice(0, match.index).trim(), qualifier: match[1].replace(/\s+/g, " ").trim(), relative: match[2].trim() };
  }

  // Splits "Reverend Don Giovanni Battista di Rangho" into title, given name, and surname.
  function splitName(text) {
    const tokens = clean(text).replace(/[,;]+$/, "").split(/\s+/).map(token => token.replace(/['’]+$/, "")).filter(Boolean);
    const titles = [];
    while (tokens.length > 1) {
      const next = tokens[1];
      if (HONORIFIC.test(tokens[0]) || (NOBLE_TITLE.test(tokens[0]) && (PARTICLE.test(next) || HONORIFIC.test(next) || NOBLE_TITLE.test(next)))) {
        titles.push(tokens.shift());
      } else {
        break;
      }
    }
    const nameTokens = tokens.filter(Boolean);
    if (!nameTokens.length || nameTokens.some(token => !PARTICLE.test(token) && !/^[A-ZÀ-ÖØ-Ý]/.test(token))) return null;
    // A title with no personal name ("Most Illustrious Lord Prince"), or a saint's name cut short.
    if (nameTokens.some(token => TITLE_ONLY.test(token) || /^(?:San|Saint|SS?\.?)$/.test(token)) || /^Santa$/i.test(nameTokens[nameTokens.length - 1])) return null;
    const honorific = titles.map(title => title.charAt(0).toUpperCase() + title.slice(1)).join(" ");
    if (nameTokens.length === 1) return { honorific, given: nameTokens[0], surname: "" };
    const surname = P().surnamePhrase(nameTokens);
    const given = nameTokens.slice(0, nameTokens.length - surname.split(" ").length).join(" ");
    if (!given) return { honorific, given: "", surname };
    return { honorific, given, surname };
  }

  // One person phrase from a list: title, name, qualifier, origin.
  function readPerson(raw, context) {
    let text = clean(raw)
      .replace(/^(?:and|e|ed)\s+/i, "")
      .replace(/^(?:(?:the|of|li|i|alli|ai|al|alla)\s+)*(?:(?:propert(?:y|ies)|assets?|heirs?|eredi|beni)\s+(?:of|di|del|della)\s+)*(?:(?:the|il|lo|la)\s+)?/i, "")
      .replace(/^(?:venerable|noble|holy|venerabile)\s+/i, "")
      // Italian lists repeat "di" before each neighbor: "giusta li beni di Nicola Russo e di Antonio Belmonte".
      .replace(/^(?:di|de|del|della|delli|d['’])\s*(?=(?:Don|Donna|Magnific[oa]|Mastro)?\s*[A-ZÀ-Ý]\S*\s+[A-ZÀ-Ý])/, "")
      .trim();
    if (!text || INSTITUTION.test(text) || P().isPublicAnchor(text)) return null;
    const origin = splitOrigin(text, context);
    const qualified = splitQualifier(origin.text);
    const name = splitName(qualified.text);
    if (!name || name.given.split(" ").length > 3) return null;
    return { ...name, qualifier: qualified.qualifier, relative: qualified.relative, location: origin.location };
  }

  // The people named after one trigger, with "Angelo and Gaetano Ferrari" read as two Ferraris.
  function readList(text, context) {
    const stop = text.search(LIST_STOP);
    const clause = (stop >= 0 ? text.slice(0, stop) : text).trim();
    const parts = clause.split(/\s*,\s*|\s+(?:and|e|ed)\s+/i).filter(Boolean);
    const people = [];
    parts.forEach(part => {
      if (/^(?:of|della|di\s+questa|dalla)\s+/i.test(part) && people.length) {
        const origin = splitOrigin(` ${part}`, context);
        if (origin.location && !origin.text) people[people.length - 1].location = origin.location;
        return;
      }
      if (/^(?:son|daughter|widow|figli[oa]|vedova)\s+/i.test(part) && people.length) {
        const qualified = splitQualifier(` ${part}`);
        if (qualified.qualifier) Object.assign(people[people.length - 1], { qualifier: qualified.qualifier, relative: qualified.relative });
        return;
      }
      const person = readPerson(part, context);
      if (person) people.push(person);
    });
    people.forEach((person, index) => {
      if (person.surname) return;
      // A lone word after a title is a surname ("Donna Ruffulo"); otherwise a given name sharing the next
      // person's surname ("Angelo and Gaetano Ferrari").
      if (person.honorific && !context.givenNames.has(key(person.given))) {
        Object.assign(person, { surname: person.given, given: "" });
        return;
      }
      const next = people[index + 1];
      person.surname = next?.given && next.surname ? next.surname : "";
    });
    return people.filter(person => person.surname && (person.given || person.honorific));
  }

  // People named in the narrative: neighbors, land borders, creditors, debtors, landlords.
  function referencedPeople(record, context) {
    const text = clean(String(record.source_entry || "").split("\n").filter(line => !P().isMemberLine(line.trim())).join(" "));
    const people = [];
    for (const match of text.matchAll(TRIGGER)) {
      people.push(...readList(text.slice(match.index + match[0].length), context));
    }
    // "Magnifico Francesco Chiodi of the Land of Rende, collects the following annual interest".
    const collector = new RegExp(String.raw`(?:^|[.:]\s+)((?:${NAME}\s+){1,6}?${NAME}(?:,?\s+of\s+(?:this|the)\s+${LOCALITY}(?:\s+of\s+${PLACE})?)?),?\s+(?:collects|esige)\b`, "g");
    for (const match of text.matchAll(collector)) {
      const person = readPerson(match[1], context);
      if (person?.given && person.surname) people.push(person);
    }
    return people;
  }

  // One member line: name, role, age, and what the scribe writes beside the name.
  function readMember(line, context) {
    const parser = P();
    const text = clean(line);
    const italian = parser.isItalianMemberLine(text);
    const parts = italian ? parser.splitItalianMemberLine(text) : null;
    const beforeAge = text.replace(/\s*(?:[—–-]+\s*)?\b(?:age|aged|anni)\b.*$/i, "");
    const kin = beforeAge.match(QUALIFIER) || (italian && parts.patronymic.match(new RegExp(`^${KIN}`)));
    const rawName = clean(italian ? parts.name : parser.memberPersonName(text)).replace(QUALIFIER, "").trim();
    const origin = splitOrigin(rawName, context);
    const named = splitName(origin.text.replace(/\s+of\s+(?:the\s+)?land\s+of\s+.+$/i, ""));
    const headOrigin = text.match(new RegExp(String.raw`\bof\s+(?:the\s+)?[Ll]and\s+of\s+(${PLACE})`))?.[1] || (italian && parts.origin);
    return {
      ...(named || { honorific: "", given: "", surname: "" }),
      qualifier: kin ? kin[1].replace(/\s+/g, " ").trim() : "",
      relative: kin ? kin[2].trim() : "",
      role: R().roleOf(text),
      age: Number(text.match(/\b(?:age|aged|anni)\s+(\d+)/i)?.[1] ?? NaN),
      location: origin.location || (headOrigin ? context.placeName(headOrigin) : null)
    };
  }

  // The member lines as written in the (possibly corrected) source entry, before its narrative begins.
  // The parser's members_text is not used: it already adds surnames to a widow's children.
  function memberLines(record) {
    const lines = [];
    for (const line of String(record.source_entry || "").split("\n").map(clean)) {
      if (!line) continue;
      if (P().isMemberLine(line)) lines.push(line);
      else if (lines.length && P().isHouseholdNarrativeLine(line)) break;
    }
    return lines.length ? lines : String(record.members_text || "").split("\n").map(line => line.trim()).filter(Boolean);
  }

  const ADULT = 15;
  const MAN_ROLES = new Set(["son", "brother", "sonInLaw", "brotherInLaw", "member"]);
  const CHILD_ROLES = new Set(["grandson", "granddaughter", "nephew", "niece", "nipote"]);
  const KIN_ROLES = new Set(["son", "daughter", "brother", "sister", "stepson", "stepdaughter", ...CHILD_ROLES]);

  // The household's people with surnames as the plan sets them: written first, then from the listing.
  function householdPeople(record, context) {
    const members = memberLines(record).map(line => readMember(line, context));
    if (!members.length) return [];
    const head = members[0];
    const residence = record.residence?.place && context.places.has(key(record.residence.place)) ? context.placeName(record.residence.place) : null;
    const location = head.location || residence || context.village;
    const widow = /^(?:widow|vedova)\b/i.test(head.qualifier);
    const husband = widow ? splitName(head.relative) : null;
    const lineage = husband?.surname || (widow ? "" : head.surname);
    const wife = members.slice(1).find(member => member.role === "wife");
    const spouseSurname = widow ? husband?.surname || "" : wife?.surname || "";
    const people = [{ ...head, derived: "" }];
    let lastMan = null;

    members.slice(1).forEach(member => {
      const tokens = `${member.given} ${member.surname}`.trim().split(/\s+/);
      if (member.surname && KIN_ROLES.has(member.role) && tokens.every(token => context.givenNames.has(key(token)))) {
        Object.assign(member, { given: tokens.join(" "), surname: "" });
      }
      const person = { ...member, derived: "" };
      const written = Boolean(member.surname);
      if (!written) {
        if (["son", "daughter"].includes(member.role)) person.surname = lineage;
        else if (["brother", "sister", "father"].includes(member.role)) person.surname = head.surname;
        else if (["brotherInLaw", "sisterInLaw", "fatherInLaw", "motherInLaw"].includes(member.role)) {
          person.surname = spouseSurname;
          person.derived = spouseSurname ? "In-law: spouse's surname" : "";
        } else if (["stepson", "stepdaughter"].includes(member.role)) {
          person.surname = head.surname;
          person.derived = "Stepchild: head's surname";
        } else if (CHILD_ROLES.has(member.role)) {
          if (lastMan) {
            person.surname = lastMan.surname;
            person.derived = lastMan.derived;
          } else {
            person.surname = head.surname;
            person.derived = "No parent listed: head's surname";
          }
        }
      }
      const adult = !(member.age < ADULT);
      if (MAN_ROLES.has(member.role) && adult && person.surname && (member.role !== "member" || written)) {
        lastMan = { surname: person.surname, derived: member.role === "member" ? "Relation of preceding man not stated" : person.derived };
      }
      people.push(person);
    });

    const parents = [];
    people.forEach(person => {
      person.location = person.location || location;
      if (!person.relative || /^(?:widow|vedova|wife|moglie)\b/i.test(person.qualifier)) return;
      const parent = splitName(person.relative);
      if (parent) parents.push({ ...parent, surname: parent.surname || person.surname, qualifier: "", derived: "", location: person.location });
    });
    if (husband) parents.push({ ...husband, surname: husband.surname, qualifier: "", derived: "", location });
    return [...people, ...parents].filter(person => person.given);
  }

  // The exported fields, in column order.
  const COLUMNS = [
    ["honorific", "Honorific"], ["given_name", "Given name"], ["surname", "Surname"],
    ["surname_derived", "Surname derived"], ["qualifier", "Qualifier"], ["residential_location", "Residential location"]
  ];

  function entry(person, source) {
    return {
      honorific: person.honorific || "",
      given_name: person.given || "",
      surname: person.surname || "",
      surname_derived: person.derived || "",
      qualifier: person.qualifier || "",
      residential_location: person.location || "",
      source
    };
  }

  function mostCommon(values) {
    const counts = new Map();
    values.forEach(value => counts.set(value, (counts.get(value) || 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  }

  // Joins mentions of one person: the fullest honorific, and no surname note if any mention writes the surname.
  function merge(mentions) {
    const qualified = mentions.filter(person => person.qualifier);
    const households = mentions.filter(person => person.source === "household");
    return {
      ...(qualified[0] || households[0] || mentions[0]),
      honorific: mentions.map(person => person.honorific).sort((a, b) => b.length - a.length)[0],
      surname_derived: mentions.every(person => person.surname_derived) ? mentions[0].surname_derived : "",
      residential_location: qualified[0]?.residential_location ||
        mostCommon((households.length ? households : mentions).map(person => person.residential_location))
    };
  }

  function buildNameIndex(data, options = {}) {
    const village = clean(options.village) || suggestedVillage(data) || "Not stated";
    const context = makeContext(data, village);
    const found = [];
    context.households.forEach(record => {
      householdPeople(record, context).forEach(person => found.push(entry(person, "household")));
      referencedPeople(record, context).forEach(person => found.push({ ...entry({ ...person, location: person.location || village }, "reference"), unlocated: !person.location }));
    });

    // A mention with no origin is of the village, unless the name is found only with one other origin
    // ("bordering Gaetano Ferrari" where he is elsewhere "of the city of Castelfranco").
    const personKey = person => `${key(person.surname)}|${key(person.given_name)}`;
    const villagePeople = new Set(found.filter(person => !person.unlocated && person.residential_location === village).map(personKey));
    const elsewhere = new Map();
    found.filter(person => !person.unlocated && person.residential_location !== village).forEach(person => {
      if (!elsewhere.has(personKey(person))) elsewhere.set(personKey(person), new Set());
      elsewhere.get(personKey(person)).add(person.residential_location);
    });
    found.forEach(person => {
      const places = elsewhere.get(personKey(person));
      if (person.unlocated && !villagePeople.has(personKey(person)) && places?.size === 1) [person.residential_location] = places;
      delete person.unlocated;
    });

    // One entry per given name and surname. Where the scribe tells same-named people apart ("Gennaro
    // Belmonte son of Santo"), each qualified version is kept and the plain mentions join it; with several
    // qualified versions the plain mentions are dropped, since they could be any of them.
    // A title with no given name ("Most Illustrious Lady Marchesa della Valle") is not a name and is left out.
    const groups = new Map();
    found.filter(person => person.given_name).forEach(person => {
      const id = personKey(person);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push(person);
    });
    const byKey = new Map();
    groups.forEach(mentions => {
      const qualifiers = [...new Set(mentions.filter(person => person.qualifier).map(person => key(person.qualifier)))];
      if (!qualifiers.length) {
        byKey.set(personKey(mentions[0]), merge(mentions));
        return;
      }
      const plain = qualifiers.length === 1 ? mentions.filter(person => !person.qualifier) : [];
      qualifiers.forEach(qualifier => {
        const versions = mentions.filter(person => key(person.qualifier) === qualifier);
        byKey.set(`${personKey(versions[0])}|${qualifier}`, merge([...versions, ...plain]));
      });
    });

    const people = [...byKey.values()].map(({ honorific, given_name, surname, surname_derived, qualifier, residential_location }) =>
      ({ honorific, given_name, surname, surname_derived, qualifier, residential_location })).sort((a, b) =>
      (a.residential_location === village ? -1 : 0) - (b.residential_location === village ? -1 : 0) ||
      key(a.residential_location).localeCompare(key(b.residential_location)) ||
      key(a.surname).localeCompare(key(b.surname)) || key(a.given_name).localeCompare(key(b.given_name)) ||
      key(a.qualifier).localeCompare(key(b.qualifier)));
    return {
      format: "catasto-name-index",
      version: 1,
      project: options.projectName || "",
      village,
      source_language: data?.source_language || "en",
      parser_version: data?.parser_version ?? null,
      exported_at: options.exportedAt || new Date().toISOString(),
      people
    };
  }

  function toJson(index) {
    return `${JSON.stringify(index, null, 2)}\n`;
  }

  function cell(value) {
    return String(value || "").replace(/\|/g, "\\|");
  }

  function unique(values) {
    return [...new Map(values.filter(Boolean).map(value => [key(value), value])).values()]
      .sort((a, b) => key(a).localeCompare(key(b)));
  }

  function toMarkdown(index) {
    const people = index.people || [];
    const lines = [
      `# Name Index / Indice Onomastico: ${index.project || index.village}`,
      "",
      `- Village: ${index.village}`,
      `- Source language: ${index.source_language === "it" ? "Italian" : "English"}`,
      `- Parser version: ${index.parser_version ?? "unknown"}`,
      `- Exported: ${index.exported_at}`,
      `- People: ${people.length}`,
      "",
      "Surname derived is filled only where the source leaves the surname uncertain; the surname shown is the one assigned.",
      "",
      `| ${COLUMNS.map(([, label]) => label).join(" | ")} |`,
      `|${COLUMNS.map(() => "---|").join("")}`,
      ...people.map(person => `| ${COLUMNS.map(([name]) => cell(person[name])).join(" | ")} |`),
      "",
      "## For the Customizable Transcriber",
      "",
      "Paste each list into the matching Name lexicon box.",
      "",
      "### Surnames",
      "",
      "```",
      ...unique(people.map(person => person.surname)),
      "```",
      "",
      "### Given names",
      "",
      "```",
      ...unique(people.map(person => person.given_name)),
      "```",
      "",
      "### Full names",
      "",
      "```",
      ...unique(people.filter(person => person.surname && person.given_name).map(person => `${person.given_name} ${person.surname}`)),
      "```",
      ""
    ];
    return lines.join("\n");
  }

  // For Excel: a byte-order mark so accented names open correctly, quoted fields, and Windows line endings.
  // A field starting with =, +, -, or @ gets a leading apostrophe so Excel does not run it as a formula.
  function toCsv(index) {
    const field = value => {
      const text = String(value || "");
      return `"${(/^[=+\-@]/.test(text) ? `'${text}` : text).replace(/"/g, "\"\"")}"`;
    };
    const rows = [COLUMNS.map(([, label]) => field(label)).join(","),
      ...(index.people || []).map(person => COLUMNS.map(([name]) => field(person[name])).join(","))];
    return `\ufeff${rows.join("\r\n")}\r\n`;
  }

  window.CatastoNameIndex = { buildNameIndex, toJson, toMarkdown, toCsv, suggestedVillage };
}());
