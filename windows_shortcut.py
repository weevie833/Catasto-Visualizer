"""A desktop shortcut on Windows that starts the Catasto Visualizer, made the first time
"Start Catasto Visualizer (Windows).bat" runs (serve.py --desktop-shortcut). Its icon is
app-icon.ico, the Mac app's icon (mac/make-icon.sh builds both)."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
BAT_PATH = APP_DIR / "Start Catasto Visualizer (Windows).bat"
ICON_PATH = APP_DIR / "app-icon.ico"
SHORTCUT_NAME = "Catasto Visualizer.lnk"
MARKER = "desktop-shortcut-for.txt"
ON_WINDOWS = os.name == "nt"

# Windows finds the desktop itself, since OneDrive often moves it. The shortcut runs the
# .bat through cmd.exe because Windows offers Pin to taskbar only for a shortcut to a
# program, not to a .bat. Paths arrive by environment variable, so an apostrophe in one
# can't change the script, and the script has no double quotes, which would need escaping
# on the way to PowerShell.
SHORTCUT_SCRIPT = (
    "$ErrorActionPreference = 'Stop';"
    "$desktop = [Environment]::GetFolderPath('Desktop');"
    "$link = (New-Object -ComObject WScript.Shell).CreateShortcut("
    "(Join-Path $desktop $env:CV_SHORTCUT_NAME));"
    "$q = [string][char]34;"
    "$link.TargetPath = $env:ComSpec;"
    "$link.Arguments = '/c ' + $q + $q + $env:CV_SHORTCUT_BAT + $q + $q;"
    "$link.WorkingDirectory = Split-Path $env:CV_SHORTCUT_BAT;"
    "$link.IconLocation = $env:CV_SHORTCUT_ICON;"
    "$link.Description = 'Start the Catasto Visualizer';"
    "$link.Save()"
)


def create_desktop_shortcut() -> bool:
    try:
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", SHORTCUT_SCRIPT],
            env={**os.environ, "CV_SHORTCUT_BAT": str(BAT_PATH), "CV_SHORTCUT_ICON": str(ICON_PATH),
                 "CV_SHORTCUT_NAME": SHORTCUT_NAME},
            stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            timeout=30, check=True,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return True


def ensure_desktop_shortcut(data_dir: Path) -> None:
    """Once per app location, so someone who deletes the shortcut keeps it deleted, and
    someone who moves or replaces the app folder gets a shortcut to the new place."""
    if not ON_WINDOWS:
        return
    marker = Path(data_dir) / MARKER
    try:
        if marker.read_text(encoding="utf-8") == str(BAT_PATH):
            return
    except OSError:
        pass    # not made yet
    if not create_desktop_shortcut():
        print("A desktop shortcut couldn't be created. You can keep starting the app from this folder.")
        return
    print("A Catasto Visualizer shortcut was added to your desktop.")
    try:
        Path(data_dir).mkdir(parents=True, exist_ok=True)
        marker.write_text(str(BAT_PATH), encoding="utf-8")
    except OSError:
        pass    # a convenience only; the next start makes the shortcut again
