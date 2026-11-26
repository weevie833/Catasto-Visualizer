// Household records inside a project: permanent ids, repair of malformed imports, and the
// carry-over of the user's edits when a project is reparsed with a newer parser.
(function () {
  "use strict";

  // Version 2 records have permanent random ids; version 1 ids were slugs of the head's name.
  const RECORD_ID_VERSION = 2;

  function newRecordId() {
    const random = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    return `h-${random}`;
  }

  function isObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function label(record, index) {
    const head = isObject(record) && typeof record.household_head === "string" && record.household_head.trim();
    return `Record ${index + 1}${head ? ` (${head})` : ""}`;
  }

  function memberIdentityId(householdId, position) {
    return position === 0 ? householdId : `${householdId}-member-${String(position).padStart(2, "0")}`;
  }

  // Replaces name-based ids with permanent ones and rewrites every reference to them: residence links,
  // member identities, duplicate decisions, and the record copies kept in merge history. A reference
  // to an id that named several records cannot be resolved and is dropped; the report lists each one.
  function convertToPermanentIds(data) {
    if (!isObject(data) || !Array.isArray(data.households) || data.record_id_version === RECORD_ID_VERSION) return null;
    const owners = new Map();
    data.households.forEach(record => {
      if (!isObject(record) || typeof record.id !== "string") return;
      owners.set(record.id, (owners.get(record.id) || 0) + 1);
    });
    const idMap = new Map();
    const dropped = [];
    data.households.forEach((record, index) => {
      if (!isObject(record)) return;
      const oldId = typeof record.id === "string" ? record.id : null;
      const id = newRecordId();
      if (oldId && owners.get(oldId) === 1) idMap.set(oldId, id);
      record.legacy_id = oldId;
      record.id = id;
      record.household_id = id;
      if (Array.isArray(record.member_identities)) {
        record.member_identities.forEach(member => {
          if (!isObject(member)) return;
          member.household_id = id;
          member.id = memberIdentityId(id, Number.isInteger(member.position) ? member.position : 0);
        });
      }
      if (oldId && owners.get(oldId) > 1) dropped.push(`${label(record, index)}: its old id “${oldId}” was shared by ${owners.get(oldId)} records, so links to it could not be kept.`);
    });
    const mapped = (oldId, where) => {
      if (oldId == null) return null;
      if (idMap.has(oldId)) return idMap.get(oldId);
      dropped.push(`${where}: the link to “${oldId}” matched no single household and was removed.`);
      return null;
    };
    data.households.forEach((record, index) => {
      if (!isObject(record) || !Array.isArray(record.residence_links)) return;
      record.residence_links.forEach(link => {
        if (!isObject(link)) return;
        const where = `${label(record, index)}, neighbor “${link.name || "?"}”`;
        if (link.household_id) {
          link.household_id = mapped(link.household_id, where);
          if (!link.household_id) link.resolution_status = "unresolved";
        }
        link.candidate_household_ids = (Array.isArray(link.candidate_household_ids) ? link.candidate_household_ids : [])
          .map(id => idMap.get(id)).filter(Boolean);
      });
    });
    data.duplicate_decisions = (Array.isArray(data.duplicate_decisions) ? data.duplicate_decisions : []).flatMap(decision => {
      const ids = String(decision?.key || "").split("|");
      const remapped = ids.map(id => idMap.get(id));
      if (ids.length !== 2 || remapped.some(id => !id)) {
        dropped.push(`A “keep separate” decision for “${decision?.key || "?"}” no longer matched two households and was removed.`);
        return [];
      }
      return [{ ...decision, key: remapped.sort().join("|") }];
    });
    // A merge's "before" copies are restored by undo, so they carry the ids the records have now.
    (Array.isArray(data.merge_history) ? data.merge_history : []).forEach(history => {
      ["canonicalBefore", "duplicateBefore"].forEach(field => {
        const copy = history?.[field];
        if (!isObject(copy)) return;
        const id = idMap.get(copy.id) || newRecordId();
        idMap.set(copy.id, id);
        copy.legacy_id = copy.id;
        copy.id = id;
        copy.household_id = id;
      });
    });
    data.record_id_version = RECORD_ID_VERSION;
    data.record_id_migration = { convertedAt: new Date().toISOString(), droppedReferences: dropped };
    return { converted: data.households.length, dropped };
  }

  // Returns the converted copy and what would be dropped, leaving the given data unchanged.
  function planPermanentIds(data) {
    const copy = JSON.parse(JSON.stringify(data));
    const report = convertToPermanentIds(copy);
    return report ? { data: copy, dropped: report.dropped } : null;
  }

  // Makes every record safe to display, edit, and migrate. Records that are not objects, or have neither
  // a head nor source text, cannot be repaired and are removed. Returns the list of changes made.
  function repairProjectData(data) {
    const changes = [];
    if (!isObject(data) || !Array.isArray(data.households)) {
      throw new Error("This file does not contain valid Catasto household data.");
    }
    // A missing optional field is simply filled in; only a value that had to be changed is reported.
    const text = (record, field, where) => {
      if (typeof record[field] === "string") return;
      if (record[field] != null) changes.push(`${where}: ${field.replace(/_/g, " ")} was not text and was converted.`);
      record[field] = record[field] == null ? "" : String(record[field]);
    };
    const kept = [];
    data.households.forEach((record, index) => {
      const where = label(record, index);
      const hasHead = isObject(record) && typeof record.household_head === "string" && record.household_head.trim();
      const hasSource = isObject(record) && typeof record.source_entry === "string" && record.source_entry.trim();
      if (!isObject(record) || (!hasHead && !hasSource)) {
        changes.push(`${where}: has no household head or source entry and was removed.`);
        return;
      }
      if (!hasHead) {
        const firstLine = record.source_entry.trim().split("\n")[0].split(",")[0].trim();
        changes.push(`${where}: household head was missing; taken from the first source line (“${firstLine}”).`);
        record.household_head = firstLine;
      }
      if (typeof record.id !== "string" || !record.id) {
        record.id = newRecordId();
        record.household_id = record.id;
      }
      ["members_text", "source_entry"].forEach(field => text(record, field, where));
      if (!Array.isArray(record.source_pages) || record.source_pages.some(page => !Number.isFinite(page))) {
        if (record.source_pages != null) changes.push(`${where}: source pages were not a list of page numbers; invalid entries were removed.`);
        record.source_pages = Array.isArray(record.source_pages) ? record.source_pages.filter(Number.isFinite) : [];
      }
      if (!isObject(record.residence)) {
        if (record.residence != null) changes.push(`${where}: residence was not readable and was reset.`);
        record.residence = { place: null, description: null, adjacent_to: [] };
      }
      const residence = record.residence;
      ["place", "description"].forEach(field => {
        if (residence[field] != null && typeof residence[field] !== "string") {
          changes.push(`${where}: residence ${field} was not text and was removed.`);
          residence[field] = null;
        }
        residence[field] = residence[field] ?? null;
      });
      if (!Array.isArray(residence.adjacent_to) || residence.adjacent_to.some(name => typeof name !== "string")) {
        if (residence.adjacent_to != null) changes.push(`${where}: residence neighbors were not a list of names; invalid entries were removed.`);
        residence.adjacent_to = Array.isArray(residence.adjacent_to) ? residence.adjacent_to.filter(name => typeof name === "string") : [];
      }
      if (record.residence_links != null && !Array.isArray(record.residence_links)) {
        changes.push(`${where}: residence links were not a list and were removed; they are rebuilt from the neighbors.`);
        record.residence_links = [];
      }
      record.residence_links = (record.residence_links || []).filter(link => {
        const valid = isObject(link) && typeof link.name === "string";
        if (!valid) changes.push(`${where}: an unreadable residence link was removed.`);
        return valid;
      });
      kept.push(record);
    });
    data.households = kept;
    const owners = new Map();
    kept.forEach(record => owners.set(record.id, (owners.get(record.id) || 0) + 1));
    const shared = new Set([...owners].filter(([, count]) => count > 1).map(([id]) => id));
    if (shared.size) {
      kept.forEach((record, index) => {
        if (!shared.has(record.id)) return;
        changes.push(`${label(record, index)}: shared the id “${record.id}” with another household and was given a new one.`);
        record.legacy_id = record.id;
        record.id = newRecordId();
        record.household_id = record.id;
        (record.member_identities || []).forEach(member => {
          if (isObject(member)) member.id = memberIdentityId(record.id, Number.isInteger(member.position) ? member.position : 0);
          if (isObject(member)) member.household_id = record.id;
        });
      });
      kept.forEach((record, index) => record.residence_links.forEach(link => {
        if (shared.has(link.household_id)) {
          changes.push(`${label(record, index)}, neighbor “${link.name}”: the link pointed at a shared id and was removed.`);
          link.household_id = null;
          link.resolution_status = "unresolved";
        }
        link.candidate_household_ids = (Array.isArray(link.candidate_household_ids) ? link.candidate_household_ids : []).filter(id => !shared.has(id));
      }));
      data.duplicate_decisions = (Array.isArray(data.duplicate_decisions) ? data.duplicate_decisions : []).filter(decision => {
        const ids = String(decision?.key || "").split("|");
        if (!ids.some(id => shared.has(id))) return true;
        changes.push(`A “keep separate” decision for “${decision.key}” named a shared id and was removed.`);
        return false;
      });
    }
    return changes;
  }

  function personKey(name) {
    return window.CatastoParser.personKey(String(name || ""));
  }

  // A record carries the user's own work once its source or residence was edited, or another record
  // was merged into it.
  function hasUserEdits(record) {
    return Boolean(record.source_edited_at || record.residence_edited_at || record.source_entries?.length || record.aliases?.length);
  }

  function sourceKey(text) {
    return String(text || "").trim();
  }

  function entryHead(text) {
    const firstLine = sourceKey(text).split("\n").find(line => line.trim()) || "";
    return personKey(window.CatastoParser.memberPersonName(firstLine) || firstLine.split(",")[0]);
  }

  function neighborDiff(before, after) {
    const keys = list => new Map((list || []).map(name => [personKey(name), name]));
    const old = keys(before);
    const now = keys(after);
    return {
      added: [...now].filter(([key]) => !old.has(key)).map(([, name]) => name),
      removed: [...old].filter(([key]) => !now.has(key)).map(([, name]) => name)
    };
  }

  // Builds the reparsed project data without saving it.
  // - A merged record claims every new entry whose text equals one of its merged source entries; an
  //   entry found only by its head's name is an uncertain match and blocks the update until reviewed.
  // - Other new records are matched by identical source text, then by head name or alias in order, and
  //   keep the stored record's permanent id.
  // - Records the user edited or merged keep their stored content, including those the new parse no
  //   longer finds. An unedited record keeps a stored residence place the new parse reads differently,
  //   since older versions applied residence corrections without marking them; where the new parse places
  //   households in their settlement (a village without neighborhoods), the settlement is shown as a change.
  // - Page numbers taken only from a record's position are marked "inferred".
  // `changes` lists, per record, what the update would change.
  function planReparse(project, parsed) {
    const stored = project.data.households;
    const fresh = parsed.households.map(record => ({ ...record }));
    const claimed = new Set();
    const matchFor = new Map();
    const claim = (freshIndex, storedIndex) => {
      claimed.add(storedIndex);
      matchFor.set(freshIndex, storedIndex);
    };
    const freshBySource = new Map();
    fresh.forEach((record, index) => {
      const key = sourceKey(record.source_entry);
      if (!freshBySource.has(key)) freshBySource.set(key, []);
      freshBySource.get(key).push(index);
    });
    const freeFresh = indices => (indices || []).find(index => !matchFor.has(index));
    const uncertainMerges = [];
    stored.forEach((record, storedIndex) => {
      if (!record.source_entries?.length) return;
      record.source_entries.forEach(entry => {
        let freshIndex = freeFresh(freshBySource.get(sourceKey(entry.text)));
        if (freshIndex === undefined) {
          const head = entryHead(entry.text);
          freshIndex = fresh.findIndex((candidate, index) => !matchFor.has(index) && head && personKey(candidate.household_head) === head);
          if (freshIndex < 0) return;
          uncertainMerges.push(record.household_head);
        }
        claim(freshIndex, storedIndex);
      });
    });
    const bySource = new Map();
    stored.forEach((record, index) => {
      const key = sourceKey(record.source_entry);
      if (!key || claimed.has(index)) return;
      if (!bySource.has(key)) bySource.set(key, []);
      bySource.get(key).push(index);
    });
    fresh.forEach((record, freshIndex) => {
      if (matchFor.has(freshIndex)) return;
      const storedIndex = (bySource.get(sourceKey(record.source_entry)) || []).find(index => !claimed.has(index));
      if (storedIndex !== undefined) claim(freshIndex, storedIndex);
    });
    const byHead = new Map();
    stored.forEach((record, index) => {
      [record.household_head, ...(record.aliases || [])].forEach(name => {
        const key = personKey(name);
        if (!key) return;
        if (!byHead.has(key)) byHead.set(key, []);
        byHead.get(key).push(index);
      });
    });
    fresh.forEach((record, freshIndex) => {
      if (matchFor.has(freshIndex)) return;
      const storedIndex = (byHead.get(personKey(record.household_head)) || []).find(index => !claimed.has(index));
      if (storedIndex !== undefined) claim(freshIndex, storedIndex);
    });

    const parseIdToFinal = new Map();
    const emitted = new Set();
    const changes = [];
    const summary = { matched: 0, keptEdits: 0, added: 0, removed: 0, keptUnmatchedEdits: 0, inferredPages: 0, keptPlaces: 0, neighborChanges: 0 };
    const households = [];
    fresh.forEach((record, freshIndex) => {
      const storedIndex = matchFor.get(freshIndex);
      const previous = storedIndex === undefined ? null : stored[storedIndex];
      const id = previous?.id || newRecordId();
      parseIdToFinal.set(record.id, id);
      if (!previous) {
        summary.added += 1;
        changes.push({ head: record.household_head, kind: "added" });
        households.push({ ...record, id, household_id: id });
        return;
      }
      // A merged record claims several new entries but is kept once.
      if (emitted.has(storedIndex)) return;
      emitted.add(storedIndex);
      summary.matched += 1;
      if (hasUserEdits(previous)) {
        summary.keptEdits += 1;
        households.push({ ...previous, source_pages: previous.source_pages?.length ? previous.source_pages : record.source_pages || [] });
        return;
      }
      const updated = { ...record, id, household_id: id, residence: { ...record.residence } };
      const storedPlace = previous.residence?.place;
      // A settlement given because the village names no neighborhoods replaces an older reading of the house's
      // name ("lo Casalicchio", "Not Listed"), which was never a correction.
      if (storedPlace && storedPlace !== updated.residence.place && updated.residence.place_basis !== "community") {
        updated.residence.place = storedPlace;
        summary.keptPlaces += 1;
      } else if ((storedPlace || null) !== (updated.residence.place || null)) {
        changes.push({ head: record.household_head, kind: "place", from: storedPlace || null, to: updated.residence.place || null });
      }
      const neighbors = neighborDiff(previous.residence?.adjacent_to, updated.residence.adjacent_to);
      if (neighbors.added.length || neighbors.removed.length) {
        summary.neighborChanges += 1;
        changes.push({ head: record.household_head, kind: "neighbors", ...neighbors });
      }
      households.push(updated);
    });
    stored.forEach((record, index) => {
      if (claimed.has(index)) return;
      if (!hasUserEdits(record)) {
        summary.removed += 1;
        changes.push({ head: record.household_head, kind: "removed" });
        return;
      }
      summary.keptUnmatchedEdits += 1;
      const kept = { ...record };
      // Only the record's position links it to the new parse, so pages taken from there are a guess.
      const positional = fresh[index];
      if (!kept.source_pages?.length && positional?.source_pages?.length && !matchFor.has(index)) {
        kept.source_pages = positional.source_pages;
        kept.source_pages_inferred = true;
        summary.inferredPages += 1;
      }
      households.push(kept);
    });
    households.forEach(record => {
      (record.residence_links || []).forEach(link => {
        if (link.household_id && parseIdToFinal.has(link.household_id)) link.household_id = parseIdToFinal.get(link.household_id);
        link.candidate_household_ids = [...new Set((link.candidate_household_ids || []).map(id => parseIdToFinal.get(id) || id))];
      });
      record.member_identities = (record.member_identities || []).map(member => ({
        ...member,
        household_id: record.id,
        id: memberIdentityId(record.id, member.position || 0)
      }));
    });
    const data = {
      ...parsed,
      households,
      record_id_version: RECORD_ID_VERSION,
      source_document: project.data.source_document || parsed.source_document,
      source_range: project.data.source_range || parsed.source_range,
      merge_history: project.data.merge_history || [],
      duplicate_decisions: project.data.duplicate_decisions || [],
      requested_household_count: households.length,
      extracted_household_count: households.length
    };
    return { data, summary, changes, uncertainMerges: [...new Set(uncertainMerges)] };
  }

  // A project can be reparsed only when it kept its transcription and was parsed by an older parser.
  function needsReparse(project) {
    return Boolean(project?.sourceText) && project.data?.parser_version !== window.CatastoParser.PARSER_VERSION;
  }

  window.CatastoRecords = {
    RECORD_ID_VERSION, convertToPermanentIds, hasUserEdits, needsReparse, newRecordId, planPermanentIds, planReparse,
    repairProjectData
  };
}());
