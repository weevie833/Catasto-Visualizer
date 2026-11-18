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

  // A member line gives an age, or calls a child an infant ("Domenico, son, an infant"; "Tomaso figlio infante").
  function isMemberLine(line) {
    const text = String(line || "").trim();
    const infant = /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+[^.;:]*\b(?:infant|infante)\b/i.test(text) && text.split(/\s+/).length <= 12;
    return (infant || /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+.*\b(?:age|aged|anni)\s+\d+\b/i.test(text)) &&
      !/\b(?:annual|income|ounces?|oncie|grana|ducats?|ducati|docati|carlini|moggi|capacity|annui|rendita|capitale)\b/i.test(text) &&
      !/^(?:Abita|Habita|Possiede|Più|Paga|Riporto|Pesi|Resta)\b/i.test(text);
  }

  // Italian member lines carry the age as "anni N" and usually separate name, occupation, and relation with
  // spaces or dashes rather than commas: "Marco Provenzano bracciale ——— anni 60".
  function isItalianMemberLine(line) {
    return (/\banni\s+\d+/i.test(line) || /\binfante\b/i.test(line)) && !/\b(?:age|aged)\s+\d+/i.test(line);
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
      // Capitalized "Padre" after a name is a surname ("Carlo Padre pecoraro"); the father is written "padre".
      if (nameTokens.length && (italianOccupation.test(token) || (italianRelation.test(token) && token !== "Padre"))) break;
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
    const origin = name.match(/\s+(?:della|dalla|del|dal|di)\s+(?:Terra|Città|Casale)\s+(?:di|de)\s+(.+)$/i);
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
    // "Giovanni di Rangho son of Paulo, day laborer" names the same person as "Giovanni di Rangho, son of Antonio":
    // the father is a qualifier whether or not a comma sets it apart.
    if (text.includes(",")) return text.split(",")[0].replace(/\s+(?:son|daughter)\s+of\b.*$/i, "").trim();
    return text
      .replace(/\b(?:age|aged)\s+\d+.*$/i, "")
      .replace(/[—–-]+\s*$/, "")
      .replace(/\s+\b(?:wife|husband|son|daughter|brother|sister|mother|father|niece|nephew|servant|laborer|day laborer|shepherd|manager|shoemaker|miller|moglie|marito|figlio|figlia|fratello|sorella|madre|padre|cognato|cognata|nipote|genero|nuora)\b.*$/i, "")
      .trim();
  }

  // A head exempt by privilege is entered without ages, in one sentence: "Andrea Belmonte, a shepherd, is not
  // taxed any oncie ... because he holds the Privilege of a Padre Onusto"; "Andrea Belmonte pecoraro non si tassano".
  const exemptionPhrase = /\b(?:non\s+si\s+tass\w*|(?:is|are)\s+not\s+taxed)\b/i;

  function exemptHeadPrefix(line) {
    const text = String(line || "").trim();
    const match = text.match(exemptionPhrase);
    if (!match || !/^[A-ZÀ-Ý]/.test(text) || isMemberLine(text)) return "";
    const prefix = text.slice(0, match.index).replace(/[,\s]+$/, "");
    const words = prefix.split(/\s+/);
    return words.length >= 2 && words.length <= 8 && /^[A-ZÀ-Ý]/.test(words[1]) ? prefix : "";
  }

  function isExemptHeadLine(line) {
    return Boolean(exemptHeadPrefix(line));
  }

  // The head's name and occupation, written as a member line: "Andrea Belmonte, a shepherd"; "Andrea Belmonte, pecoraro".
  function exemptHeadMemberLine(line) {
    const prefix = exemptHeadPrefix(line);
    if (prefix.includes(",")) return prefix;
    const member = splitItalianMemberLine(prefix);
    return member.rest ? `${member.name}, ${member.rest}` : member.name;
  }

  function isDependentHouseholdMember(line) {
    const parts = String(line || "").split(",");
    // Capitalized "Padre" after a name is a surname, as in "Carlo Padre, shepherd"; the father is written "padre".
    const nameField = (parts[0] || "").replace(/(\S\s+)Padre\b/g, "$1");
    const roleText = parts.slice(1).join(",");
    const relationship = /\b(?:wife|husband|son(?!\s+of\b)|daughter(?!\s+of\b)|brother|sister|mother|father|parent|child|niece|nephew|grandson|granddaughter|son-in-law|daughter-in-law|brother-in-law|sister-in-law|moglie|marito|figli[oa](?!\s+(?:di|del|della|d['’]|fu)\b)|figliastr[oa]|fratello|sorella|madre|padre|cognato|cognata|nipote|genero|nuora|s(?:u)?oc+er[oa])\b/i;
    const untitledNameField = nameField.replace(/^(?:Sister|Brother|Father)\s+/i, "");
    return relationship.test(roleText) || (!parts.slice(1).length && relationship.test(untitledNameField)) ||
      new RegExp(`${relationship.source}\\s*$`, "i").test(nameField);
  }

  function isHouseholdNarrativeLine(line) {
    return /\b(?:tax(?:able)?|heads?|industry|assessment|lives?|resides?|dwells?|inhabits?|possesses?|owns?|house|landholding|property|portion|garden|vineyard|chestnut|grove|livestock|sheep|goats?|mules?|mares?|income|total|deductions?|liabilit|pays?|debt|carried forward|brought forward|recorded|oncie|ounces?|grana|carlini|ducats?|moggi|capacity|teste|industria|abita|habita|possiede|confin\w*|giusta|rendita|stimat[ao]|sono in tutto|pesi|riporto|paga|resta|casa|casaggio|possessione|porzione|castagneto|ducati|docati|annui)\b/i.test(line);
  }

  // Strips a leading title or "property of" from one person's name; used for Italian names and family lines.
  function cleanPersonName(name) {
    return String(name || "")
      .replace(/^(?:the\s+property\s+of|property\s+of|master|magnificent|magnific[oa]|reverend[oa]|signor[ae]?|don|donna)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }




  // Exact public places named as a neighbor in Italian border clauses.
  function isExactPublicAnchor(name) {
    return /^(?:public road|running river|river|via pub+lica|strada(?: pub+lica)?|vico|fiume(?: corrente| secco)?|vallone)$/i.test(cleanPersonName(name));
  }

  function surnameFromPerson(name) {
    const particles = /^(?:di|de|del|della|da|dal|dalla|lo|la|le|li)$/i;
    const parts = cleanPersonName(name).replace(/[.,]/g, "").split(/\s+/).filter(Boolean);
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

    const father = cleanPersonName(widowMatch[1]);
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
        // "e sorella Anna di Bartolo" names Anna di Bartolo; the relation is written in lowercase.
        .replace(/^(?:su[oa]\s+)?(?:sorella|fratello|madre|padre|figli[oa]|moglie|marito|nipote|cognat[oa]|suocer[oa]|genero|nuora|zi[oa])\s+(?=[A-ZÀ-Ý])/, "")
        .replace(/[.:]+$/, "")
        .trim())
      .map(cleanPersonName)
      .filter(name => name && (/[A-ZÀ-Ý]/.test(name) || isExactPublicAnchor(name)) &&
        !/\b(?:oncie|once|carlini|ducati|docati|grana|rendita|stimat\w*|capacità|moggi\w*|annui|sono)\b/i.test(name));
    const expanded = [];
    parts.forEach((part, index) => {
      if (isExactPublicAnchor(part)) {
        expanded.push(part.toLowerCase());
        return;
      }
      const hasSurname = part.split(/\s+/).length > 1;
      const nextSurname = parts.slice(index + 1).filter(name => !isExactPublicAnchor(name))
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



  const sectionHeadings = {
    en: /^(?:English\s+Translation|Traduzione\s+inglese)\s*:?\s*(.*)$/i,
    it: /^(?:Italian\s+Transcription|Italian|Trascrizione(?:\s+italiana)?|Testo\s+italiano)\s*:?\s*(.*)$/i
  };

  // The sections a Catasto onciario's instructions prescribe, recognized by the kind of people they list,
  // never by one village's wording. "resident": people living in the village (citizens, absent citizens,
  // clergy, widows, foreigners living there). "excluded": people and bodies living elsewhere, and the
  // village's own churches and chapels. "summary": the closing tax tables. Anything else is not a heading.
  function sectionHeadingKind(line) {
    const text = String(line || "").replace(/^#+\s*/, "").replace(/\*\*|__/g, "").replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.split(" ").length > 12 || /\d/.test(text)) return null;
    // A sentence about one chapel or house ("A chapel under the Right of Patronage of his family.") is not a heading.
    if (/^(?:a|an|un|una|uno)\b/i.test(text)) return null;
    // A payee or creditor label ("To the Chapel of the Rosary", "Alla Cappella del Rosario") names who is paid.
    if (/^(?:to|unto|towards|due\s+to|owed\s+to|paid\s+to|al|alla|alle|allo|agli|ai|all['’]|a['’])(?=[\s'’]|$)/i.test(text)) return null;
    if (/\b(?:possess\w*|possied\w*|pays?|paid|paga\w*|lives?|living|abita|habita|border\w*|confin\w*|esig\w*|collects?|owns?|estimated|stimat\w*|posta|posto|sit[ao]|situated|located)\b/i.test(text)) return null;
    if (/\b(?:collettoria|tass[ae]|esentat[io]|laus\s+deo|tax\s+(?:collection|of|for)|exempt\w*|praise\s+be\s+to\s+god)\b/i.test(text)) return "summary";
    if (/\b(?:non\s+abitant\w*|bonatenent\w*|risedent\w*\s+fuori|residing\s+elsewhere|landowners?|property\s+owners?)\b/i.test(text)) return "excluded";
    // "Forastieri abitanti" live in the village, even where a translation calls them "Non-Resident Inhabitants"
    // or "Lay Residents from Outside the Area".
    if (/\b(?:abitant\w*|inhabitants?)\b/i.test(text) || /(?<!non[-\s])\bresidents?\b/i.test(text)) return "resident";
    if (/\b(?:forastier\w*|forestier\w*|foreign\w*|non[-\s]?residents?)\b/i.test(text)) return "excluded";
    if (/\b(?:chies[ae]|cappell[ae]|convent[oi]|monaster[oi]|congregazion[ei]|church(?:es)?|chapels?|convents?|monaster(?:y|ies)|congregations?)\b/i.test(text)) return "excluded";
    if (/\b(?:cittadin[oi]|vedove|vergini|sacerdoti|chieric[oi]|cheric[oi]|diaconi|citizens?|widows|maidens|virgins|priests|clerics|clerical|deacons)\b/i.test(text)) return "resident";
    return null;
  }

  // A heading stands alone: a blank line (or the start of a page or section) before it and after it, or another
  // heading, as in "Collettoria generale" over "— Cittadini —". Member lines run on without blank lines between
  // them, so a household's lines are never headings.
  function headingLineKinds(lines, isBoundary) {
    const kinds = lines.map((line, index) => isBoundary(index) ? null : sectionHeadingKind(line));
    const open = index => index < 0 || index >= lines.length || !lines[index].trim() || isBoundary(index) || Boolean(kinds[index]);
    return kinds.map((kind, index) => kind && open(index - 1) && open(index + 1) ? kind : null);
  }

  // Keeps only the sections of a bilingual transcription that are in the requested language ("en" or "it").
  // Text without section headings is used whole. A Catasto section heading is preceded by a marker line,
  // "[[SECTION:resident]]", "[[SECTION:excluded]]" or "[[SECTION:summary]]". With both languages present, an
  // English heading takes its kind from the Italian heading in the same position on that page, since
  // translations of these headings are unreliable.
  function extractTranscriptionSections(text, language = "en") {
    const target = language === "it" ? "it" : "en";
    const lines = String(text || "").replace(/\r/g, "").split("\n");
    const found = { en: false, it: false };
    let mode = "unknown";
    let currentPage = null;
    let sourceTitle = "";
    const info = lines.map(line => {
      const trimmed = line.trim();
      const heading = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/__/g, "").trim();
      const pageMatch = heading.match(/^(.+?):\s*Page\s+(\d+)\b/i);
      // The section label may follow the page on the same line: "Marano Marchesato 1754: Page 4 Italian Transcription:".
      const label = pageMatch ? heading.slice(pageMatch[0].length).replace(/^[\s:.—–-]+/, "") : heading;
      const sectionLanguage = ["en", "it"].find(key => sectionHeadings[key].test(label));
      if (pageMatch) {
        sourceTitle = pageMatch[1].trim();
        currentPage = Number(pageMatch[2]);
      }
      if (sectionLanguage) {
        found[sectionLanguage] = true;
        mode = sectionLanguage;
        return { boundary: true, sectionLanguage, label, page: currentPage, mode };
      }
      if (pageMatch) {
        mode = "unknown";
        return { boundary: true, page: currentPage, mode };
      }
      return { boundary: false, page: currentPage, mode };
    });
    const sectioned = found[target];
    const lineKinds = headingLineKinds(lines, index => info[index].boundary || /^\[\[SOURCE_PAGE:\d+\]\]$/.test(lines[index].trim()));
    const headings = new Map();
    lines.forEach((line, index) => {
      const kind = lineKinds[index];
      if (!kind) return;
      info[index].kind = kind;
      const pageKey = `${info[index].page}|${sectioned ? info[index].mode : "all"}`;
      if (!headings.has(pageKey)) headings.set(pageKey, []);
      info[index].position = headings.get(pageKey).push(kind) - 1;
    });
    const kindAt = index => {
      const own = info[index].kind;
      if (!sectioned || target !== "en") return own;
      const english = headings.get(`${info[index].page}|en`) || [];
      const italian = headings.get(`${info[index].page}|it`) || [];
      return italian.length === english.length ? italian[info[index].position] : own;
    };
    // The closing tax summary may be headed in one language only ("Collettoria generale" over a table):
    // it then starts at the next text kept in the other.
    let pendingSummary = false;
    const kept = [];
    lines.forEach((line, index) => {
      const item = info[index];
      if (sectioned && item.mode !== target && item.kind === "summary" && !item.boundary) {
        const own = headings.get(`${item.page}|${target}`) || [];
        if (!own.includes("summary")) pendingSummary = true;
      }
      if (sectioned) {
        if (item.sectionLanguage) {
          if (item.sectionLanguage !== target) return;
          if (item.page) kept.push(`[[SOURCE_PAGE:${item.page}]]`);
          const inline = item.label.match(sectionHeadings[item.sectionLanguage])[1];
          if (inline) kept.push(inline);
          return;
        }
        if (item.boundary || item.mode !== target) return;
      }
      if (pendingSummary && line.trim()) {
        kept.push("[[SECTION:summary]]");
        pendingSummary = false;
      }
      if (item.kind) kept.push(`[[SECTION:${kindAt(index)}]]`);
      kept.push(line);
    });
    return {
      text: sectioned ? kept.join("\n").trim() : kept.join("\n"),
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




  // The canonical pipeline: every project, from Admin or a migration, is parsed here. Names, residence places,
  // and neighbor links are normalized the same way for both languages.
  const PARSER_VERSION = 9;

  function stripNamePrefixes(name) {
    return String(name || "")
      .replace(/\b(Most\s+Illustrious|Illustrious|Illustrius|Magnificent|Reverend|Venerable|Nobleman|Noblewoman|Noble|Master|Mastro|Maestro|Donna|Dona|Don|D\.|Dr\.|Doctor|Priest|Father|Padre|Marchese|Marchesa|Magnific[oa]|Reverend[oa]|Signor[ae]?|Venerabile|Suor[ae]?|Cleric|C(?:h)?ierico|Cherico|Sacerdote)\b\.?/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function surnamePhrase(parts) {
    if (!parts.length) return "";
    const surnameParticles = /^(di|de|del|della|da|dal|dalla|lo|la|le|li)$/i;
    let start = parts.length - 1;
    while (start > 0 && surnameParticles.test(parts[start - 1])) {
      start -= 1;
    }
    return parts.slice(start).join(" ");
  }

  function surnameFromName(name) {
    const parts = stripNamePrefixes(name).replace(/[.,]/g, "").trim().split(/\s+/);
    return parts.length > 1 ? surnamePhrase(parts) : parts[0] || "";
  }

  function titleCasePlace(value) {
    return value.replace(/\b\w/g, char => char.toUpperCase());
  }

  function canonicalPlace(value) {
    const raw = String(value || "No residence listed").trim() || "No residence listed";
    let key = raw
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\b(neighborhood|district|contrada|place called|place|called|located|situated|said|aforementioned)\b/g, " ")
      .replace(/\b(?:a|an|cluster|group)\b/g, " ")
      .replace(/\b(li|lo|la|le|il|i|l)\b/g, " ")
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .replace(/\s+/g, " ");

    const aliases = {
      "pasolani": "pasolani",
      "san nicolo": "san nicolo",
      "san nicola": "san nicolo",
      "saint nicholas": "san nicolo",
      "st nicholas": "san nicolo",
      "nicola": "san nicolo",
      "santo nicola": "san nicolo",
      "pajoli": "pasolani",
      "not indicated": "not listed",
      "not listed": "not listed",
      "no residence listed": "no residence listed"
    };
    if (/\bpagliara\b/.test(key)) key = "costa della pagliara";
    else if (/^(?:san\s+|li\s+)?(?:juani|guanni|janni|giovanni)$/.test(key)) key = "san janni";
    else key = aliases[key] || key || "no residence listed";
    return {
      key,
      label: key === "no residence listed" ? "No residence listed" : titleCasePlace(key)
    };
  }

  function isPublicAnchor(name) {
    return /\b(?:public road|running river|river|road|via pub+lica|strada|vico|fiume|vallone)\b/i.test(name);
  }

  function sentenceList(text) {
    return text
      .replace(/\r/g, "")
      .split(/\n\s*\n|(?<=[.!?])\s+/)
      .map(sentence => sentence.replace(/\n+/g, " ").trim())
      .filter(Boolean);
  }

  function personKey(name) {
    return normalizeName(stripNamePrefixes(name)).toLowerCase();
  }

  function normalizeName(name) {
    return name
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\b(the|property|properties|of|and|bordering|borders|Magnificent|Most Illustrious|Illustrious|Master)\b/gi, " ")
      .replace(/[.;:—–-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeResidencePlace(name) {
    return normalizeName(name)
      .replace(/\b(own house|group of houses|cluster of houses|casaggio|house|houses)\b/gi, " ")
      .replace(/\b(?:a|an|cluster|group)\b/gi, " ")
      .replace(/\b(his|her|their|own|in|the|neighborhood|district|place|called|located|situated)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function contextualResidencePlace(entry, residenceSentence = "") {
    const clauses = [residenceSentence, ...sentenceList(entry).filter(clause =>
      /\b(?:house|houses|casaggio|home|dwelling|residen\w*|lives?|resides?|dwells?|inhabits?)\b/i.test(clause)
    )].filter(Boolean);
    const neighborhoodPattern = /\b(?:a\s+)?(?:cluster|group)(?:\s+of\s+houses)?\s+(?:in\s+)?(?:the\s+)?(malvitani|pasolani|pajoli|san\s+nicola|san\s+nicol[oò]|li\s+nicola|li\s+nicol[oò]|saint\s+nicholas|st\.?\s+nicholas)\b|\b(?:li\s+)?(malvitani|pasolani|pajoli|san\s+nicola|san\s+nicol[oò]|li\s+nicola|li\s+nicol[oò]|saint\s+nicholas|st\.?\s+nicholas)\b/i;
    for (const clause of clauses) {
      const match = clause.match(neighborhoodPattern);
      if (match) return normalizeResidencePlace(match[1] || match[2]);
      const bracketedPlace = clause.match(/\\?\[\s*in\s*\\?\]\s*([A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+(?:\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+){0,2})/);
      if (bracketedPlace) return normalizeResidencePlace(bracketedPlace[1]);
    }
    if (/continued on next page/i.test(entry)) {
      const continuation = entry.match(/continued on next page[\s\S]{0,180}?(?:place\\?\]?\s+called|district(?:\s+of)?|neighborhood(?:\s+of)?)\s+(?:li\s+)?(malvitani|pasolani|pajoli|san\s+nicola|san\s+nicol[oò])/i);
      if (continuation) return normalizeResidencePlace(continuation[1]);
    }
    return "";
  }

  function expandNeighborNames(raw) {
    const name = "[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÿ'’.-]*";
    const person = `${name}(?:\\s+(?:(?:di|de|del|della|lo|la)\\s+)?${name}){0,3}`;
    const kinshipPattern = new RegExp(`(^|\\band\\s+)(${person}),\\s*(son|daughter)\\s+of\\s+(the\\s+late\\s+)?(${person})(?=\\s*(?:,|;|\\band\\b|$))`, "gi");
    const normalizedKinship = String(raw || "").replace(kinshipPattern, (match, prefix, child, relationship, deceased, parent) => {
      const childName = normalizeName(child);
      const inheritedSurname = surnameFromName(parent);
      const resolvedChild = childName.split(/\s+/).length > 1 || !inheritedSurname
        ? childName
        : `${childName} ${inheritedSurname}`;
      return `${prefix || ""}${resolvedChild}`;
    });
    const cleaned = normalizedKinship
      .replace(/\bthe property of\b/gi, "")
      .replace(/\bproperties of\b/gi, "")
      .replace(/\bthe public road\b/gi, "public road")
      // "Gennaro Passarello and his sister Anna di Bartolo" names Anna di Bartolo.
      .replace(/\b(?:his|her|their)\s+(?:sister|brother|mother|father|son|daughter|wife|husband|nephew|niece|uncle|aunt)(?:-in-law)?\s+(?=[A-ZÀ-Ý])/g, "")
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\b(?:with|for|and pays|paying|who pays)\b[\s\S]*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    // Translations sometimes keep the Italian "e"/"ed": "bordering Giacomo e Rafaele di Bartolo".
    const parts = cleaned.split(/\s*(?:,|;|\b[Aa]nd\b|\s(?:e|ed)\s)\s*/).map(normalizeName).filter(name =>
      name && !/\b(?:annual|income|estimated|equals?|oncie|ounces?|grana|carlini|ducats?|capacity|moggi)\b/i.test(name)
    );
    const expanded = [];
    parts.forEach((part, index) => {
      if (part.toLowerCase() === "public road") {
        expanded.push(part);
        return;
      }
      const hasSurname = part.split(/\s+/).length > 1;
      // A first name alone shares the next person's surname with its particle: "Giacomo and Rafaele di Bartolo".
      const nextSurname = parts.slice(index + 1).filter(name => name.toLowerCase() !== "public road")
        .map(surnameFromPerson).find(Boolean);
      expanded.push(hasSurname || !nextSurname ? part : `${part} ${nextSurname}`);
    });
    return [...new Set(expanded)];
  }

  function isUnlocatedHostedResidence(sentence) {
    return /\b(?:house|houses|group of houses|cluster of houses|casaggio)\s+(?:of|belonging to|rented from)\b/i.test(sentence) ||
      /\brented\s+from\b/i.test(sentence);
  }

  function parseResidence(entry) {
    const sentence = entry.match(/\b(?:He|She|They)\s+(?:lives|resides)[^\n]*?(?:\.|$)/i)?.[0] ||
      entry.match(/\b(?:He|She|They)\s+(?:lives|resides)[\s\S]*?(?:\.|\n\n|$)/i)?.[0] ||
      entry.match(/\b(?:He|She|They)\s+(?:possesses|owns)\s+(?:the|a)\s+house[\s\S]*?(?:\.|\n\n|$)/i)?.[0] ||
      entry.match(/\b(?:The|His|Her|Their)\s+(?:house|residence|home|dwelling)[^\n]*(?:\.|$)/i)?.[0] ||
      "";
    if (!sentence) {
      const italian = parseItalianResidence(entry);
      if (italian) return italian;
    }
    const borderMatch = sentence.match(/\bbordering\s+(?:the )?(?:property|properties)?\s*(?:of)?\s*([\s\S]*?)(?:;|\.|\n|$)/i);
    const adjacentTo = borderMatch ? expandNeighborNames(borderMatch[1]) : [];
    const placeMatch =
      sentence.match(/\bin (?:a |his |her |their |own )?(?:group of houses|cluster of houses|casaggio|house|houses)(?:\s+\[[^\]]+\])?\s+in\s+(?:the )?(?:neighborhood|district|place)\s+of\s+([^,.]+?)(?:,|\.|\s+bordering)/i) ||
      sentence.match(/\bin (?:a |his |her |their |own )?(?:group of houses|cluster of houses|casaggio|house|houses)(?:\s+\[[^\]]+\])?\s+in\s+(?:the )?([^,.]+?)(?:\s+neighborhood|\s+district|,|\.|\s+bordering)/i) ||
      sentence.match(/\b(?:group of houses|cluster of houses|casaggio|house|houses)\s+called\s+([^,.]+?)(?:,|\.|\s+bordering)/i) ||
      sentence.match(/\b(?:local\s+)?(?:group of houses|cluster of houses|casaggio|house|houses)\s+in\s+(?:the )?([^,.]+?)(?:\s+neighborhood|\s+district|,|\.|\s+bordering)/i) ||
      sentence.match(/\bin\s+(?:the )?((?:Li\s+)?(?:Pasolani|Malvitani|San Nicola|San Nicolo|Pajoli|Saint Nicholas))\s+house\b/i) ||
      sentence.match(/\bin\s+(?:the )?([^,.]+?)\s+district(?:,|\.|\s+bordering)/i) ||
      sentence.match(/\bin\s+((?:Li\s+)?(?:Pasolani|Malvitani|San Nicola|San Nicolo|Pajoli|Saint Nicholas))(?:,|\.|\s+bordering)/i) ||
      sentence.match(/\bsituated in (?:the )?(?:neighborhood of |place called |district of )?([^,.]+?)(?:\s+neighborhood|\s+district|,|\.|\s+bordering)/i) ||
      sentence.match(/\blocated in (?:the )?(?:neighborhood of |place called |district of )?([^,.]+?)(?:\s+neighborhood|\s+district|,|\.|\s+bordering)/i) ||
      sentence.match(/\bin (?:the )?(?:neighborhood|district|place)\s+of\s+([^,.]+?)(?:,|\.|\s+bordering)/i) ||
      sentence.match(/\bplace called ([^,.]+?)(?:,|\.|\s+bordering)/i);
    const place = placeMatch ? normalizeResidencePlace(placeMatch[1]) : contextualResidencePlace(entry, sentence);
    if (isUnlocatedHostedResidence(sentence) && !place) {
      return {
        place: "Not Listed",
        description: sentence.trim() || null,
        adjacent_to: adjacentTo
      };
    }
    return {
      place: place || null,
      description: sentence.trim() || null,
      adjacent_to: adjacentTo
    };
  }

  function splitEntries(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const entries = [];
    let current = [];
    let sawMember = false;
    let narrativeStarted = false;
    let pendingPageMarker = "";
    // The page in progress, so an entry that starts mid-page records the page it starts on.
    let lastPageMarker = "";
    // Text before any heading is resident, so a source without headings parses as before.
    let sectionKind = "resident";
    let skipHeading = false;
    lines.forEach(line => {
      const trimmed = line.trim();
      if (/^\[\[SOURCE_PAGE:\d+\]\]$/.test(trimmed)) {
        pendingPageMarker = trimmed;
        lastPageMarker = trimmed;
        return;
      }
      if (pendingPageMarker && !trimmed) return;
      // A section heading ends the entry before it. Only resident sections hold entries; the closing
      // summary runs to the end of the text, so headings inside its tables never reopen entries.
      const section = trimmed.match(/^\[\[SECTION:(\w+)\]\]$/)?.[1];
      if (section) {
        if (current.join("").trim()) entries.push(current.join("\n").trim());
        current = pendingPageMarker || !lastPageMarker ? [] : [lastPageMarker];
        sawMember = false;
        narrativeStarted = false;
        if (sectionKind !== "summary") sectionKind = section;
        skipHeading = true;
        return;
      }
      // The heading names the section, not the entry that follows it.
      if (skipHeading && trimmed) {
        skipHeading = false;
        return;
      }
      if (sectionKind !== "resident") return;
      const memberLine = isMemberLine(trimmed);
      const exemptHead = !memberLine && isExemptHeadLine(trimmed);
      const startsNext = (exemptHead || (memberLine && !isDependentHouseholdMember(trimmed))) &&
        current.length && sawMember && narrativeStarted;
      if (startsNext) {
        entries.push(current.join("\n").trim());
        current = pendingPageMarker || !lastPageMarker ? [] : [lastPageMarker];
        sawMember = false;
        narrativeStarted = false;
      }
      if (pendingPageMarker) {
        current.push(pendingPageMarker);
        pendingPageMarker = "";
      }
      current.push(line);
      if (memberLine) sawMember = true;
      // The exemption sentence is the whole entry: the next member line begins another household.
      else if (exemptHead) sawMember = narrativeStarted = true;
      else if (sawMember && isHouseholdNarrativeLine(trimmed)) narrativeStarted = true;
    });
    if (current.join("").trim()) entries.push(current.join("\n").trim());
    return entries.filter(entry => entry.split("\n").some(line => isMemberLine(line) || isExemptHeadLine(line.trim())));
  }

  // An entry's pages, where each page begins (as the words that open it, so a name in the entry can be placed
  // on its page), and its text without page markers.
  function pagedText(entry) {
    const sourcePages = [...entry.matchAll(/\[\[SOURCE_PAGE:(\d+)\]\]/g)].map(match => Number(match[1]));
    const entryLines = entry.split("\n");
    const pageBreaks = entryLines.flatMap((line, lineIndex) => {
      const page = line.trim().match(/^\[\[SOURCE_PAGE:(\d+)\]\]$/)?.[1];
      const opening = page && entryLines.slice(lineIndex + 1).map(next => next.trim()).find(next => next && !/^\[\[SOURCE_PAGE:/.test(next));
      return opening ? [{ page: Number(page), starts_with: opening.slice(0, 80) }] : [];
    });
    return { sourcePages, pageBreaks, cleanEntry: entry.replace(/^\[\[SOURCE_PAGE:\d+\]\]\s*$/gm, "").trim() };
  }

  // The text of each excluded section (non-resident owners, outside churches, the village's chapels), for the
  // Name Index only: none of it becomes an entry. Each item has a household record's source fields, so the
  // Name Index reads its pages the same way. Summary sections are not kept; everything after one is skipped.
  function excludedSections(text) {
    const sections = [];
    let current = null;
    let sectionKind = "resident";
    let lastPageMarker = "";
    let pendingPageMarker = "";
    let awaitingHeading = false;
    const close = () => {
      if (current && current.lines.some(line => line.trim() && !/^\[\[SOURCE_PAGE:\d+\]\]$/.test(line.trim()))) {
        const { sourcePages, pageBreaks, cleanEntry } = pagedText(current.lines.join("\n").trim());
        sections.push({ heading: current.heading, source_pages: sourcePages, source_page_breaks: pageBreaks, source_entry: cleanEntry });
      }
      current = null;
    };
    text.replace(/\r/g, "").split("\n").forEach(line => {
      const trimmed = line.trim();
      if (/^\[\[SOURCE_PAGE:\d+\]\]$/.test(trimmed)) {
        lastPageMarker = pendingPageMarker = trimmed;
        return;
      }
      const section = trimmed.match(/^\[\[SECTION:(\w+)\]\]$/)?.[1];
      if (section) {
        if (sectionKind === "summary") return;
        close();
        sectionKind = section;
        if (section === "excluded") {
          current = { heading: "", lines: lastPageMarker ? [lastPageMarker] : [] };
          pendingPageMarker = "";
          awaitingHeading = true;
        }
        return;
      }
      if (!current || (pendingPageMarker && !trimmed)) return;
      if (awaitingHeading && trimmed) {
        current.heading = trimmed.replace(/^#+\s*/, "").replace(/\*\*|__/g, "").trim();
        awaitingHeading = false;
        return;
      }
      if (pendingPageMarker) {
        current.lines.push(pendingPageMarker);
        pendingPageMarker = "";
      }
      current.lines.push(line);
    });
    close();
    return sections;
  }

  function segmentHouseholds(text) {
    return splitEntries(text).map((entry, index) => {
      const { sourcePages, pageBreaks, cleanEntry } = pagedText(entry);
      // A sentence cut by a page break reads as one sentence: "the house where she lives located [continued on
      // next page]" + "...of the place called li Pasolani, bordering ...". The continuation starts in lowercase.
      const joinedEntry = entry
        .replace(/[ \t]*\[continued on next page\][ \t]*$/gim, "")
        .replace(/([^\s.;:!?])[ \t]*\n\s*\[\[SOURCE_PAGE:\d+\]\]\s*(?:\.\.\.|…)?[ \t]*(?=[a-zà-ÿ])/g, "$1 ")
        .replace(/^\[\[SOURCE_PAGE:\d+\]\]\s*$/gm, "").trim();
      const memberBlock = cleanEntry.split("\n").map(line => line.trim()).filter(Boolean);
      const members = memberBlock.flatMap(line => isMemberLine(line) ? [line] : isExemptHeadLine(line) ? [exemptHeadMemberLine(line)] : []);
      const headLine = members[0] || memberBlock[0] || `Household ${index + 1}, age ?`;
      const rawHead = memberPersonName(headLine) || headLine.split(",")[0].trim();
      // A head's place of origin is not part of his name: "of the Land of Rende", "of the City of Scigliano".
      const origin = /\s+of\s+(?:the\s+)?(?:land|city|town|casale|village)\s+of\s+/i;
      const landResidence = rawHead.match(new RegExp(`${origin.source}(.+)$`, "i"));
      const italianOrigin = isItalianMemberLine(headLine) ? splitItalianMemberLine(headLine).origin : null;
      const head = landResidence ? rawHead.slice(0, landResidence.index).trim() : rawHead;
      const cleanedMembers = members.map(line => line.replace(new RegExp(`${origin.source}[^,]+`, "i"), ""));
      return {
        index,
        entry: cleanEntry,
        joinedEntry,
        sourcePages: [...new Set(sourcePages)],
        pageBreaks,
        memberBlock,
        members: cleanedMembers,
        headLine,
        head,
        headResidence: landResidence?.[1]?.replace(/[.,;]+$/, "").trim() || italianOrigin || null
      };
    });
  }

  function extractResidenceFacts(segments) {
    return segments.map(segment => {
      const residence = parseResidence(segment.joinedEntry);
      return {
        ...segment,
        residence: {
          ...residence,
          place: residence.place || segment.headResidence || null
        }
      };
    });
  }

  function normalizeNeighborhoodFacts(records) {
    return records.map(record => ({
      ...record,
      residence: {
        ...record.residence,
        place: record.residence?.place ? normalizeResidencePlace(record.residence.place) : record.residence?.place || null,
        adjacent_to: [...new Set((record.residence?.adjacent_to || []).map(normalizeName).filter(Boolean))]
      }
    }));
  }

  function resolveHouseholdIdentities(records) {
    const seen = new Map();
    return records.map(record => {
      const baseId = slugify(record.head || `household-${record.index + 1}`) || `household-${record.index + 1}`;
      const count = seen.get(baseId) || 0;
      seen.set(baseId, count + 1);
      return { ...record, id: count ? `${baseId}-${count + 1}` : baseId };
    });
  }

  function linkResidenceAdjacency(records) {
    const knownHeads = new Map();
    records.forEach(record => {
      const key = personKey(record.head);
      if (!knownHeads.has(key)) knownHeads.set(key, []);
      knownHeads.get(key).push(record);
    });
    return records.map(record => ({
      ...record,
      residence_links: (record.residence?.adjacent_to || [])
        .map(name => {
          if (isPublicAnchor(name)) return { name, kind: "public-anchor", household_id: null, candidate_household_ids: [] };
          const candidates = knownHeads.get(personKey(name)) || [];
          const reciprocal = candidates.filter(candidate =>
            (candidate.residence?.adjacent_to || []).some(adjacent => personKey(adjacent) === personKey(record.head))
          );
          const sourcePlace = canonicalPlace(record.residence?.place || "No residence listed").key;
          const samePlace = candidates.filter(candidate => canonicalPlace(candidate.residence?.place || "No residence listed").key === sourcePlace);
          const resolved = candidates.length === 1 ? candidates[0] : reciprocal.length === 1 ? reciprocal[0] : samePlace.length === 1 ? samePlace[0] : null;
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
            inboundNeighbors.get(link.household_id).add(personKey(source.head || source.household_head));
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
            const sourceHead = source.head || source.household_head;
            const reciprocal = candidateNeighborKeys.has(personKey(sourceHead));
            const samePlace = canonicalPlace(candidate.residence?.place || "No residence listed").key ===
              canonicalPlace(source.residence?.place || "No residence listed").key;
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
            ...(best.reciprocal ? [`Reciprocal residence reference: ${source.head || source.household_head}`] : [])
          ];
          changed = true;
        });
      });
    }
    return records;
  }

  function cleanedGraphRecordsFromText(text) {
    const segments = segmentHouseholds(text);
    const withResidence = extractResidenceFacts(segments);
    const normalized = normalizeNeighborhoodFacts(withResidence);
    const withIdentities = resolveHouseholdIdentities(normalized);
    return triangulateResidenceAdjacency(linkResidenceAdjacency(withIdentities)).map(record => {
      const family = inferFamilyRelationships(record.members);
      const memberIdentities = family.members.map((line, index) => ({
        id: index === 0 ? record.id : `${record.id}-member-${String(index).padStart(2, "0")}`,
        household_id: record.id,
        identity_type: index === 0 ? "household-head" : "household-member",
        position: index,
        source_line: line
      }));
      return {
        id: record.id,
        household_id: record.id,
        household_head: record.head,
        source_pages: record.sourcePages,
        source_page_breaks: record.pageBreaks,
        members_text: family.members.join("\n") || record.headLine,
        family_relationships: family.relationships,
        member_identities: memberIdentities,
        residence: record.residence,
        residence_links: record.residence_links,
        source_entry: record.entry
      };
    });
  }

  function parsePlainText(text, sourceLanguage = "en") {
    // "age — 48" and "di anni — 48" give the age as "age 48" does; every reader of member lines expects the latter.
    const unescapedText = String(text || "").replace(/\\/g, "")
      .replace(/\b(age|aged|anni)[ \t]*[—–-]+[ \t]*(?=\d)/gi, "$1 ");
    const prepared = extractTranscriptionSections(unescapedText, sourceLanguage);
    const records = cleanedGraphRecordsFromText(prepared.text);
    return {
      parser_version: PARSER_VERSION,
      pipeline_version: "semantic-cleaning-v2-identity-triangulation",
      entry_boundary_version: 7,
      source_title: prepared.sourceTitle,
      cleaning_pipeline: [
        "segment_households",
        "extract_residence_facts",
        "normalize_neighborhoods",
        "resolve_household_identities",
        "link_residence_adjacency",
        "triangulate_ambiguous_identities"
      ],
      source_document: "Uploaded plain text",
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
      households: records,
      excluded_sections: excludedSections(prepared.text)
    };
  }

  window.CatastoParser = {
    PARSER_VERSION, parsePlainText, inferFamilyRelationships, linkResidenceAdjacency, triangulateResidenceAdjacency,
    canonicalPlace, isPublicAnchor, normalizeName, normalizeResidencePlace, personKey, sentenceList, stripNamePrefixes,
    surnameFromName, surnamePhrase, titleCasePlace, expandNeighborNames, parseResidence,
    extractTranscriptionSections, detectLanguage, languageMismatch,
    isMemberLine, isExemptHeadLine, memberPersonName, isDependentHouseholdMember, isHouseholdNarrativeLine,
    isItalianMemberLine, splitItalianMemberLine, parseItalianResidence, expandItalianNeighborNames,
    isItalianLandholdingSentence, parseItalianLandholding
  };
}());
