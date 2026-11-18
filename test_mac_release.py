"""The Mac release: the start file, the signed app's launcher and build script (mac/), the
release workflow, the version, and what the ZIP and the app leave out."""

import os
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import serve
import update_check

ROOT = Path(__file__).resolve().parent
COMMAND = ROOT / "Start Catasto Visualizer (Mac).command"
BAT = ROOT / "Start Catasto Visualizer (Windows).bat"
MAC_DIR = ROOT / "mac"
APP_LAUNCHER = MAC_DIR / "launcher.sh"
WORKFLOW = ROOT / ".github" / "workflows" / "mac-release.yml"


def bash_syntax_ok(path):
    return subprocess.run(["bash", "-n", str(path)], capture_output=True, check=False).returncode == 0


class VersionTests(unittest.TestCase):
    def test_version_file_is_three_numbers(self):
        self.assertRegex((ROOT / "VERSION").read_text(), r"^\d+\.\d+\.\d+\n$")

    def test_footers_and_install_guide_show_the_same_version(self):
        major, minor, patch = update_check.parse_version(update_check.app_version())
        shown = f"V {major}.{minor}" + (f".{patch}" if patch else "")
        for name in ("index.html", "admin.html"):
            self.assertIn(f"&middot; {shown}</footer>", (ROOT / name).read_text(encoding="utf-8"), name)
        self.assertIn(f"**{shown}**", (ROOT / "INSTALL.md").read_text(encoding="utf-8"))


class StartFileTests(unittest.TestCase):
    def test_start_files_keep_their_line_endings(self):
        raw = COMMAND.read_bytes()
        self.assertTrue(raw.startswith(b"#!/bin/bash\n"))
        self.assertNotIn(b"\r", raw)
        self.assertTrue(raw.isascii())
        self.assertTrue(os.access(COMMAND, os.X_OK) or os.name == "nt")
        bat = BAT.read_bytes()
        self.assertEqual(bat.count(b"\n"), bat.count(b"\r\n"))

    @unittest.skipIf(os.name == "nt", "bash syntax check")
    def test_start_file_is_valid_bash(self):
        self.assertTrue(bash_syntax_ok(COMMAND))

    def test_python_is_pinned_by_hash(self):
        text = COMMAND.read_text()
        self.assertRegex(text, r'PYTHON_SHA256="[0-9a-f]{64}"')
        self.assertRegex(text, r'PYTHON_URL="https://github\.com/astral-sh/python-build-standalone/releases/download/\d+/'
                               r'cpython-3\.12\.\d+%2B\d+-aarch64-apple-darwin-install_only\.tar\.gz"')
        # A newer pin replaces the installed Python, not just the first install.
        self.assertIn('"$(installed_build)" != "$PYTHON_SHA256"', text)
        self.assertIn("python-old", text)

    @unittest.skipUnless(sys.platform == "darwin", "runs the start file")
    def test_an_installed_python_of_the_pinned_build_is_used_without_a_download(self):
        with tempfile.TemporaryDirectory() as runtime:
            text = COMMAND.read_text()
            pinned = re.search(r'PYTHON_SHA256="([0-9a-f]{64})"', text).group(1)
            python = Path(runtime) / "python" / "bin" / "python3"
            python.parent.mkdir(parents=True)
            python.write_text("#!/bin/bash\nexit 0\n")
            python.chmod(0o755)
            (Path(runtime) / "python-build.txt").write_text(pinned + "\n")
            env = dict(os.environ, CV_RUNTIME_DIR=runtime, CV_INSTALL_ONLY="1")
            result = subprocess.run(["bash", str(COMMAND)], env=env, capture_output=True, text=True, timeout=30, check=False)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertNotIn("Downloading Python", result.stdout)


