# Catasto Visualizer

Prototype for visualizing household proximity from the 1754 Catasto Onciario of Marano Marchesato, Cosenza, Italy.

## Current Prototype

Open `index.html` in a browser or serve the folder locally:

```bash
python3 -m http.server 8000
```

Then visit:

```text
http://127.0.0.1:8000/index.html
```

## Visualization Rules

- One polygon represents one household unit from the tax record.
- A polygon represents the household's lived/property unit, not every parcel or landholding mentioned in the entry.
- Household members appear inside the polygon.
- Assets are decorative annotations inside the polygon.
- Polygons touch only when the residence/property-unit description in the tax record indicates adjacency.
- Landholding boundary names remain in the source text and do not create touching household polygons in this view.
- Genealogical inference comes from the user observing names and proximity, not from the layout engine forcing kinship relationships.

## Current Files

- `index.html` - single-file interactive prototype
- `households_pages_5_13.json` - extracted English household data for Pages 5-13
- `extract_page_5_13_households.py` - repeatable DOCX-to-JSON extraction script
- `README.md` - project notes and visualization rules
- `requirements.txt` - currently empty; reserved for future tooling
- `MM 1754 Catasto Onciario Transcription EDIT.docx` - current transcription source document
- `MM 1754 Catasto Onciario Transcription.docx` - earlier transcription source document

## Future Direction

The next likely step is to move the embedded sample data out of `index.html` into structured data files, such as JSON or CSV, with fields for household members, residence adjacency, assets, source text, and confidence notes.
