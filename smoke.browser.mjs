import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
  await page.fill("#projectName", "Casale Esempio test");
  await page.fill("#plainText", fixture);
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
