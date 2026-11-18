// XLSX Index: one row per person in a project, laid out as the Customizable Transcriber's
// "Catasto Onciario Index" template (sheet "Nati"). Built from the Name Index's mentions when Admin
// exports it; never saved. The rules are in XLSX_INDEX_PLAN.md.
(function () {
  "use strict";

  const N = () => window.CatastoNameIndex;
  const R = () => window.CatastoRelations;

  // The template's layout: widths and the one header row with its fills.
  const GREY = "B7B7B7";
  const BLUE = "9FC5E8";
  const ORANGE = "F9CB9C";
  const ROSE = "E6B8AF";
  const LAYOUT = {
    name: "Nati",
    widths: [19.66, 12.66, 18.66, 23.33, 15, 19.33, 12.66, 17.33, 16.66, 18.83, 16.33, 19.66, 12.66, 24.16],
    header: [
      [["Image Number", GREY], ["Honorific", BLUE], ["Given Name", BLUE], ["Last Name", BLUE], ["Age", BLUE],
        ["Birth Year (est.)", BLUE], ["Occupation", BLUE], ["Father Given Name", ORANGE], ["Father Last Name", ORANGE],
        ["Mother Given Name", ROSE], ["Mother Last Name", ROSE], ["Resident Village", GREY], ["Resident District", GREY], ["Notes", GREY]]
    ].map(row => row.map(([text, fill]) => ({ text, fill }))),
    merges: []
  };

  const NOBLE_HONORIFIC = /\b(?:Magnific\w*|Illustri\w*|Noble\w*|Nobil\w*)\b/i;
  const FEMALE = /\b(?:widow|vedova|virgin|vergine|nubile|in capillis|nun|monaca|Donna|Dona|Magnifica|Lady|Sister|Suor[ae]?)\b/i;
  // Words beside a name that describe a condition rather than an occupation. They go to Notes.
  const CONDITION = /^(?:married|unmarried|single|widow(?:ed|er)?|virgin|maiden|crippled|disabled|decrepit|aged|old|elderly|blind|deaf|mute|sick|ill|infirm|lame|head of (?:the )?household|in capillis|nubile|maritat[ao]|vergine|vedov[oa]|stroppi[oa]|decrepit[oa]|ciec[oa]|vivente|capo di casa)\b/i;

  function pageList(pages) {
    return [...new Set(pages.filter(Number.isFinite))].sort((a, b) => a - b);
  }

  // "Marano Marchesato 1754" is a Catasto of 1754.
  function catastoYear(data) {
    return Number(String(data?.source_title || "").match(/\b(1[4-9]\d\d)\b/)?.[1]) || null;
  }

  function relationLabel(role) {
    if (!role || role === "member") return "household member, relation not stated";
    return role.replace(/InLaw$/, "-in-law").replace(/([A-Z])/g, " $1").toLowerCase();
  }

  // The occupation written beside the name, with conditions (married, crippled) set apart for Notes.
  // A titled noble (Magnificent, Illustrious) is a Noble.
  function occupationOf(person) {
    const conditions = [];
    const occupations = [];
    if (person.line) {
      let text = R().descriptionOf(person.line, person.role);
      if (person.qualifier) text = text.replace(person.qualifier, " ");
      text = text.replace(/\([^)]*\)/g, " ")
        .replace(/\b(?:son|daughter|figli[oa])\s+of\s+(?:the\s+late\s+)?[A-Z]\S*(?:\s+[A-Z]\S*)*/g, " ")
        .replace(/,?\s*\b(?:as\s+noted\s+in|also\s+from|(?:of|from)\s+the\s+(?:Land|City)\s+of|for\s+(?:his|her|the)\b)\b.*$/i, " ")
        .replace(/\b(?:di|del\s+fu|fu|quondam)\s+[A-Z]\S*/g, " ");
      text.split(/\s*[,;]\s*|\s+(?:and|e|ed)\s+/i).forEach(piece => {
        const part = piece.replace(/^(?:(?:his|her|the|a|an|also|likewise|and)\s+)+/i, "").trim();
        if (!part || /^(?:his|her|likewise|also|-+)$/i.test(part)) return;
        if (/\bnoble(?:man|woman)?\b|\bnobile\b/i.test(part)) occupations.push("Noble");
        else if (CONDITION.test(part)) conditions.push(part);
        else occupations.push(part);
      });
    }
    return { occupations, conditions };
  }

  // Clergy titles are occupations: "Reverend Priest Don" is Reverend Don, a Priest. "Sister" stays a form of
  // address and also makes a Nun. Magnificent and Illustrious make a Noble.
  const CLERGY = [[/\b(?:Priest|Sacerdote)\b/i, "Priest", true], [/\b(?:Cleric|C(?:h)?ierico|Cherico|Clerico)\b/i, "Cleric", true],
    [/\b(?:Deacon|Diacono)\b/i, "Deacon", true], [/\b(?:Sister|Suor[ae]?)\b/i, "Nun", false]];

  function settleTitles(row) {
    const occupations = [];
    let honorific = row.honorific || "";
    if (NOBLE_HONORIFIC.test(honorific)) occupations.push("Noble");
    CLERGY.forEach(([pattern, occupation, remove]) => {
      if (!pattern.test(honorific)) return;
      occupations.push(occupation);
      if (remove) honorific = honorific.replace(pattern, " ").replace(/\s+/g, " ").trim();
    });
    const written = row.occupations || [];
    // A title's occupation is dropped when the line already says it ("domestic nun").
    const fromTitles = occupations.filter(item => !written.some(other => new RegExp(`\\b${item}\\b`, "i").test(other)));
    return { honorific, occupation: [...new Set([...fromTitles, ...written])].join(", ") };
  }

  function name(row) {
    return [row.given, row.surname].filter(Boolean).join(" ");
  }

  function newRow(mention, extra) {
    const person = mention.person;
    return {
      honorific: mention.honorific,
      given: mention.given_name,
      surname: mention.surname,
      qualifier: mention.qualifier,
      age: Number.isFinite(person.age) ? person.age : null,
      occupations: [],
      father: null,
      mother: null,
      village: mention.residential_location,
      district: "",
      imagePages: pageList(mention.pages || []),
      pages: pageList(mention.pages || []),
      notes: [],
      shared: [],
      deceased: Boolean(person.deceased),
      fatherGiven: "",
      ...extra
    };
  }

  function buildXlsxIndex(data, options = {}) {
    const { village, found } = N().collectMentions(data, options);
    const key = N().key;
    const year = catastoYear(data);
    const rows = [];
    const rowOfPerson = new Map();
    const byName = new Map();
    const nameKey = item => `${key(item.given ?? item.given_name)}|${key(item.surname)}`;
    const add = row => {
      row.order = rows.length;
      rows.push(row);
      if (!byName.has(nameKey(row))) byName.set(nameKey(row), []);
      byName.get(nameKey(row)).push(row);
      return row;
    };

    // Household members: one row each, with their household's pages and district.
    const households = new Map();
    found.filter(mention => mention.source === "household" && mention.person.kind === "member").forEach(mention => {
      const { occupations, conditions } = occupationOf(mention.person);
      const row = add(newRow(mention, {
        occupations,
        conditions,
        role: mention.person.role,
        household: true,
        district: mention.record.residence?.place || "",
        person: mention.person,
        derived: mention.surname_derived,
        infant: mention.person.age === 0 && window.CatastoParser.INFANT.test(mention.person.line || "")
      }));
      rowOfPerson.set(mention.person, row);
      if (!households.has(mention.record)) households.set(mention.record, []);
      households.get(mention.record).push(row);
    });

    // Fathers named in patronymics and late husbands, as stated for each household member.
    const statedFather = new Map();
    const lateHusband = new Map();
    found.filter(mention => mention.source === "household" && mention.person.kind !== "member").forEach(mention => {
      const of = rowOfPerson.get(mention.person.of);
      if (!of) return;
      if (mention.person.kind === "father") statedFather.set(of, mention);
      else lateHusband.set(of, mention);
    });
    const nameOf = mention => mention ? { given: mention.given_name, surname: mention.surname } : null;
    const rowName = row => row ? { given: row.given, surname: row.surname } : null;

    // Parents from the household listing. Where the record does not make the relation certain, the row says so.
    households.forEach(members => {
      const [head] = members;
      const wife = members.find(row => row.role === "wife");
      const widow = /^(?:widow|vedova)\b/i.test(head.qualifier || "");
      const headFemale = widow || FEMALE.test(`${head.honorific} ${head.person.line || ""}`) && !wife;
      const headLabel = name(head);
      head.notes.push("Head of household");
      head.father = nameOf(statedFather.get(head));
      members.slice(1).forEach(row => {
        row.notes.push(`${relationLabel(row.role)} of ${headLabel}`.replace(/^./, c => c.toUpperCase()));
        row.father = nameOf(statedFather.get(row));
        const preceding = rowOfPerson.get(row.person.precedingMan);
        if (["son", "daughter"].includes(row.role)) {
          if (widow) {
            row.father = row.father || nameOf(lateHusband.get(head));
            row.mother = rowName(head);
          } else if (headFemale) {
            row.mother = rowName(head);
            if (!row.father) row.notes.push("Father not stated; check the source");
          } else {
            row.father = row.father || rowName(head);
            if (wife) row.mother = rowName(wife);
            else row.notes.push("Mother not listed in the household");
          }
        } else if (["stepson", "stepdaughter"].includes(row.role)) {
          row.notes.push("Stepchild: parents not stated in the record; check the source");
        } else if (["grandson", "granddaughter", "nephew", "niece", "nipote"].includes(row.role)) {
          const fits = row.role.startsWith("grand") ? ["son", "sonInLaw"] : ["brother", "brotherInLaw", "son", "sonInLaw"];
          if (!row.father && preceding && fits.includes(preceding.role)) {
            row.father = rowName(preceding);
            row.notes.push(`Father taken as the preceding ${relationLabel(preceding.role)}, ${name(preceding)}; check the source`);
          } else if (!row.father) {
            row.notes.push("Parents not stated in the record; check the source");
          }
        } else if (["brother", "sister"].includes(row.role)) {
          row.father = row.father || head.father;
        }
      });
    });

    // Every other mention: patronymic fathers, late husbands, neighbors, creditors, landlords. A mention joins
    // the one person of that name; with several, its pages go to each of them for the user to judge.
    const fatherOfRow = row => key(row.father?.given || row.fatherGiven || "");
    const others = found.filter(mention => !(mention.source === "household" && mention.person.kind === "member"));
    const qualifiedFirst = [...others].sort((a, b) => Number(Boolean(b.qualifier) || b.source === "household") - Number(Boolean(a.qualifier) || a.source === "household"));
    qualifiedFirst.forEach(mention => {
      if (!mention.given_name) return;
      const deceased = Boolean(mention.person.deceased);
      // A father mentioned beside his child is never the child; a deceased person is never a living member.
      const child = mention.source === "household" ? rowOfPerson.get(mention.person.of) : null;
      const same = (byName.get(nameKey(mention)) || []).filter(row => row.deceased === deceased && row !== child);
      // "son of Santo" tells same-named people apart; "widow of" does not name a father.
      const fatherWord = /^(?:son|daughter|figli[oa]|di|del|fu|quondam)\b/i.test(mention.qualifier || "") ? N().clean(mention.person.relative).split(/\s+/)[0] : "";
      const statedFatherName = key(fatherWord);
      const targets = statedFatherName ? same.filter(row => fatherOfRow(row) === statedFatherName) : same;
      if (!targets.length) {
        const row = add(newRow(mention, {
          household: false,
          deceased,
          fatherGiven: fatherWord
        }));
        if (statedFatherName) row.father = { given: row.fatherGiven, surname: mention.surname };
        if (mention.source === "reference") row.notes.push("Not listed in a household; named in other entries");
        targets.push(row);
      } else if (targets.length > 1) {
        targets.forEach(row => row.shared.push(...pageList(mention.pages || [])));
        return;
      } else {
        targets[0].pages = pageList([...targets[0].pages, ...(mention.pages || [])]);
      }
      targets.forEach(row => {
        if ((mention.honorific || "").length > (row.honorific || "").length) row.honorific = mention.honorific;
        if (!row.household && !row.village) row.village = mention.residential_location;
        if (child) {
          const note = mention.person.kind === "husband" ? `Late husband of ${name(child)}` : `Named as the father of ${name(child)}${deceased ? " (deceased)" : ""}`;
          if (!row.notes.includes(note)) row.notes.push(note);
        }
      });
    });

    rows.forEach(row => {
      Object.assign(row, settleTitles(row));
      const sameName = byName.get(nameKey(row)).length > 1;
      if (row.qualifier && !row.notes.some(note => note.toLowerCase().includes(row.qualifier.toLowerCase()))) row.notes.push(`Written as "${row.qualifier}"`);
      if (row.conditions?.length) row.notes.push(`Described as ${row.conditions.join(", ")}`);
      if (row.infant) row.notes.push("Listed as an infant (age 0)");
      if (row.derived) row.notes.push(`Surname derived: ${row.derived}`);
      row.notes.push(`Mentioned on page${row.pages.length === 1 ? "" : "s"} ${row.pages.join(", ")}`);
      const shared = pageList(row.shared).filter(page => !row.pages.includes(page));
      if (shared.length) row.notes.push(`Also possibly on page${shared.length === 1 ? "" : "s"} ${shared.join(", ")}: another person has the same name; check the source`);
      else if (sameName) row.notes.push("Another person in this index has the same name");
    });

    const people = rows.sort((a, b) => (a.imagePages[0] ?? Infinity) - (b.imagePages[0] ?? Infinity) || a.order - b.order).map(row => [
      row.imagePages.join(", "),
      row.honorific || "",
      row.given || "",
      row.surname || "",
      row.age ?? "",
      year && row.age != null ? year - row.age : "",
      row.occupation || "",
      row.father?.given || "",
      row.father?.surname || "",
      row.mother?.given || "",
      row.mother?.surname || "",
      row.village || village,
      row.district || "",
      row.notes.join("; ")
    ]);
    return { project: options.projectName || "", village, year, rows: people };
  }

  function toXlsx(index) {
    return window.CatastoXlsx.workbook({ ...LAYOUT, rows: index.rows });
  }

  window.CatastoXlsxIndex = { buildXlsxIndex, toXlsx, LAYOUT };
}());
