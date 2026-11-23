import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { chromium } from "playwright";

// A real-browser check of the pages as served: the server's security policy, the 3D view, Admin's
// project creation, and a source edit that survives a reload. The server runs on a free port with a
// temporary project folder, so the user's own projects are never read or changed.
// Run: npm run test:browser   (needs Playwright's Chromium: npx playwright install chromium)
const root = fileURLToPath(new URL(".", import.meta.url));
const fixture = await readFile(new URL("./test-fixtures/synthetic-catasto.md", import.meta.url), "utf8");

async function startServer(dataDir) {
  const script = [
    "import sys; from pathlib import Path; import serve",
    "server = serve.create_server(port=0, directory=Path(sys.argv[1]), data_dir=Path(sys.argv[2]))",
    "print(server.server_address[1], flush=True)",
    "server.serve_forever()"
  ].join("\n");
  const child = spawn("python3", ["-c", script, root, dataDir], { cwd: root, env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  const port = await new Promise((resolve, reject) => {
    child.stdout.once("data", data => resolve(Number(String(data).trim())));
    child.once("exit", code => reject(new Error(`The server stopped (exit ${code}).`)));
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

test("Admin creates a project and the Visualizer shows, edits, and keeps it", { timeout: 60_000 }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), "catasto-browser-"));
  const server = await startServer(dataDir);
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.child.kill();
    await rm(dataDir, { recursive: true, force: true });
  });

  const problems = [];
  const page = await browser.newPage();
  // Policy violations (an inline script or style, a blocked import) are reported here.
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", event => console.error(`CSP blocked ${event.violatedDirective}: ${event.blockedURI}`));
  });
  page.on("console", message => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", error => problems.push(error.message));

  await page.goto(`${server.url}/admin.html`);
  await page.selectOption("#sourceLanguage", "en");
  await page.setInputFiles("#textFile", { name: "Casale Esempio.md", mimeType: "text/markdown", buffer: Buffer.from(fixture) });
  await page.waitForFunction(() => /loaded/.test(document.querySelector("#createStatus").textContent));
  await page.fill("#projectName", "Casale Esempio test");
  await page.click("#createProject");
  await page.waitForSelector("#successNotice:not([hidden])");
  assert.match(await page.textContent("#createStatus"), /with 5 households/);

  await page.goto(`${server.url}/index.html`);
  const buttons = page.locator("#householdList .household-button");
  await buttons.first().waitFor();
  assert.equal(await buttons.count(), 5);
  assert.match(await page.textContent("#catastoTitle"), /Casale Esempio/);
  const canvas = await page.locator("#sceneCanvas canvas").boundingBox();
  assert.ok(canvas && canvas.width > 0 && canvas.height > 0, "the 3D view draws a canvas");

  await buttons.filter({ hasText: "Bruno Ventrella" }).first().click();
  await page.waitForFunction(() => document.querySelector("#sourceEntry").textContent.includes("Bruno Ventrella"));
  await page.click("#editSourceEntry");
  await page.waitForSelector("#sourceEditModal.open");
  const edited = (await page.inputValue("#sourceEditText")).replace("day laborer — age 44", "day laborer — age 45");
  await page.fill("#sourceEditText", edited);
  await page.click("#sourceEditSave");
  await page.waitForSelector("#sourceEditModal.open", { state: "hidden" });
  await page.waitForSelector("#storageNotice[hidden]", { state: "attached" });

  await page.reload();
  await buttons.filter({ hasText: "Bruno Ventrella" }).first().click();
  await page.waitForFunction(() => document.querySelector("#sourceEntry").textContent.includes("age 45"));

  const saved = (await readdir(join(dataDir, "projects"))).filter(name => name.endsWith(".json"));
  assert.equal(saved.length, 1);
  assert.deepEqual(problems, []);
});

