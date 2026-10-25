(function () {
  "use strict";

  function slugify(value) {
    return String(value).toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  const italianParticle = /^(?:di|de|del|dello|della|dei|degli|da|dal|dalla|lo|la|le|li|d'|d’)$/i;
  const italianHonorific = /^(?:Don|Donna|Suor[ae]?|Fra|Frate|C(?:h)?ierico|Cherico|Magnific[oa]|Signor[ae]?|Reverend[oa]|Venerabile|Mastro|Maestro|Nobile)$/i;
  // Occupations and conditions written after the name; sometimes capitalized ("Bracciale").
  const italianOccupation = /^(?:bracciale|bracciante|pecoraro|stroppio|decrepito|sacerdote|diacono|chierico|regrato|nobile|vivente|calzolai?o|calzolaro|ferraro|sartore|sarto|studente|scolare|servitore|vergine|nubile|maritata|monaca|vedov[oa])$/i;
  const italianRelation = /\b(?:moglie|marito|figli[oa]|figliastr[oa]|fratello|sorella|madre|padre|cognat[oa]|nipote|genero|nuora|s(?:u)?oc+er[oa]|serv[oa]|garzone|vedova|zi[oa])\b/i;

  function isMemberLine(line) {
    const text = String(line || "").trim();
    return /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+.*\b(?:age|aged|anni)\s+\d+\b/i.test(text) &&
      !/\b(?:annual|income|ounces?|oncie|grana|ducats?|ducati|docati|carlini|moggi|capacity|annui|rendita|capitale)\b/i.test(text) &&
      !/^(?:Abita|Habita|Possiede|Più|Paga|Riporto|Pesi|Resta)\b/i.test(text);
  }

  // Italian member lines carry the age as "anni N" and usually separate name, occupation, and relation with
  // spaces or dashes rather than commas: "Marco Provenzano bracciale ——— anni 60".
  function isItalianMemberLine(line) {
    return /\banni\s+\d+/i.test(line) && !/\b(?:age|aged)\s+\d+/i.test(line);
  }

  function splitItalianMemberLine(line) {
    const text = String(line || "").replace(/\[[^\]]+\]/g, " ");
    const ageMatch = text.match(/\b(?:di\s+)?anni\s+(\d+)/i);
    const beforeAge = (ageMatch ? text.slice(0, ageMatch.index) : text).replace(/[—–=]+|-{2,}/g, " ");
    const tokens = beforeAge.trim().split(/\s+/).filter(Boolean);
    const nameTokens = [];
    let index = 0;
    for (; index < tokens.length; index += 1) {
      const token = tokens[index].replace(/[,;.]+$/, "");
      if (nameTokens.length && (italianOccupation.test(token) || italianRelation.test(token))) break;
      const isParticle = nameTokens.length && italianParticle.test(token) && /^[A-ZÀ-Ý]/.test(tokens[index + 1] || "");
      const isOrigin = isParticle && /^(?:Terra|Città|Casale)$/i.test(tokens[index + 1].replace(/[,;.]+$/, ""));
      // After a first name and surname, "di Giuseppe" names the father rather than continuing the surname.
      const givenAndSurname = nameTokens.filter(part => /^[A-ZÀ-Ý]/.test(part) && !italianHonorific.test(part) && !/^(?:Battista|Maria)$/.test(part));
      const fullName = givenAndSurname.length >= 2;
      if (isParticle && fullName && !isOrigin && !nameTokens.some(part => /^(?:Terra|Città|Casale)$/i.test(part))) break;
      const isName = /^[A-ZÀ-Ý]/.test(token) || isParticle;
      if (!isName) break;
      nameTokens.push(token);
      if (token !== tokens[index]) {
        index += 1;
        break;
      }
    }
    let name = nameTokens.join(" ");
    const origin = name.match(/\s+(?:della|dalla|di)\s+(?:Terra|Città|Casale)\s+(?:di|de)\s+(.+)$/i);
    if (origin) name = name.slice(0, origin.index);
    const rest = tokens.slice(index).join(" ").replace(/\s*,\s*/g, ", ").replace(/^[,;\s]+|[,;.\s]+$/g, "");
    const patronymic = rest.match(/^(?:figli[oa]\s+)?(?:del\s+fu|di|del|fu(?:\s+di)?|quondam|q\.?\s?m\.?)\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’]*/)?.[0] || "";
    return {
      name: name.trim(),
      patronymic,
      origin: origin?.[1]?.trim() || null,
      rest,
      age: ageMatch?.[1] || null,
      relation: italianRelation.test(rest) ? rest : ""
    };
  }

  function memberPersonName(line) {
    const text = String(line || "").trim();
    if (isItalianMemberLine(text)) return splitItalianMemberLine(text).name;
    if (text.includes(",")) return text.split(",")[0].trim();
    return text
      .replace(/\b(?:age|aged)\s+\d+.*$/i, "")
      .replace(/[—–-]+\s*$/, "")
      .replace(/\s+\b(?:wife|husband|son|daughter|brother|sister|mother|father|niece|nephew|servant|laborer|day laborer|shepherd|manager|shoemaker|miller|moglie|marito|figlio|figlia|fratello|sorella|madre|padre|cognato|cognata|nipote|genero|nuora)\b.*$/i, "")
      .trim();
  }

  function isDependentHouseholdMember(line) {
    const parts = String(line || "").split(",");
    const nameField = parts[0] || "";
    const roleText = parts.slice(1).join(",");
    const relationship = /\b(?:wife|husband|son(?!\s+of\b)|daughter(?!\s+of\b)|brother|sister|mother|father|parent|child|niece|nephew|grandson|granddaughter|son-in-law|daughter-in-law|brother-in-law|sister-in-law|moglie|marito|figli[oa](?!\s+(?:di|del|della|d['’]|fu)\b)|figliastr[oa]|fratello|sorella|madre|padre|cognato|cognata|nipote|genero|nuora|s(?:u)?oc+er[oa])\b/i;
    const untitledNameField = nameField.replace(/^(?:Sister|Brother|Father)\s+/i, "");
    return relationship.test(roleText) || (!parts.slice(1).length && relationship.test(untitledNameField)) ||
      new RegExp(`${relationship.source}\\s*$`, "i").test(nameField);
  }

  function isHouseholdNarrativeLine(line) {
    return /\b(?:tax(?:able)?|heads?|industry|assessment|lives?|resides?|dwells?|inhabits?|possesses?|owns?|house|landholding|property|portion|garden|vineyard|chestnut|grove|livestock|sheep|goats?|mules?|mares?|income|total|deductions?|liabilit|pays?|debt|carried forward|brought forward|recorded|oncie|ounces?|grana|carlini|ducats?|moggi|capacity|teste|industria|abita|habita|possiede|confin\w*|giusta|rendita|stimat[ao]|sono in tutto|pesi|riporto|paga|resta|casa|casaggio|possessione|porzione|castagneto|ducati|docati|annui)\b/i.test(line);
  }

  function normalizeName(name) {
    return String(name || "")
      .replace(/^(?:the\s+property\s+of|property\s+of|master|magnificent|magnific[oa]|reverend[oa]|signor[ae]?|don|donna)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function personKey(name) {
    return normalizeName(name).toLowerCase();
  }

  function isPublicAnchor(name) {
    return /^(?:public road|running river|river|via pub+lica|strada(?: pub+lica)?|vico|fiume(?: corrente| secco)?|vallone)$/i.test(normalizeName(name));
  }

  function placeKey(place) {
    return normalizeName(place)
      .toLowerCase()
      .replace(/^(?:li|la|le|lo|il)\s+/, "")
      .replace(/\b(?:saint|santo|san)\s+nic(?:holas|ola)\b/g, "san nicola");
  }

  function surnameFromPerson(name) {
    const particles = /^(?:di|de|del|della|da|dal|dalla|lo|la|le|li)$/i;
    const parts = normalizeName(name).replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
    if (parts.length < 2) return "";
    let start = parts.length - 1;
    while (start > 0 && particles.test(parts[start - 1])) start -= 1;
    return parts.slice(start).join(" ");
  }

  function linePersonName(line) {
    return String(line || "")
      .split(/\s*(?:,|;|—|–|\bwidow\b|\bvedova\b|\bson\b|\bdaughter\b|\bfiglio\b|\bfiglia\b|\bage(?:d)?\b|\banni\b)\s*/i, 1)[0]
      .trim();
  }

  function inferFamilyRelationships(memberLines) {
    const lines = memberLines.map(line => String(line || ""));
    const headLine = lines[0] || "";
    const head = linePersonName(headLine);
    const widowMatch = headLine.match(/\b(?:widow\s+of(?:\s+the\s+late)?|vedova\s+(?:del\s+fu|di|del|dello|della))\s+([^,;—–\n]+?)(?=\s*(?:[,;—–]|\bage(?:d)?\b|\banni\b|$))/i);
    if (!widowMatch) return { members: lines, relationships: [] };

    const father = normalizeName(widowMatch[1]);
    const childSurname = surnameFromPerson(father);
    if (!childSurname) return { members: lines, relationships: [] };

    const relationships = [];
    const members = lines.map((line, index) => {
      if (index === 0) return line;
      const relationMatch = line.match(/\b(son|daughter|figlio|figlia)\b(?!\s*(?:-|–)\s*in-law|\s+in-law)/i);
      if (!relationMatch) return line;
      const rawName = linePersonName(line);
      if (!rawName) return line;
      const hasExplicitSurname = rawName.replace(/^(?:don|donna|master|mastro|maestro)\s+/i, "").trim().split(/\s+/).length > 1;
      const person = hasExplicitSurname ? rawName : `${rawName} ${childSurname}`;
      relationships.push({
        person,
        relationship: /^(?:son|figlio)$/i.test(relationMatch[1]) ? "son" : "daughter",
        mother: head,
        father
      });
      return hasExplicitSurname ? line : line.replace(rawName, person);
    });
    return { members, relationships };
  }

  function normalizeKinshipNeighborPhrases(raw) {
    const name = "[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]*";
    const person = `${name}(?:\\s+(?:(?:di|de|del|della|lo|la)\\s+)?${name}){0,3}`;
    const pattern = new RegExp(`(^|\\band\\s+)(${person}),\\s*(son|daughter)\\s+of\\s+(the\\s+late\\s+)?(${person})(?=\\s*(?:,|;|\\band\\b|$))`, "gi");
    return String(raw || "").replace(pattern, (match, prefix, child, relationship, deceased, parent) => {
      const childName = normalizeName(child);
      const inheritedSurname = surnameFromPerson(parent);
      const resolvedChild = childName.split(/\s+/).length > 1 || !inheritedSurname
        ? childName
        : `${childName} ${inheritedSurname}`;
      return `${prefix || ""}${resolvedChild}`;
    });
  }

  function expandNeighborNames(raw) {
    const cleaned = normalizeKinshipNeighborPhrases(raw)
      .replace(/\b(?:and\s+)?the\s+public\s+road\b/gi, match => match.toLowerCase().includes("and") ? ", public road" : "public road")
      .replace(/\b(?:and\s+)?the\s+running\s+river\b/gi, ", running river")
      .replace(/\b(?:and\s+)?the\s+river\b/gi, ", river")
      .replace(/\s+and\s+/gi, ", ");
    const parts = cleaned.split(",").map(normalizeName).filter(name =>
      name && !/\b(?:annual|income|estimated|equals?|oncie|ounces?|grana|carlini|ducats?|capacity|moggi)\b/i.test(name)
    );
    const expanded = [];
    parts.forEach((part, index) => {
      if (/^(?:public road|running river|river)$/i.test(part)) {
        expanded.push(part);
        return;
      }
      const hasSurname = part.split(/\s+/).length > 1;
      const nextSurname = parts.slice(index + 1).map(name => name.split(/\s+/)).find(words => words.length > 1)?.slice(-1)[0];
      expanded.push(hasSurname || !nextSurname ? part : `${part} ${nextSurname}`);
    });
    return [...new Set(expanded)];
  }

  function parseResidence(entry) {
    const sentence = entry.match(/\b(?:He|She|They)\s+(?:lives|resides)[\s\S]*?(?:\.|\n\n)/i)?.[0] ||
      entry.match(/\b(?:He|She|They)\s+(?:possesses|owns)\s+(?:the|a)\s+house[\s\S]*?(?:\.|\n\n|$)/i)?.[0] || "";
    if (!sentence) {
      const italian = parseItalianResidence(entry);
      if (italian) return italian;
    }
    const placeMatch =
      sentence.match(/\bsituated in (?:the )?(?:neighborhood of |place called |district of )?([^,.]+?)(?:\s+neighborhood|\s+district|,|\.|\s+bordering)/i) ||
      sentence.match(/\blocated in (?:the )?(?:neighborhood of |place called )?([^,.]+?)(?:\s+neighborhood|,|\.|\s+bordering)/i) ||
      sentence.match(/\bplace called ([^,.]+?)(?:,|\.|\s+bordering)/i) ||
      sentence.match(/\bin (?:the )?place called ([^,.]+?)(?:,|\.|\s+bordering)/i);
    const borderMatch = sentence.match(/\bbordering\s+(?:the )?(?:property|properties)?\s*(?:of)?\s*([\s\S]*?)(?:;|\.|\n)/i);
    return {
      place: placeMatch ? normalizeName(placeMatch[1]) : null,
      description: sentence.trim() || null,
      adjacent_to: borderMatch ? expandNeighborNames(borderMatch[1]) : []
    };
  }

  // Italian border clauses name neighbors after "giusta li beni di", "confina (alli beni di)", or "contiguo
  // alli beni di", joined by "e"/"ed"; "via publica", "vico", and "fiume" are public anchors.
  function expandItalianNeighborNames(raw) {
    const cleaned = String(raw || "")
      .replace(/\[[^\]]+\]/g, "")
      .replace(/[,\s]*\b(?:(?:il|la|nella|nel)\s+)?(?:quale|per cui|dove|ove)\b[\s\S]*$/i, "")
      .replace(/\b(?:alli|alle|ai|agli|li|i)\s+beni\b/gi, ",")
      .replace(/\bbeni\b/gi, ",")
      .replace(/\bquell[ie]\b/gi, ",")
      .replace(/\s+ed?(?=\s|,|$)/gi, ",")
      .replace(/\s+(via\s+pub+lica|strada(?:\s+pub+lica)?|vico|fiume(?:\s+(?:corrente|secco))?|vallone)\b/gi, ", $1")
      .replace(/[—–=]+/g, ",");
    const parts = cleaned.split(/\s*[,;]\s*/)
      .map(part => part
        .replace(/^(?:(?:e|ed|di|de|del|della|dello|delli|degli|dei|il|lo|la|al|alla|con)\s+|d['’]\s*)+/i, "")
        .replace(/[.:]+$/, "")
        .trim())
      .map(normalizeName)
      .filter(name => name && (/[A-ZÀ-Ý]/.test(name) || isPublicAnchor(name)) &&
        !/\b(?:oncie|once|carlini|ducati|docati|grana|rendita|stimat\w*|capacità|moggi\w*|annui|sono)\b/i.test(name));
    const expanded = [];
    parts.forEach((part, index) => {
      if (isPublicAnchor(part)) {
        expanded.push(part.toLowerCase());
        return;
      }
      const hasSurname = part.split(/\s+/).length > 1;
      const nextSurname = parts.slice(index + 1).filter(name => !isPublicAnchor(name))
        .map(surnameFromPerson).find(Boolean);
      expanded.push(hasSurname || !nextSurname ? part : `${part} ${nextSurname}`);
    });
    return [...new Set(expanded)];
  }

  function cleanItalianPlace(place) {
    return String(place || "")
      .replace(/^(?:(?:al|nel|il)\s+)?(?:luogo|loco|locale)\s+/i, "")
      .replace(/^(?:dett[ao]|di|de)\s+/i, "")
      .replace(/\s+(?:di|de|del|della|e)$/i, "")
      .replace(/[.:—–=]+$/, "")
      .trim() || null;
  }

  // "Abita in casa propria sita in San Nicola, giusta li beni di Pietro Tenuta e via publica". A house of
  // another person ("in casa del Magnifico ...", rented "d'affitto") has no district unless a locale is named.
  function parseItalianResidence(entry) {
    const sentence = String(entry || "").match(/\b(?:Abita|Habita)\b[^\n]*/i)?.[0]
      .replace(/(?:\.\s|\s+(?=(?:Più\s+)?(?:Possiede|Paga)\b))[\s\S]*$/, "")
      .replace(/\s*\b(?:In tutto|Sono in tutto)\b[\s\S]*$/i, "")
      .replace(/[\s—–=-]+$/, "")
      .trim();
    if (!sentence) return null;
    const stop = String.raw`(?=\s*,|\s+(?:giusta|confin\w*|contigu\w*|e\s+ne\s+paga|ed?\s+paga)\b|\s*[—–=;]|$)`;
    const markerPlace = sentence.match(new RegExp(String.raw`\b(?:sit[ao]|post[ao]|local[ei]|locat[ao]|loco|luogo)\s+(?:(?:di|de|in|nelli|nella|nel|alli)\s+)?([^,;]+?)${stop}`, "i"));
    const ownPlace = sentence.match(new RegExp(String.raw`\b(?:casa\s+propria|casaggio|casa)\s+(?:di|de|in|nelli|nella|nel)\s+([^,;]+?)${stop}`, "i"));
    const hosted = /\b(?:casa|casaggio)\s+(?:del|della|dello|di\s+(?:suo|sua))\b|\baffitto\b|\bgratis\b/i.test(sentence);
    const border = sentence.match(/\b(?:giusta|confin[ae]\w*|contigu[oa])\b\s*([\s\S]*?)(?=\s*\b(?:e\s+ne\s+paga|ed?\s+paga)\b|;|$)/i);
    const place = cleanItalianPlace(markerPlace?.[1] || (!hosted && ownPlace?.[1]) || "");
    return {
      place: place || (hosted ? "Not Listed" : null),
      description: sentence,
      adjacent_to: border ? expandItalianNeighborNames(border[1]) : []
    };
  }

  const italianLandNoun = String.raw`possessione|porzione|castagneto|castagnito|vign(?:a|ale|eto)|orto|territorio|terreno|chiusa|gelseto|oliveto|querceto|selva|bosco|pezzo\s+di\s+terra`;

  function isItalianLandholdingSentence(sentence) {
    return new RegExp(String.raw`\b(?:${italianLandNoun})\b`, "i").test(sentence) &&
      /\b(?:confin\w*|giusta|contigu\w*)\b/i.test(sentence) &&
      !/^\s*(?:Abita|Habita)\b/i.test(sentence);
  }

  // Returns the Italian source terms for one landholding clause: "Possiede una possessione detta San Nicola
  // di capacità moggi mezzo confine Cesare Chiappetta ... stimata la rendita per carlini quindici sono oncie 5".
  function parseItalianLandholding(sentence) {
    const text = String(sentence || "").replace(/\s+/g, " ").trim();
    const stop = String.raw`(?=\s*,|\s+(?:(?:di|in)\s+)?(?:capacit\w*|castagn\w*|moggi\w*|stoppellat\w*|tomol\w*|un|una|mezz[oa])\b|\s+(?:giusta|confin\w*|contigu\w*|stim\w*)\b|;|$)`;
    const noun = text.match(new RegExp(String.raw`\b(${italianLandNoun})\b`, "i"))?.[1].toLowerCase().replace(/\s+/g, " ") || "possessione";
    const chestnuts = noun !== "castagneto" && /\b(?:di|in)\s+castagn\w*/i.exec(text);
    const quoted = text.match(/["“]([^"”]+)["”]/)?.[1];
    const called = text.match(new RegExp(String.raw`\bdett[ao]\s+(?!luogo\b)([^,;]+?)${stop}`, "i"))?.[1];
    const located = text.match(/\b(?:nel|al)\s+(?:luogo|loco)\s+(?:dett[ao]|di)\s+([A-ZÀ-Ý][^,;]*?)(?=\s*,|\s+(?:giusta|confin\w*|contigu\w*)\b|;|$)/)?.[1] || text.match(new RegExp(String.raw`\b(?:${italianLandNoun})(?:\s+(?:di\s+terreno|seminatori[oa]|arbustat[oa]|alberat[oa]))*\s+(?:(?:sit[ao]\s+)?(?:di|de|in|nelli|nella|nel|del|della)\s+)?((?:(?:li|la|le|lo|il)\s+\S+|[A-ZÀ-Ý])[^,;]*?)${stop}`))?.[1];
    const capacity = text.match(/\b(?:di|in)\s+capacità\s+(?:di\s+)?(.+?)(?=\s*,|\s+(?:giusta|confin\w*|contigu\w*)\b|;|$)/i)?.[1] ||
      text.match(/\b((?:(?:un|una|mezz[oa])\s+)?(?:quarto\s+di\s+)?(?:moggi[oa]?|moggiat[ae]|stoppellat[ae]|tomol[aoi])(?:\s+(?:uno|una|due|tre|quattro|cinque|sei|sette|otto|nove|dieci|mezzo|\d+))?)\b/i)?.[1];
    const income = text.match(/\bstim\w*\s+(?:la\s+|di\s+)?rendita[^;]*/i)?.[0];
    const border = text.match(/\b(?:confin\w*|giusta|contigu\w*)\b\s*(?:con\s+)?([\s\S]*?)(?=\s*[,;]?\s*\b(?:stim\w+|sono|sopra)\b|;|$)/i);
    return {
      name: cleanItalianPlace(quoted || called || ""),
      place: cleanItalianPlace(located || ""),
      type: chestnuts ? `${noun} ${chestnuts[0].toLowerCase()}` : noun,
      capacity: capacity ? capacity.replace(/[,.;:\s—–]+$/, "").trim() : null,
      income: income ? income.replace(/[\s,.;:—–=]+$/, "").replace(/\s*—\s*/g, " — ").trim() : null,
      adjacent_to: border ? expandItalianNeighborNames(border[1]) : []
    };
  }

  function linkResidenceAdjacency(records) {
    const knownHeads = new Map();
    records.forEach(record => {
      const key = personKey(record.household_head);
      if (!knownHeads.has(key)) knownHeads.set(key, []);
      knownHeads.get(key).push(record);
    });

    return records.map(record => ({
      ...record,
      residence_links: (record.residence?.adjacent_to || []).map(name => {
        if (isPublicAnchor(name)) {
          return { name, kind: "public-anchor", household_id: null, candidate_household_ids: [] };
        }
        const candidates = knownHeads.get(personKey(name)) || [];
        const reciprocal = candidates.filter(candidate =>
          (candidate.residence?.adjacent_to || []).some(adjacent => personKey(adjacent) === personKey(record.household_head))
        );
        const samePlace = candidates.filter(candidate =>
          placeKey(candidate.residence?.place) && placeKey(candidate.residence?.place) === placeKey(record.residence?.place)
        );
        const resolved = candidates.length === 1
          ? candidates[0]
          : reciprocal.length === 1
            ? reciprocal[0]
            : samePlace.length === 1
              ? samePlace[0]
              : null;
        return {
          name,
          kind: "person",
          household_id: resolved?.id || null,
          candidate_household_ids: candidates.map(candidate => candidate.id),
          resolution_status: resolved ? "resolved" : candidates.length > 1 ? "ambiguous" : "unresolved"
        };
      })
    }));
  }

  function triangulateResidenceAdjacency(records) {
    const byId = new Map(records.map(record => [record.id, record]));
    let changed = true;
    let pass = 0;

    while (changed && pass < records.length) {
      changed = false;
      pass += 1;
      const inboundNeighbors = new Map(records.map(record => [record.id, new Set()]));
      records.forEach(source => {
        (source.residence_links || []).forEach(link => {
          if (link.household_id && inboundNeighbors.has(link.household_id)) {
            inboundNeighbors.get(link.household_id).add(personKey(source.household_head));
          }
        });
      });

      records.forEach(source => {
        const links = source.residence_links || [];
        links.forEach(link => {
          if (link.resolution_status !== "ambiguous" || link.household_id) return;
          const contextKeys = [...new Set(links
            .filter(other => other !== link && other.kind === "person")
            .map(other => personKey(other.name))
            .filter(Boolean))];
          if (!contextKeys.length) return;

          const scored = (link.candidate_household_ids || []).map(id => {
            const candidate = byId.get(id);
            if (!candidate) return null;
            const candidateNeighborKeys = new Set((candidate.residence?.adjacent_to || [])
              .filter(name => !isPublicAnchor(name))
              .map(personKey));
            (inboundNeighbors.get(id) || []).forEach(key => candidateNeighborKeys.add(key));
            const sharedNeighbors = contextKeys.filter(key => candidateNeighborKeys.has(key));
            const reciprocal = candidateNeighborKeys.has(personKey(source.household_head));
            const samePlace = placeKey(candidate.residence?.place) &&
              placeKey(candidate.residence?.place) === placeKey(source.residence?.place);
            return {
              candidate,
              sharedNeighbors,
              reciprocal,
              samePlace,
              score: sharedNeighbors.length * 6 + (reciprocal ? 5 : 0) + (samePlace ? 2 : 0)
            };
          }).filter(Boolean).sort((a, b) => b.score - a.score);

          const best = scored[0];
          const runnerUp = scored[1];
          if (!best?.sharedNeighbors.length || best.score < 6 || best.score - (runnerUp?.score || 0) < 4) return;
          link.household_id = best.candidate.id;
          link.resolution_status = "inferred";
          link.resolution_method = "shared-neighbor-triangulation";
          link.resolution_score = best.score;
          link.confidence = best.score >= 8 ? "high" : "medium";
          link.resolution_evidence = [
            ...best.sharedNeighbors.map(key => `Shared residence neighbor: ${links.find(other => personKey(other.name) === key)?.name || key}`),
            ...(best.samePlace ? [`Same residence district: ${source.residence?.place}`] : []),
            ...(best.reciprocal ? [`Reciprocal residence reference: ${source.household_head}`] : [])
          ];
          changed = true;
        });
      });
    }
    return records;
  }

  const sectionHeadings = {
    en: /^(?:English\s+Translation|Traduzione\s+inglese)\s*:?\s*(.*)$/i,
    it: /^(?:Italian\s+Transcription|Italian|Trascrizione(?:\s+italiana)?|Testo\s+italiano)\s*:?\s*(.*)$/i
  };

  // Keeps only the sections of a bilingual transcription that are in the requested language ("en" or "it").
  // Text without section headings is used whole.
  function extractTranscriptionSections(text, language = "en") {
    const target = language === "it" ? "it" : "en";
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const kept = [];
    const found = { en: false, it: false };
    let mode = "unknown";
    let currentPage = null;
    let sourceTitle = "";
    lines.forEach(line => {
      const trimmed = line.trim();
      const heading = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/__/g, "").trim();
      const pageMatch = heading.match(/^(.+?):\s*Page\s+(\d+)\b/i);
      const sectionLanguage = ["en", "it"].find(key => sectionHeadings[key].test(heading));
      if (pageMatch) {
        sourceTitle = pageMatch[1].trim();
        currentPage = Number(pageMatch[2]);
      }
      if (sectionLanguage) {
        found[sectionLanguage] = true;
        mode = sectionLanguage;
        if (sectionLanguage !== target) return;
        if (currentPage) kept.push(`[[SOURCE_PAGE:${currentPage}]]`);
        const inline = heading.match(sectionHeadings[sectionLanguage])[1];
        if (inline) kept.push(inline);
      } else if (pageMatch) {
        mode = "unknown";
      } else if (mode === target) {
        kept.push(line);
      }
    });
    return {
      text: found[target] ? kept.join("\n").trim() : String(text || ""),
      usedSectionsOnly: found[target],
      sectionsFound: found,
      language: target,
      sourceTitle
    };
  }

  function detectLanguage(text) {
    const count = pattern => (String(text || "").match(pattern) || []).length;
    const italian = count(/\banni\s+\d+/gi) + count(/\b(?:abita|possiede|confina|giusta|moglie|figli[oa]|oncie)\b/gi);
    const english = count(/\b(?:age|aged)\s+\d+/gi) + count(/\b(?:lives|possesses|bordering|wife|son|daughter|ounces)\b/gi);
    if (italian >= 2 && italian > english * 2) return "it";
    if (english >= 2 && english > italian * 2) return "en";
    return null;
  }

  const languageNames = { en: "English", it: "Italian" };
  const languageCodes = { en: "ENG", it: "IT" };

  // Explains when the selected language does not match the text, so a project is not built from the wrong side.
  function languageMismatch(text, language = "en") {
    const target = language === "it" ? "it" : "en";
    const other = target === "it" ? "en" : "it";
    const { sectionsFound } = extractTranscriptionSections(text, target);
    if (sectionsFound[target]) return null;
    if (sectionsFound[other]) {
      return {
        detected: other,
        message: `This text has ${other === "it" ? "Italian Transcription" : "English Translation"} sections but no ${target === "it" ? "Italian Transcription" : "English Translation"} sections. Choose ${languageCodes[other]} and try again.`
      };
    }
    const detected = detectLanguage(text);
    if (!detected || detected === target) return null;
    return {
      detected,
      message: `This text looks ${languageNames[detected]}, but ${languageCodes[target]} is selected. Choose ${languageCodes[detected]} and try again.`
    };
  }

  function splitEntries(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const entries = [];
    let current = [];
    let sawMember = false;
    let narrativeStarted = false;
    let pendingPageMarker = "";
    lines.forEach(line => {
      const trimmed = line.trim();
      if (/^\[\[SOURCE_PAGE:\d+\]\]$/.test(trimmed)) {
        pendingPageMarker = trimmed;
        return;
      }
      if (pendingPageMarker && !trimmed) return;
      const memberLine = isMemberLine(trimmed);
      if (memberLine && current.length && sawMember && narrativeStarted && !isDependentHouseholdMember(trimmed)) {
        entries.push(current.join("\n").trim());
        current = [];
        sawMember = false;
        narrativeStarted = false;
      }
      if (pendingPageMarker) {
        current.push(pendingPageMarker);
        pendingPageMarker = "";
      }
      current.push(line);
      if (memberLine) sawMember = true;
      else if (sawMember && isHouseholdNarrativeLine(trimmed)) narrativeStarted = true;
    });
    if (current.join("").trim()) entries.push(current.join("\n").trim());
    return entries.filter(entry => entry.split("\n").some(isMemberLine));
  }

  function parsePlainText(text, language = "en") {
    const prepared = extractTranscriptionSections(text, language);
    const seenHouseholds = new Map();
    const records = splitEntries(prepared.text).map((entry, index) => {
      const sourcePages = [...entry.matchAll(/\[\[SOURCE_PAGE:(\d+)\]\]/g)].map(match => Number(match[1]));
      const cleanEntry = entry.replace(/^\[\[SOURCE_PAGE:\d+\]\]\s*$/gm, "").trim();
      const memberBlock = cleanEntry.split("\n").map(line => line.trim()).filter(Boolean);
      const members = memberBlock.filter(isMemberLine);
      const headLine = members[0] || memberBlock[0] || `Household ${index + 1}, age ?`;
      const head = memberPersonName(headLine) || headLine.split(",")[0].trim();
      const family = inferFamilyRelationships(members);
      const baseId = slugify(head || `household-${index + 1}`) || `household-${index + 1}`;
      const duplicateCount = seenHouseholds.get(baseId) || 0;
      seenHouseholds.set(baseId, duplicateCount + 1);
      const householdId = duplicateCount ? `${baseId}-${duplicateCount + 1}` : baseId;
      const memberIdentities = family.members.map((line, memberIndex) => ({
        id: memberIndex === 0 ? householdId : `${householdId}-member-${String(memberIndex).padStart(2, "0")}`,
        household_id: householdId,
        identity_type: memberIndex === 0 ? "household-head" : "household-member",
        position: memberIndex,
        source_line: line
      }));
      return {
        id: householdId,
        household_id: householdId,
        household_head: head,
        source_pages: [...new Set(sourcePages)],
        members_text: family.members.join("\n") || headLine,
        family_relationships: family.relationships,
        member_identities: memberIdentities,
        residence: parseResidence(entry),
        source_entry: cleanEntry
      };
    });
    const linkedRecords = triangulateResidenceAdjacency(linkResidenceAdjacency(records));
    return {
      source_document: "Uploaded plain text",
      source_title: prepared.sourceTitle,
      source_range: "Uploaded text",
      source_language: prepared.language,
      source_language_used: prepared.usedSectionsOnly
        ? `${prepared.language === "it" ? "Italian Transcription" : "English Translation"} sections only`
        : `Plain text (${languageNames[prepared.language]})`,
      requested_household_count: records.length,
      extracted_household_count: records.length,
      note: prepared.usedSectionsOnly
        ? `Generated in browser from uploaded plain text after excluding non-${languageNames[prepared.language]} sections.`
        : "Generated in browser from uploaded plain text.",
      pipeline_version: "semantic-cleaning-v2-identity-triangulation",
      entry_boundary_version: 5,
      households: linkedRecords
    };
  }

  window.CatastoParser = {
    parsePlainText, inferFamilyRelationships, linkResidenceAdjacency, triangulateResidenceAdjacency,
    extractTranscriptionSections, detectLanguage, languageMismatch,
    isMemberLine, memberPersonName, isDependentHouseholdMember, isHouseholdNarrativeLine,
    isItalianMemberLine, splitItalianMemberLine, parseItalianResidence, expandItalianNeighborNames,
    isItalianLandholdingSentence, parseItalianLandholding
  };
}());
