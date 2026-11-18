"""Tells the app whether a newer release exists on GitHub.

One request to github.com/<repo>/releases/latest, which redirects to the latest
release's tag page; the tag is read from the redirect, so there is no JSON API (and
no API rate limit) involved. Nothing about the user or their projects is sent. The
answer is kept in memory: a successful check is reused for CHECK_INTERVAL_SECONDS, a
failed one for RETRY_AFTER_SECONDS, so opening pages never repeats the request. Any
failure just means "no update shown".

CV_NO_UPDATE_CHECK=1 turns the check off (documented in INSTALL.md).
Standard library only, like the rest of the server.
"""

from __future__ import annotations

import os
import re
import ssl
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

REPO = "weevie833/Catasto-Visualizer"
LATEST_URL = f"https://github.com/{REPO}/releases/latest"
# Attached to each release by .github/workflows/mac-release.yml.
MAC_DMG_NAME = "Catasto-Visualizer-Mac.dmg"
TIMEOUT_SECONDS = 5
CHECK_INTERVAL_SECONDS = 12 * 60 * 60
RETRY_AFTER_SECONDS = 60 * 60
VERSION_FILE = Path(__file__).resolve().parent / "VERSION"
# macOS's own certificate bundle. The Mac start file's standalone Python looks for
# certificates where its build machine kept them, so it may find none of its own.
MAC_CA_FILE = "/etc/ssl/cert.pem"

_lock = threading.Lock()
_cache: dict = {"checked_at": None, "tag": None}

_VERSION_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse_version(text: str):
    """(major, minor, patch) for "0.12.0" or "v0.12.0"; None for anything else."""
    match = _VERSION_RE.match((text or "").strip())
    return tuple(int(part) for part in match.groups()) if match else None


def app_version() -> str:
    """The VERSION file's text, or "" when it is missing (a development copy)."""
    try:
        return VERSION_FILE.read_text(encoding="utf-8").strip()
    except OSError:
        return ""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None    # read the Location header instead of downloading the tag page


def _ssl_context() -> ssl.SSLContext:
    context = ssl.create_default_context()
    if not context.cert_store_stats().get("x509_ca") and os.path.isfile(MAC_CA_FILE):
        context.load_verify_locations(cafile=MAC_CA_FILE)
    return context


def fetch_latest_tag():
    """The latest release's tag (e.g. "v0.12.0"), or None on any failure."""
    try:
        opener = urllib.request.build_opener(
            _NoRedirect, urllib.request.HTTPSHandler(context=_ssl_context()))
    except (OSError, ssl.SSLError):
        return None
    request = urllib.request.Request(LATEST_URL, method="HEAD",
                                     headers={"User-Agent": "Catasto-Visualizer"})
    location = ""
    try:
        with opener.open(request, timeout=TIMEOUT_SECONDS):
            return None    # no redirect: no release published
    except urllib.error.HTTPError as err:
        if err.code in (301, 302, 303, 307, 308):
            location = err.headers.get("Location", "") or ""
    except Exception:  # noqa: BLE001 -- any failure only means "no update shown"
        return None
    match = re.search(r"/releases/tag/([^/?#]+)$", location)
    tag = urllib.parse.unquote(match.group(1)) if match else None
    return tag if tag and parse_version(tag) else None


def latest_tag(now=None):
    now = time.time() if now is None else now
    with _lock:
        checked_at = _cache["checked_at"]
        if checked_at is not None:
            wait = CHECK_INTERVAL_SECONDS if _cache["tag"] else RETRY_AFTER_SECONDS
            if now - float(checked_at) < wait:
                return _cache["tag"]
        # Held across the request on purpose: pages opening at once share one check.
        tag = fetch_latest_tag()
        _cache["checked_at"] = now
        _cache["tag"] = tag
        return tag


def platform_kind() -> str:
    """Which update instructions the page shows."""
    if sys.platform == "darwin":
        return "mac"
    if sys.platform == "win32":
        return "windows"
    return "other"


def update_status(current_version: str) -> dict:
    """What /api/update-check returns. update_available is True only when both versions
    read as 1.2.3 and the release is strictly newer."""
    result = {"current": current_version, "update_available": False}
    if os.environ.get("CV_NO_UPDATE_CHECK"):
        return result
    current = parse_version(current_version)
    if current is None:    # no VERSION file, or an unreadable one
        return result
    tag = latest_tag()
    latest = parse_version(tag or "")
    if latest is None or latest <= current:
        return result
    result.update({
        "update_available": True,
        "latest": ".".join(str(part) for part in latest),
        "release_url": f"https://github.com/{REPO}/releases/tag/{tag}",
        "platform": platform_kind(),
        "mac_download_url": f"https://github.com/{REPO}/releases/download/{tag}/{MAC_DMG_NAME}",
    })
    return result
