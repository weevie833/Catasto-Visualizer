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

A small text window opens, and the app opens in your web browser a moment
later. **Leave the text window open** while you use the app. Closing it stops
the app.

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

Always use this exact address. Your projects are saved under it, and a
different address (such as `localhost:8000`) shows an empty library.

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

Your projects are saved **inside your web browser** on this computer, not in
the app folder and not online. This means:

- Updating or deleting the app folder does not delete your projects.
- Your projects are visible only in the browser you created them in. Chrome
  and Safari, for example, each have a separate library.
- Clearing your browser's history or "site data" for all time can delete them.

**Back up regularly.** In Admin, export each project to a `.catasto.json` file
and keep it in your own projects folder. Use the same file to move a project to
another computer or share it with a colleague, who can import it in Admin.

Exporting also preserves any corrections you made in the app. Re-creating a
project from the original transcription file does not.

---

## Using the app again later

Double-click the launcher again, just as in Step 3. If the app is already
running, the launcher reopens it in your browser.

To stop the app, close the text window (on a Mac, you may need to confirm).

---

## Updating to a newer version

1. In Admin, export your projects as a precaution.
2. Close the app's text window.
3. Download the new ZIP as in Step 2 and unzip it.
4. Delete the old app folder and put the new one in its place.
5. Start the app as usual. Your projects are still there.

---

## Troubleshooting

**"Python 3 is not installed"** appears in the text window.
Complete Step 1, then double-click the launcher again. On Windows, if you
installed Python without ticking **Add python.exe to PATH**, run the Python
installer again, choose **Modify**, and make sure **py launcher** is selected.

**The page says the 3D environment could not be initialized.**
Update your browser to the latest version. Very old computers or browsers
without WebGL 2 cannot display the 3D view.

**My projects are missing.**
Check that the address bar shows exactly `http://127.0.0.1:8000/index.html`
and that you are using the same browser as before. If they are still missing,
import your most recent `.catasto.json` backup in Admin.

**I double-clicked `index.html` and the page does not work.**
Always start the app with the launcher. Pages opened directly as files cannot
show the 3D view, and anything imported there is saved separately.

**Mac: "permission denied" when starting the launcher.**
Open **Terminal** (in Applications > Utilities), type `chmod +x ` (with a space
at the end), drag the launcher file into the Terminal window, and press
Return. Then double-click the launcher again.
