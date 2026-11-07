# Installing the Catasto Visualizer

This guide walks you through installing the Catasto Visualizer on a Mac or a
Windows PC. No programming knowledge is needed. Plan on about 10 minutes the
first time.

The app runs entirely on your own computer. Nothing you load into it is sent to
the internet.

## What you need

- A Mac or Windows computer
- A current version of Chrome, Edge, Firefox, or Safari
- Python 3, a free program that runs the app (step 1 shows how to install it)
- Your Catasto transcription file (`.md` or `.txt`) or a project backup
  (`.catasto.json`). The app does not come with any data.

---

## Step 1: Install Python (one time only)

### Mac

1. Go to <https://www.python.org/downloads/macos/>.
2. Click the button for the latest **Python 3** release and download the
   **macOS 64-bit universal2 installer**.
3. Open the downloaded file and follow the prompts, clicking **Continue** and
   **Agree** until it finishes.

If your Mac shows a box asking to install the "command line developer tools",
you can click **Install** instead. That also provides Python.

### Windows

1. Go to <https://www.python.org/downloads/windows/>.
2. Click **Download Python 3.x** (the large yellow button).
3. Open the downloaded file.
4. **Important:** at the bottom of the first screen, tick
   **Add python.exe to PATH**.
5. Click **Install Now** and wait for it to finish.

Do not install Python from the Microsoft Store.

---

## Step 2: Download the app

1. Go to the app's page on GitHub:
   <https://github.com/weevie833/Catasto-Visualizer>
2. Click the green **Code** button, then click **Download ZIP**.
3. Open your **Downloads** folder and unzip the file:
   - **Mac:** double-click `Catasto-Visualizer-main.zip`. (Safari may already
     have unzipped it.)
   - **Windows:** right-click the ZIP file, choose **Extract All…**, then click
     **Extract**.
4. Move the unzipped `Catasto-Visualizer-main` folder somewhere permanent,
   such as your **Documents** folder. You may rename it to
   `Catasto Visualizer`.

Keep your own transcription files and backups in a **different** folder, for
example `Documents/Catasto Projects`. The app folder holds only the app, so you
can replace it with a newer version without affecting your work.

---

## Step 3: Start the app

Open the app folder and double-click the launcher for your computer:

- **Mac:** `Start Catasto Visualizer (Mac).command`
- **Windows:** `Start Catasto Visualizer (Windows).bat`

A window full of text opens: **Terminal** on a Mac, or a black
**Command Prompt** window on Windows. This window runs the app. A moment later
the app opens in your web browser.