// A minimal Word file: one paragraph per line of text, deflated like Word's own.
function docxFrom(text) {
  const escape = line => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = text.split("\n").map(line => `<w:p><w:r><w:t xml:space="preserve">${escape(line)}</w:t></w:r></w:p>`).join("");
  const name = Buffer.from("word/document.xml");
  const raw = Buffer.from(`<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const data = deflateRawSync(raw);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034B50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc32(raw), 14);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(name.length, 26);
  const entry = Buffer.alloc(46);
  entry.writeUInt32LE(0x02014B50, 0);
  entry.writeUInt16LE(8, 10);
  entry.writeUInt32LE(crc32(raw), 16);
  entry.writeUInt32LE(data.length, 20);
  entry.writeUInt32LE(raw.length, 24);
  entry.writeUInt16LE(name.length, 28);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(entry.length + name.length, 12);
  end.writeUInt32LE(local.length + name.length + data.length, 16);
  return Buffer.concat([local, name, data, entry, name, end]);
}

test("Admin reads Word files dropped on the source file and import areas", { timeout: 60_000 }, async t => {
  const dataDir = await mkdtemp(join(tmpdir(), "catasto-browser-"));
  const server = await startServer(dataDir);
  const browser = await chromium.launch();
  t.after(async () => {
    await browser.close();
    server.child.kill();
    await rm(dataDir, { recursive: true, force: true });
  });

  const problems = [];
  const page = await browser.newPage();
  page.on("console", message => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", error => problems.push(error.message));
  await page.goto(`${server.url}/admin.html`);
  await page.selectOption("#sourceLanguage", "en");

  // A native drop through Chromium's input layer, as from the Finder, not a synthetic page event.
  const docxPath = join(dataDir, "Casale Esempio.docx");
  await writeFile(docxPath, docxFrom(fixture));
  const box = await page.locator("#sourceDropZone").boundingBox();
  const cdp = await page.context().newCDPSession(page);
  const drag = { x: box.x + box.width / 2, y: box.y + box.height / 2, data: { items: [], files: [docxPath], dragOperationsMask: 1 } };
  for (const type of ["dragEnter", "dragOver", "drop"]) await cdp.send("Input.dispatchDragEvent", { type, ...drag });
  await page.waitForFunction(() => /loaded/.test(document.querySelector("#createStatus").textContent));
  assert.equal(await page.inputValue("#projectName"), "Casale Esempio");
  assert.equal(await page.textContent("#dropFileName"), "Casale Esempio.docx");

  await page.click("#createProject");
  await page.waitForSelector("#successNotice:not([hidden])");
  assert.match(await page.textContent("#createStatus"), /with 5 households/);
  assert.equal(await page.textContent("#dropFileName"), "");

  // Choosing a file with the picker reads it the same way.
  await page.setInputFiles("#textFile", { name: "Picked.docx", mimeType: "application/octet-stream", buffer: docxFrom(fixture) });
  await page.waitForFunction(() => /Picked\.docx loaded/.test(document.querySelector("#createStatus").textContent));
  assert.equal(await page.inputValue("#projectName"), "Picked");

  // The Project Library's import area takes a dropped file too.
  const importPath = join(dataDir, "Dropped Import.docx");
  await writeFile(importPath, docxFrom(fixture));
  await page.locator("#importDropZone").scrollIntoViewIfNeeded();
  const importBox = await page.locator("#importDropZone").boundingBox();
  const importDrag = { x: importBox.x + importBox.width / 2, y: importBox.y + importBox.height / 2, data: { items: [], files: [importPath], dragOperationsMask: 1 } };
  for (const type of ["dragEnter", "dragOver", "drop"]) await cdp.send("Input.dispatchDragEvent", { type, ...importDrag });
  await page.waitForFunction(() => /Imported 1 project/.test(document.querySelector("#libraryStatus").textContent));
  assert.match(await page.textContent("#successNotice"), /Imported “Dropped Import”[\s\S]*5 households/);
  assert.equal((await readdir(join(dataDir, "projects"))).filter(name => name.endsWith(".json")).length, 2);
  assert.deepEqual(problems, []);
});
