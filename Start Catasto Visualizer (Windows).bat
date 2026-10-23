@echo off
rem Double-click to start the Catasto Visualizer. Keep this window open while using the app.
cd /d "%~dp0"
where py >nul 2>nul && (py -3 serve.py --open & goto done)
where python >nul 2>nul && (python serve.py --open & goto done)
echo Python 3 is not installed. Install it from https://www.python.org/downloads/windows/
echo During installation, tick "Add python.exe to PATH", then double-click this file again.
start "" "https://www.python.org/downloads/windows/"
:done
echo.
pause
