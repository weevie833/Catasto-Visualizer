(function () {
  "use strict";

  function slugify(value) {
    return String(value).toLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  function isMemberLine(line) {
    return /^[A-ZÀ-Ý][A-Za-zÀ-ÿ'’.-]+.*\b(?:age|aged)\s+\d+\b/i.test(line.trim()) &&
      !/\b(?:annual|income|ounces?|oncie|grana|ducats?|carlini|moggi|capacity)\b/i.test(line);
  }

  function memberPersonName(line) {
    const text = String(line || "").trim();
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
    const relationship = /\b(?:wife|husband|son(?!\s+of\b)|daughter(?!\s+of\b)|brother|sister|mother|father|parent|child|niece|nephew|grandson|granddaughter|son-in-law|daughter-in-law|brother-in-law|sister-in-law|moglie|marito|figlio(?!\s+di\b)|figlia(?!\s+di\b)|fratello|sorella|madre|padre|cognato|cognata|nipote|genero|nuora)\b/i;
    const untitledNameField = nameField.replace(/^(?:Sister|Brother|Father)\s+/i, "");
    return relationship.test(roleText) || (!parts.slice(1).length && relationship.test(untitledNameField)) ||
      new RegExp(`${relationship.source}\\s*$`, "i").test(nameField);
  }

  function isHouseholdNarrativeLine(line) {
    return /\b(?:tax(?:able)?|heads?|industry|assessment|lives?|resides?|dwells?|inhabits?|possesses?|owns?|house|landholding|property|portion|garden|vineyard|chestnut|grove|livestock|sheep|goats?|mules?|mares?|income|total|deductions?|liabilit|pays?|debt|carried forward|brought forward|recorded|oncie|ounces?|grana|carlini|ducats?|moggi|capacity|teste|industria|abita|possiede|confina|rendita|sono in tutto|pesi|riporto)\b/i.test(line);
  }

  function normalizeName(name) {
    return String(name || "")
      .replace(/^(?:the\s+property\s+of|property\s+of|master|magnificent|don|donna)\s+/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function personKey(name) {
    return normalizeName(name).toLowerCase();
  }

  function isPublicAnchor(name) {
    return /^(?:public road|running river|river)$/i.test(normalizeName(name));
  }

  function placeKey(place) {
    return normalizeName(place)
      .toLowerCase()
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

  function extractEnglishTranslationText(text) {
    const lines = text.replace(/\r/g, "").split("\n");
    const englishLines = [];
    let mode = "unknown";
    let foundEnglishHeading = false;
    let currentPage = null;
    let sourceTitle = "";
    lines.forEach(line => {
      const trimmed = line.trim();
      const heading = trimmed.replace(/^#+\s*/, "").replace(/\*\*/g, "").replace(/__/g, "").trim();
      const englishMatch = heading.match(/^English\s+Translation\s*:?\s*(.*)$/i);
      const italianMatch = heading.match(/^(Italian\s+Transcription|Italian)\s*:?\s*(.*)$/i);
      const pageMatch = heading.match(/^(.+?):\s*Page\s+(\d+)\b/i);
      if (pageMatch) {
        sourceTitle = pageMatch[1].trim();
        currentPage = Number(pageMatch[2]);
      }
      if (englishMatch) {
        foundEnglishHeading = true;
        mode = "english";
        if (currentPage) englishLines.push(`[[SOURCE_PAGE:${currentPage}]]`);
        if (englishMatch[1]) englishLines.push(englishMatch[1]);
      } else if (italianMatch || pageMatch) {
        mode = "not-english";
      } else if (mode === "english") {
        englishLines.push(line);
      }
    });
    return {
      text: foundEnglishHeading ? englishLines.join("\n").trim() : text,
      usedEnglishSectionsOnly: foundEnglishHeading,
      sourceTitle
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

  function parsePlainText(text) {
    const prepared = extractEnglishTranslationText(text);
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
      source_language_used: prepared.usedEnglishSectionsOnly ? "English Translation sections only" : "Plain text",
      requested_household_count: records.length,
      extracted_household_count: records.length,
      note: prepared.usedEnglishSectionsOnly
        ? "Generated in browser from uploaded plain text after excluding non-English transcription sections."
        : "Generated in browser from uploaded plain text.",
      pipeline_version: "semantic-cleaning-v2-identity-triangulation",
      entry_boundary_version: 5,
      households: linkedRecords
    };
  }

  window.CatastoParser = { parsePlainText, inferFamilyRelationships, linkResidenceAdjacency, triangulateResidenceAdjacency };
}());
