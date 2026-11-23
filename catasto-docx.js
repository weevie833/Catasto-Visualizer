// Reads the text of a Word (.docx) transcription, one paragraph per line, as the Catasto parser expects.
// A .docx is a ZIP archive; the text is in word/document.xml. Uses the browser's DecompressionStream,
// so no library is needed. Deleted tracked changes, field codes, and text-box fallback copies are skipped.
(function () {
  "use strict";

  const DOCUMENT_PART = "word/document.xml";
  const MB = 1024 * 1024;
  // A source file is read whole into memory, so its size is checked first. The Word text (word/document.xml) is
  // counted as it is unpacked and refused past MAX_DOCUMENT_BYTES, so a small compressed file cannot expand without
  // bound; the size the archive declares is checked too but not trusted. A saved project's text is far smaller:
  // the 368-household Marano transcription is under 2 MB.
  const MAX_SOURCE_BYTES = 50 * MB;
  const MAX_DOCUMENT_BYTES = 100 * MB;

  function readError(message) {
    return new Error(`This file could not be read as a Word document (${message}). Save it as .docx and try again.`);
  }

  const tooLarge = limit => readError(`its text is larger than ${Math.round(limit / MB)} MB`);

  // Unpacks deflated bytes, stopping as soon as the output passes limit.
  async function inflateRaw(bytes, limit) {
    if (typeof DecompressionStream !== "function") throw readError("this browser cannot unpack .docx files");
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      let result;
      try {
        result = await reader.read();
      } catch {
        throw readError("damaged compressed text");
      }
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) {
        reader.cancel().catch(() => {});
        throw tooLarge(limit);
      }
      chunks.push(result.value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach(chunk => { out.set(chunk, offset); offset += chunk.byteLength; });
    return out;
  }

  // The bytes of one file in a ZIP archive, found through the central directory.
  async function zipEntry(buffer, wanted, limit) {
    const view = new DataView(buffer);
    let end = -1;
    for (let i = buffer.byteLength - 22; i >= Math.max(0, buffer.byteLength - 22 - 65535); i -= 1) {
      if (view.getUint32(i, true) === 0x06054B50) { end = i; break; }
    }
    if (end < 0) throw readError("not a ZIP archive");
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const decoder = new TextDecoder();
    for (let n = 0; n < count; n += 1) {
      if (offset + 46 > buffer.byteLength || view.getUint32(offset, true) !== 0x02014B50) throw readError("damaged ZIP directory");
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const declaredSize = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      const name = decoder.decode(new Uint8Array(buffer, offset + 46, nameLength));
      offset += 46 + nameLength + extraLength + commentLength;
      if (name !== wanted) continue;
      if (view.getUint32(localOffset, true) !== 0x04034B50) throw readError("damaged ZIP entry");
      const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      if (start + compressedSize > buffer.byteLength) throw readError("damaged ZIP entry");
      if (declaredSize > limit || (method === 0 && compressedSize > limit)) throw tooLarge(limit);
      const data = new Uint8Array(buffer, start, compressedSize);
      if (method === 0) return data;
      if (method === 8) return inflateRaw(data, limit);
      throw readError("unsupported compression");
    }
    return null;
  }

  function decodeEntities(text) {
    return text.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (match, hex, dec, named) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (dec) return String.fromCodePoint(parseInt(dec, 10));
      return { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" }[named.toLowerCase()];
    });
  }

  // Plain text from WordprocessingML: paragraphs become lines; tabs and line breaks are kept.
  // In Word every paragraph is a block of its own, set apart by paragraph spacing rather than by empty
  // paragraphs. A paragraph that isHeading recognizes (the parser's section-heading test) therefore gets a
  // blank line before and after it, as a heading in a text file has, so it still separates the sections.
  function textFromDocumentXml(xml, { isHeading = null } = {}) {
    const lines = [];
    let line = "";
    let skip = 0; // inside a deleted change, a text-box fallback copy, or paragraph settings (tab stops)
    const tokens = /<(\/?)(w:p|w:pPr|w:del|mc:Fallback|w:t|w:tab|w:br|w:cr)\b[^>]*?(\/?)>|([^<]+)/g;
    let inText = false;
    let match;
    while ((match = tokens.exec(xml))) {
      const [, closing, tag, selfClosing, text] = match;
      if (text !== undefined) {
        if (inText && !skip) line += decodeEntities(text);
        continue;
      }
      if (tag === "w:del" || tag === "mc:Fallback" || tag === "w:pPr") {
        if (!selfClosing) skip += closing ? -1 : 1;
      } else if (tag === "w:t") {
        inText = !closing && !selfClosing;
      } else if (skip) {
        continue;
      } else if (tag === "w:p") {
        if (closing || selfClosing) { lines.push(line); line = ""; }
      } else if (!closing) {
        line += tag === "w:tab" ? "\t" : "\n";
      }
    }
    if (line) lines.push(line);
    const spaced = [];
    lines.forEach((paragraph, index) => {
      const heading = isHeading && paragraph.trim() && !paragraph.includes("\n") && isHeading(paragraph);
      if (heading && spaced.length && spaced.at(-1).trim()) spaced.push("");
      spaced.push(paragraph);
      if (heading && index + 1 < lines.length && lines[index + 1].trim()) spaced.push("");
    });
    return spaced.join("\n").replace(/[ \t]+$/gm, "");
  }

  // The parser's section-heading test, when the parser is loaded (Admin loads it first).
  function parserHeading(text) {
    return Boolean(window.CatastoParser?.sectionHeadingKind?.(text));
  }

  async function textFromDocx(buffer, { isHeading = parserHeading, maxDocumentBytes = MAX_DOCUMENT_BYTES } = {}) {
    const bytes = await zipEntry(buffer, DOCUMENT_PART, maxDocumentBytes);
    if (!bytes) throw readError("no document text found");
    return textFromDocumentXml(new TextDecoder().decode(bytes), { isHeading });
  }

  function isDocx(file) {
    return /\.docx$/i.test(file?.name || "");
  }

  // The text of a chosen or dropped source file: .docx is unpacked, anything else is read as text.
  async function readSourceFile(file) {
    if (/\.doc$/i.test(file.name)) throw new Error("Older Word (.doc) files cannot be read. Save the file as .docx and try again.");
    if (file.size > MAX_SOURCE_BYTES) {
      throw new Error(`${file.name} is larger than ${MAX_SOURCE_BYTES / MB} MB, too large to be a Catasto transcription.`);
    }
    return isDocx(file) ? textFromDocx(await file.arrayBuffer()) : file.text();
  }

  window.CatastoDocx = { textFromDocx, textFromDocumentXml, readSourceFile, isDocx, MAX_SOURCE_BYTES, MAX_DOCUMENT_BYTES };
}());
