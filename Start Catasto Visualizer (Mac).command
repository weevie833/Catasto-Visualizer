#!/bin/bash
# Double-click to start the Catasto Visualizer. Keep the window open while using the app.
#
# On an Apple silicon Mac the first start downloads a private copy of Python into
# ~/Library/Application Support/Catasto Visualizer/Runtime: no admin rights, nothing on PATH,
# no python.org installer. It is python-build-standalone (Astral), pinned by SHA-256, the
# same build the Customizable Transcriber uses. On an Intel Mac the Mac's own Python 3.7 or
# later is used, as before.
#
# For tests: CV_RUNTIME_DIR (where Python goes), CV_INSTALL_ONLY=1 (set up Python, don't start).

cd "$(dirname "$0")" || exit 1

PYTHON_URL="https://github.com/astral-sh/python-build-standalone/releases/download/20261026/cpython-3.12.16%2B20261026-aarch64-apple-darwin-install_only.tar.gz"
PYTHON_SHA256="fbf4afef53c2a6b72bb741bc06d5671a9dfaf87bd84e5aa73ac9b3d0d589f14e"
RUNTIME="${CV_RUNTIME_DIR:-$HOME/Library/Application Support/Catasto Visualizer/Runtime}"
PRIVATE_PYTHON="$RUNTIME/python/bin/python3"
# Which Python build is installed (its archive's SHA-256). When a newer app version pins a
# different build, the next start replaces Python instead of keeping the old one.
BUILD_MARKER="$RUNTIME/python-build.txt"

fail() {
    echo
    for line in "$@"; do echo "$line"; done
    echo
    if [ -z "$CV_INSTALL_ONLY" ]; then read -r -p "Press Return to close this window. "; fi
    exit 1
}

printf '\033]0;Catasto Visualizer\007'

[ -f "serve.py" ] || fail "This file has to stay in the app's folder, next to serve.py." \
    "Open the folder you downloaded and double-click it there."

installed_build() { cat "$BUILD_MARKER" 2>/dev/null; }

install_python() {
    echo
    echo "Setting up the Catasto Visualizer. This happens once and takes a minute or two."
    echo "Please leave this window open, and stay connected to the internet."
    echo
    mkdir -p "$RUNTIME" || fail "The folder $RUNTIME couldn't be created."
    echo "Downloading Python..."
    local download="$RUNTIME/python-download.tar.gz"
    curl --fail --location --silent --show-error --retry 3 --output "$download" "$PYTHON_URL" \
        || fail "Python couldn't be downloaded. Check your internet connection and try again." \
            "If it keeps failing, your network may be blocking github.com. Send this message to whoever gave you the app."
    if [ "$(shasum -a 256 "$download" | awk '{print $1}')" != "$PYTHON_SHA256" ]; then
        rm -f "$download"
        fail "The downloaded copy of Python didn't match the expected file, so it wasn't used. Try again." \
            "If it keeps failing, send this message to whoever gave you the app."
    fi
    rm -rf "$RUNTIME/python-new"
    mkdir "$RUNTIME/python-new" && tar -xzf "$download" -C "$RUNTIME/python-new" \
        || { rm -rf "$RUNTIME/python-new" "$download"; fail "Python couldn't be unpacked. Try again. If it keeps failing, send this message to whoever gave you the app."; }
    # Keep the current Python until the new one is in place, so a failed update goes back to it.
    rm -rf "$RUNTIME/python-old"
    [ -d "$RUNTIME/python" ] && mv "$RUNTIME/python" "$RUNTIME/python-old"
    if ! mv "$RUNTIME/python-new/python" "$RUNTIME/python"; then
        [ -d "$RUNTIME/python-old" ] && mv "$RUNTIME/python-old" "$RUNTIME/python"
        fail "Python couldn't be unpacked. Try again. If it keeps failing, send this message to whoever gave you the app."
    fi
    echo "$PYTHON_SHA256" > "$BUILD_MARKER"
    rm -rf "$RUNTIME/python-new" "$RUNTIME/python-old" "$download"
    echo "Setup is complete."
    echo
}

if [ "$(sysctl -n hw.optional.arm64 2>/dev/null)" = "1" ]; then
    if [ ! -x "$PRIVATE_PYTHON" ] || [ "$(installed_build)" != "$PYTHON_SHA256" ]; then
        install_python
    fi
    PYTHON="$PRIVATE_PYTHON"
elif command -v python3 >/dev/null 2>&1 && python3 -c "import sys; sys.exit(sys.version_info < (3, 7))" 2>/dev/null; then
    PYTHON="python3"
else
    echo "Python 3.7 or later is not installed. Install it from https://www.python.org/downloads/macos/"
    echo "and then double-click this file again."
    open "https://www.python.org/downloads/macos/"
    fail "The Catasto Visualizer needs Python to run."
fi

[ -n "$CV_INSTALL_ONLY" ] && exit 0

"$PYTHON" serve.py --open \
    || fail "The Catasto Visualizer stopped because of a problem. Send this window's text to whoever gave you the app."
echo
read -r -p "Press Return to close this window."
