// These are illustrative style rules, not architectural facts extracted from the tax record.
export function classifyBuilding(unit) {
  if (unit.source !== 'extracted') return { type: 'reference', label: 'Boundary reference', height: 2.2 };
  const head = String(unit.head || '');
  const text = [head, unit.role, unit.sourceEntry].filter(Boolean).join('\n');
  const parish = text.match(/\b(?:parish\s+church|parochial\s+church|chiesa\s+parrocchiale|parrocchia)\b/i) || head.match(/\bparish\b/i);
  if (parish) return {
    type: 'parish', label: '18th-century parish style', height: 6.2,
    cue: `Style cue: ${parish[0]} mentioned in the source.`
  };
  // Titles must belong to this household head, not to a neighbor or creditor in the entry.
  const honorific = head.match(/\b(?:Illustrious|Illustrius|Magnificent|Illustrissim[oa]|Magnific[oa])\b/i);
  if (honorific) return {
    type: 'manor', label: '18th-century manor style', height: 5.6,
    cue: `Style cue: the household head is titled ${honorific[0]}.`
  };
  return { type: 'dwelling', label: 'Rural dwelling', height: 3.4 };
}