class SignedAppTests(unittest.TestCase):
    def test_mac_scripts_are_executable_lf_bash(self):
        for name in ("launcher.sh", "build.sh", "make-icon.sh"):
            script = MAC_DIR / name
            raw = script.read_bytes()
            self.assertTrue(raw.startswith(b"#!/bin/bash\n") and b"\r" not in raw, name)
            self.assertTrue(os.access(script, os.X_OK) or os.name == "nt", name)
            if os.name != "nt":
                self.assertTrue(bash_syntax_ok(script), name)

    def test_identity_icon_and_start_file(self):
        info = plistlib.loads((MAC_DIR / "Info.plist").read_bytes())
        self.assertEqual(info["CFBundleIdentifier"], "io.github.weevie833.catasto-visualizer")
        self.assertEqual(info["CFBundleShortVersionString"], "__VERSION__")
        self.assertEqual(info["CFBundleExecutable"], "Catasto Visualizer")
        self.assertTrue((MAC_DIR / f"{info['CFBundleIconFile']}.icns").is_file())
        self.assertIn(f'START_FILE="{COMMAND.name}"', APP_LAUNCHER.read_text())

    def test_the_app_opens_the_servers_address(self):
        self.assertIn(f"http://{serve.HOST}:{serve.DEFAULT_PORT}/index.html", APP_LAUNCHER.read_text())

    def test_build_workflow_and_update_check_name_the_same_disk_image(self):
        name = update_check.MAC_DMG_NAME
        self.assertIn(f'DMG_NAME="{name}"', (MAC_DIR / "build.sh").read_text())
        workflow = WORKFLOW.read_text()
        self.assertIn(f"/out/{name}", workflow)
        self.assertIn('tags: ["v*"]', workflow)
        self.assertIn("< VERSION", workflow)
        self.assertNotIn("Transcriber", workflow)

    @unittest.skipUnless(sys.platform == "darwin", "uses ditto and xattr")
    def test_the_app_installs_only_a_newer_copy(self):
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            resources = tmp / "Catasto Visualizer.app" / "Contents" / "Resources"
            (resources / "app").mkdir(parents=True)
            shutil.copy2(APP_LAUNCHER, resources / "launcher.sh")
            (resources / "app" / "VERSION").write_text("0.12.0\n")
            (resources / "app" / COMMAND.name).write_text("#!/bin/bash\n")
            app_dir = tmp / "support" / "App"
            (tmp / "support" / "projects").mkdir(parents=True)
            (tmp / "support" / "projects" / "p1.json").write_text("{}")
            env = dict(os.environ, CV_APP_DIR=str(app_dir), CV_SERVER_URL="http://127.0.0.1:1/",
                       CV_LAUNCH_DRY_RUN="1")

            def run():
                out = subprocess.run(["bash", str(resources / "launcher.sh")], env=env,
                                     capture_output=True, text=True, check=True).stdout
                return out, (app_dir / "VERSION").read_text().strip()

            out, version = run()
            self.assertEqual(version, "0.12.0")
            self.assertTrue(out.startswith("open -a Terminal ") and COMMAND.name in out, out)
            self.assertTrue(os.access(app_dir / COMMAND.name, os.X_OK))
            (app_dir / "VERSION").write_text("0.13.0\n")    # newer: kept
            self.assertEqual(run()[1], "0.13.0")
            (app_dir / "VERSION").write_text("0.11.9\n")    # older: replaced
            self.assertEqual(run()[1], "0.12.0")
            self.assertEqual(sorted(p.name for p in app_dir.parent.iterdir()), ["App", "projects"])
            self.assertEqual((tmp / "support" / "projects" / "p1.json").read_text(), "{}")


@unittest.skipUnless(shutil.which("git") and (ROOT / ".git").exists(), "needs this git checkout")
class ArchiveTests(unittest.TestCase):
    """What `git archive` (the GitHub ZIP, and the Mac app's copy) keeps and leaves out."""

    def export_ignored(self, paths):
        out = subprocess.run(["git", "check-attr", "export-ignore", "--", *paths], cwd=ROOT,
                             capture_output=True, text=True, check=True).stdout
        return {line.split(": ")[0] for line in out.splitlines() if line.endswith(": set")}

    def test_every_file_the_app_needs_is_kept(self):
        needed = [path.lstrip("/") for path in serve.APP_FILES]
        needed += ["serve.py", "project_store.py", "update_check.py", "VERSION", "INSTALL.md",
                   "README.md", COMMAND.name, BAT.name, "vendor/THREE-LICENSE.txt"]
        self.assertEqual(self.export_ignored(needed), set())

    def test_development_files_are_left_out(self):
        dev = ["mac/build.sh", ".github/workflows/mac-release.yml", "test_serve.py", "test_mac_release.py",
               "admin.test.mjs", "smoke.browser.mjs", "test-fixtures/synthetic-catasto.md", "package.json",
               "HANDOFF.md", "CLAUDE.md"]
        self.assertEqual(self.export_ignored(dev), set(dev))


if __name__ == "__main__":
    unittest.main()