**Leave this window open** while you use the app. You can minimize it, but do
not close it until you are finished. See [Stopping the app](#stopping-the-app).

### The first time only

Your computer may warn you because the launcher was downloaded from the
internet.

**Mac:** if you see "cannot be opened because it is from an unidentified
developer" or "Apple could not verify…":

1. Click **Done** (or **OK**).
2. Open **System Settings** > **Privacy & Security**.
3. Scroll down and click **Open Anyway** next to the message about the
   launcher, then confirm.

On older macOS versions, you can instead right-click (or Control-click) the
launcher, choose **Open**, and click **Open** again.

**Windows:** if a blue "Windows protected your PC" box appears, click
**More info**, then **Run anyway**.

You will not see these warnings again.

### If the browser does not open

Open your browser yourself and go to exactly this address:

```text
http://127.0.0.1:8000/index.html
```

Use this address with the launcher running. Opening `index.html` directly from
the folder does not work.

---

## Step 4: Add your first project

The app starts with an empty library.

1. Click **ADMIN** in the top-right corner. Admin opens in a new tab.
2. Choose one of these:
   - **Create Project from Catasto Text:** enter a project name, choose your
     transcription file (`.md` or `.txt`) under **Source text file**, and
     click **Create project**.
   - **Import JSON backup or Catasto text:** choose a `.catasto.json` backup
     that you or a colleague exported earlier.
3. Switch back to the Visualizer tab. The new project opens automatically.

---

## Where your work is saved

Your projects are saved as files in a folder on this computer, outside the app
folder and not online:

- **Windows:** `%APPDATA%\Catasto Visualizer\projects\` (paste this into the
  File Explorer address bar to open it)
- **Mac:** `~/Library/Application Support/Catasto Visualizer/projects/` (in
  Finder, choose **Go > Go to Folder…** and paste it)

The launcher window also shows this folder when the app starts. This means:

- Updating or deleting the app folder does not delete your projects (see
  [Installing updates](#installing-updates)).
- Clearing your browser's history or site data does not delete them, and every
  browser on this computer shows the same library.
- Do not edit or rename the files in that folder yourself; use Admin.
- Use the app on a computer whose other user accounts you trust. Other accounts
  cannot open the project files, but while the app is running another program
  on the same computer could reach it.

Earlier versions saved projects inside the web browser. The first time you open
this version in that browser, those projects are copied into the folder
automatically.

**Back up regularly.** In Admin, export each project to a `.catasto.json` file
and keep it in your own projects folder. Use the same file to move a project to
another computer or share it with a colleague, who can import it in Admin.

Exporting also preserves any corrections you made in the app. Re-creating a
project from the original transcription file does not.

---

## Using the app again later

Double-click the launcher again, just as in Step 3. If the app is already
running, the launcher reopens it in your browser.

---

## Stopping the app

The app keeps running until you close the Terminal (Mac) or Command Prompt
(Windows) window that opened when you started it. Closing the browser tab does
**not** stop it.

Stop the app when you are finished for the day, and always before updating,
moving, renaming, or deleting the app folder. While the app is running, your
computer will refuse to delete or move the folder, saying it is in use.

### Mac

1. Click the **Terminal** window to bring it to the front. (If you cannot find
   it, click the **Terminal** icon in the Dock.)
2. Press **Command (⌘) + Q** to quit Terminal.
3. If a message asks "Do you want to terminate running processes in this
   window?", click **Terminate**.

### Windows

1. Find the black **Command Prompt** window. (If it is minimized, click its
   icon in the taskbar.)
2. Click the **X** in its top-right corner.
3. If a message asks whether to close the window, click **Close** (or type
   `Y` and press Enter if it asks "Terminate batch job?").

### Closing your browser tabs

Closing the Visualizer and Admin tabs is optional. Your projects are already
saved. If you stop the app but leave a tab open, the tab stops working until
you start the app again and reload the page.

---

## Installing updates

Updates replace the app folder only. Your projects are saved in a separate
folder (see [Where your work is saved](#where-your-work-is-saved)), so they stay
where they are.

### Check which version you have

The version number appears at the bottom of the Visualizer's left panel and at
the bottom of the Admin page, for example **V 0.07**. To see whether a newer
version exists, visit the app's GitHub page
(<https://github.com/weevie833/Catasto-Visualizer>) or ask the person who
shared the app with you.

### Update the app

1. **Back up your projects.** Open **ADMIN** and click **Export JSON** next to
   each project. Save the files in your own projects folder, not in the app
   folder.
2. **Stop the app** by quitting Terminal (Mac) or closing the Command Prompt
   window (Windows), as described in [Stopping the app](#stopping-the-app).
   Otherwise your computer will not let you rename or delete the old folder.
   Also close any browser tabs showing the Visualizer or Admin.
3. **Download the new version.** Go to
   <https://github.com/weevie833/Catasto-Visualizer>, click the green **Code**
   button, then **Download ZIP**.
4. **Unzip it**, as in Step 2:
   - **Mac:** double-click the ZIP file in **Downloads**.
   - **Windows:** right-click the ZIP file, choose **Extract All…**, then click
     **Extract**.
5. **Set the old version aside.** Rename your current app folder, for example
   to `Catasto Visualizer OLD`. Keep it until you have confirmed the new
   version works.
6. **Put the new version in place.** Move the new `Catasto-Visualizer-main`
   folder to where the old one was, and rename it to `Catasto Visualizer` (or
   whatever name you used before).
7. **Start the app** by double-clicking the launcher in the new folder, as in
   Step 3. Your computer may show the first-time security warning again
   because the launcher is a new download; follow the same steps as before.
8. **Check your projects.** They should appear in the Visualizer as before.
   Confirm the new version number at the bottom of the page.
9. When everything works, delete the `Catasto Visualizer OLD` folder.

Python does not need to be reinstalled for updates.

### If your projects do not appear after an update

- Make sure you started the app with the launcher in the new folder. If you
  are updating from a version that saved projects in the browser, open the
  Visualizer in the same browser and at the same address as before
  (`http://127.0.0.1:8000/index.html`) so they can be copied over.
- If they are still missing, open **ADMIN**, click
  **Import JSON backup or Catasto text**, and choose the backups you exported
  in step 1.
- If the new version does not start at all, stop it (see
  [Stopping the app](#stopping-the-app)) and start
  the launcher in your `Catasto Visualizer OLD` folder to keep working, then
  contact the person who shared the app.

---

## Troubleshooting

**"Python 3 is not installed"** appears in the Terminal or Command Prompt
window.
Complete Step 1, then double-click the launcher again. On Windows, if you
installed Python without ticking **Add python.exe to PATH**, run the Python
installer again, choose **Modify**, and make sure **py launcher** is selected.

**The page says the 3D environment could not be initialized.**
Update your browser to the latest version. Very old computers or browsers
without WebGL 2 cannot display the 3D view.

**My computer will not let me delete, move, or rename the app folder** ("in
use" or "open in another program").
The app is still running. Stop it as described in
[Stopping the app](#stopping-the-app), then try again.

**My projects are missing.**
Check that the project folder (see
[Where your work is saved](#where-your-work-is-saved)) contains `.json` files.
If you are coming from a version that saved projects in the browser, open the
Visualizer once in that browser at `http://127.0.0.1:8000/index.html`. If they
are still missing, import your most recent `.catasto.json` backup in Admin.

**A notice says the project was read by an older version of the parser.**
Newer versions read residences and neighbors more completely. Click **Review
update** to see what would change, then **Update project** to apply it, or
**Not now** to keep the project as it is. Records you edited or merged are kept
unchanged, and a copy of the previous data is saved inside the project.

**I want to undo an update.**
Open **ADMIN** and click **Restore previous version** next to the project. The
app keeps one previous version of each project, saved before its last update.
Restoring swaps the two, so you can restore again to undo it. If the previous
version was saved by an older version of the app, the confirmation lists the
repairs made to it first; click **Download previous version** beforehand to
keep an exact copy. **Export JSON** also includes the previous version.

**Admin says some records had to be repaired before import.**
The file contains records with missing or unreadable fields. The message lists
each change; click **OK** to import the repaired projects or **Cancel** to
import nothing.

**The page says project storage is not available.**
The app was opened without the launcher, or the launcher window was closed.
Double-click the launcher and reload the page.

**I double-clicked `index.html` and the page does not work.**
Always start the app with the launcher. Pages opened directly as files cannot
show the 3D view or reach your projects.

**Mac: "permission denied" when starting the launcher.**
Open **Terminal** (in Applications > Utilities), type `chmod +x ` (with a space
at the end), drag the launcher file into the Terminal window, and press
Return. Then double-click the launcher again.
