import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { crc32, deflateRawSync } from "node:zlib";

const source = await readFile(new URL("./catasto-docx.js", import.meta.url), "utf8");
const context = { window: {}, Blob, Response, DecompressionStream, TextDecoder, Uint8Array, DataView };
vm.createContext(context);
vm.runInContext(source, context);
const { textFromDocx, textFromDocumentXml, readSourceFile } = context.window.CatastoDocx;

// A ZIP archive of { name: text } entries; compressed with deflate unless stored is true.
function zip(entries, stored = false) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name);
    const raw = Buffer.from(text);
    const data = stored ? raw : deflateRawSync(raw);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034B50, 0);
    header.writeUInt16LE(stored ? 0 : 8, 8);
    header.writeUInt32LE(crc32(raw), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(raw.length, 22);
    header.writeUInt16LE(nameBytes.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014B50, 0);
    entry.writeUInt16LE(stored ? 0 : 8, 10);
    entry.writeUInt32LE(crc32(raw), 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBytes.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(header, nameBytes, data);
    central.push(entry, nameBytes);
    offset += header.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(central.length / 2, 8);
  end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  const bytes = Buffer.concat([...locals, directory, end]);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

const documentXml = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="w"><w:body>
<w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Marano Marchesato 1754: Page 5</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Angelo Chiappetta </w:t></w:r><w:r><w:t>pecoraro anni 30</w:t></w:r><w:r><w:br/><w:t>Rosolia Bruno moglie</w:t><w:tab/><w:t>anni 26</w:t></w:r></w:p>
<w:p/>
<w:p><w:r><w:t>Teste due &amp; Industria &lt;12&gt; caf&#233;</w:t></w:r><w:del><w:r><w:delText>removed</w:delText></w:r></w:del><w:ins><w:r><w:t> oncie</w:t></w:r></w:ins></w:p>
<w:p><w:r><w:fldChar w:fldCharType="begin"/><w:instrText>PAGE</w:instrText></w:r><w:r><w:t>Abita in casa propria</w:t></w:r></w:p>
</w:body></w:document>`;

const expected = [
  "Marano Marchesato 1754: Page 5",
  "Angelo Chiappetta pecoraro anni 30",
  "Rosolia Bruno moglie\tanni 26",
  "",
  "Teste due & Industria <12> café oncie",
  "Abita in casa propria"
].join("\n");

test("reads paragraphs, breaks, tabs and entities, skipping deletions, field codes and tab stops", () => {
  assert.equal(textFromDocumentXml(documentXml), expected);
});

test("unpacks word/document.xml from a deflated or stored archive", async () => {
  const entries = { "[Content_Types].xml": "<Types/>", "word/document.xml": documentXml };
  assert.equal(await textFromDocx(zip(entries)), expected);
  assert.equal(await textFromDocx(zip(entries, true)), expected);
});

test("explains files that are not Word documents", async () => {
  await assert.rejects(textFromDocx(new TextEncoder().encode("plain text, not a zip").buffer), /could not be read as a Word document \(not a ZIP archive\)/);
  await assert.rejects(textFromDocx(zip({ "xl/workbook.xml": "<workbook/>" })), /no document text found/);
  await assert.rejects(readSourceFile({ name: "old.doc" }), /Older Word \(\.doc\) files cannot be read/);
});

test("reads text files as text and .docx files as Word", async () => {
  const docx = zip({ "word/document.xml": documentXml });
  assert.equal(await readSourceFile({ name: "notes.txt", text: async () => "plain" }), "plain");
  assert.equal(await readSourceFile({ name: "Source.DOCX", arrayBuffer: async () => docx }), expected);
});

// Word paragraphs with no empty paragraphs between them, as Word's own paragraph spacing allows (R4-02).
const parserSource = await readFile(new URL("./catasto-parser.js", import.meta.url), "utf8");
const withParser = { window: {}, Blob, Response, DecompressionStream, TextDecoder, Uint8Array, DataView, console };
vm.createContext(withParser);
vm.runInContext(parserSource, withParser);
vm.runInContext(source, withParser);
const paragraphs = items => `<w:document xmlns:w="w"><w:body>${items.map(item => `<w:p><w:r><w:t>${item}</w:t></w:r></w:p>`).join("")}</w:body></w:document>`;

test("a section heading in its own Word paragraph separates the sections without empty paragraphs", async () => {
  const { CatastoDocx, CatastoParser } = withParser.window;
  const cases = {
    en: ["Citizens", "Bruno Ventrella, farmer — age 40", "He lives in his own house.", "Foreign Lay Landowners",
      "Antonio La Piana of the city of Montefinto", "He possesses a vineyard, bordering Paolo Serra."],
    it: ["Cittadini", "Andrea Morrone bracciale — anni 46", "Abita in casa propria sita in San Nicola.", "Forastieri non abitanti",
      "Antonio La Piana della città di Montefinto", "Possiede una vigna, confine Paolo Serra."]
  };
  for (const [language, items] of Object.entries(cases)) {
    const text = await textFromDocx(zip({ "word/document.xml": paragraphs(items) }));
    assert.equal(await CatastoDocx.textFromDocx(zip({ "word/document.xml": paragraphs(items) })),
      [items[0], "", items[1], items[2], "", items[3], "", items[4], items[5]].join("\n"), language);
    assert.equal(text, items.join("\n"), "without the parser, paragraphs are lines as before");
    const data = CatastoParser.parsePlainText(await CatastoDocx.textFromDocx(zip({ "word/document.xml": paragraphs(items) })), language);
    assert.equal(data.excluded_sections.length, 1, language);
    assert.equal(data.households.length, 1, language);
    assert.equal(data.households[0].source_entry, `${items[1]}\n${items[2]}`, language);
  }
});

test("a heading word inside a paragraph with a soft line break is not set apart", () => {
  const xml = `<w:document><w:body><w:p><w:r><w:t>Citizens</w:t><w:br/><w:t>Bruno Ventrella, farmer — age 40</w:t></w:r></w:p></w:body></w:document>`;
  assert.equal(withParser.window.CatastoDocx.textFromDocumentXml(xml, { isHeading: () => true }), "Citizens\nBruno Ventrella, farmer — age 40");
});

// R4-04: the unpacked text is bounded. A 2 MB document stands in for the real 100 MB limit.
test("a Word document whose text would expand past the limit is refused while unpacking", async () => {
  const big = `<w:document><w:body><w:p><w:r><w:t>${"a".repeat(2 * 1024 * 1024)}</w:t></w:r></w:p></w:body></w:document>`;
  const honest = zip({ "word/document.xml": big });
  assert.ok(honest.byteLength < 10_000, "a small compressed file");
  await assert.rejects(textFromDocx(honest, { maxDocumentBytes: 1024 * 1024 }), /its text is larger than 1 MB/);

  // An archive that understates the unpacked size is stopped by the running count, not by its own figure.
  const dishonest = new DataView(honest);
  const directory = dishonest.getUint32(honest.byteLength - 22 + 16, true);
  dishonest.setUint32(directory + 24, 100, true);
  dishonest.setUint32(22, 100, true);
  await assert.rejects(textFromDocx(honest, { maxDocumentBytes: 1024 * 1024 }), /its text is larger than 1 MB/);

  const stored = zip({ "word/document.xml": big }, true);
  await assert.rejects(textFromDocx(stored, { maxDocumentBytes: 1024 * 1024 }), /its text is larger than 1 MB/);
  assert.equal((await textFromDocx(honest, { maxDocumentBytes: 3 * 1024 * 1024 })).length, 2 * 1024 * 1024);
});

test("a source file larger than the limit is refused before it is read", async () => {
  const unread = () => { throw new Error("read"); };
  await assert.rejects(readSourceFile({ name: "huge.docx", size: 51 * 1024 * 1024, arrayBuffer: unread }), /huge\.docx is larger than 50 MB/);
  await assert.rejects(readSourceFile({ name: "huge.md", size: 51 * 1024 * 1024, text: unread }), /larger than 50 MB/);
});
