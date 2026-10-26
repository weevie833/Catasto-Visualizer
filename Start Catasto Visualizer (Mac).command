#!/bin/bash
# Double-click to start the Catasto Visualizer. Keep the window open while using the app.
cd "$(dirname "$0")" || exit 1
if command -v python3 >/dev/null 2>&1 && python3 -c "import sys; sys.exit(sys.version_info < (3, 7))" 2>/dev/null; then
  python3 serve.py --open
else
  echo "Python 3.7 or later is not installed. Install it from https://www.python.org/downloads/macos/"
  echo "and then double-click this file again."
  open "https://www.python.org/downloads/macos/"
fi
echo
read -r -p "Press Return to close this window."
