#!/bin/bash
# Run by the signed "Catasto Visualizer.app" (Contents/MacOS/... execs this file).
#
# The app carries a copy of the app's files (Resources/app). On each open it:
#   1. just opens the browser if the Visualizer is already running;
#   2. copies its files to ~/Library/Application Support/Catasto Visualizer/App when nothing
#      is installed there yet or what is there is older (projects, in .../projects, are
#      never touched);
#   3. opens that copy's start file in Terminal, which sets up Python on first use and
#      starts the server, exactly as a double-click on the start file does.
# The copy is made without the download quarantine flag, so Gatekeeper doesn't ask about
# the start file: Apple has already checked the whole app (it is notarized).
#
# Two launches never install at once: the second waits for the first's lock, then finds the
# copy already in place. Each launch stages its copy in a folder of its own.
#
# For tests: CV_APP_DIR, CV_SERVER_URL, and CV_LAUNCH_DRY_RUN=1 (print what would be
# opened instead of opening it).

START_FILE="Start Catasto Visualizer (Mac).command"
TITLE="Catasto Visualizer"
# The install lock and this launch's staging folder, removed on any exit while installing.
INSTALL_LOCK=""
INSTALL_STAGING=""

say() {
    # A dialog, since an app opened from Finder has no window to print to.
    /usr/bin/osascript -e 'on run argv' \
        -e 'display dialog (item 1 of argv) buttons {"OK"} default button 1 with title (item 2 of argv) with icon caution' \
        -e 'end run' "$1" "$TITLE" >/dev/null 2>&1
}

fail() {
    say "$1"
    exit 1
}

open_target() {
    if [ -n "$CV_LAUNCH_DRY_RUN" ]; then
        echo "open $*"
    else
        /usr/bin/open "$@"
    fi
}

# Holds the folder lock $1 (a directory, made atomically by mkdir) for this process, so two launches never
# install at once: a second one waits, then finds the first one's copy in place. A lock left by a process that
# has ended is taken over. 1 if the lock is still held by a running process after about two minutes.
take_lock() {
    local lock="$1" tries=0 owner
    until mkdir "$lock" 2>/dev/null; do
        owner="$(cat "$lock/pid" 2>/dev/null)"
        if { [ -n "$owner" ] && ! kill -0 "$owner" 2>/dev/null; } || { [ -z "$owner" ] && (( tries >= 50 )); }; then
            # Ended (or never wrote its number): take the lock over by renaming it, which only one launch can do.
            mv "$lock" "$lock.stale.$$" 2>/dev/null && rm -rf "$lock.stale.$$"
            continue
        fi
        (( tries++ >= 600 )) && return 1
        sleep 0.2
    done
    echo $$ > "$lock/pid"
}

# 0 when version $1 is older than version $2 (both like 0.12.0); anything unreadable is older.
older_than() {
    local IFS=.
    local -a a=($1) b=($2)
    local i
    for i in 0 1 2; do
        local x="${a[$i]:-0}" y="${b[$i]:-0}"
        [[ "$x" =~ ^[0-9]+$ ]] || return 0
        [[ "$y" =~ ^[0-9]+$ ]] || return 1
        if (( 10#$x < 10#$y )); then return 0; fi
        if (( 10#$x > 10#$y )); then return 1; fi
    done
    return 1
}

# 0 when nothing is installed in $1 or what is there is older than the app's own copy $2.
needs_install() {
    local installed=""
    [ -f "$1/$START_FILE" ] && installed="$(cat "$1/VERSION" 2>/dev/null)"
    [ -z "$installed" ] || older_than "$installed" "$(cat "$2/VERSION")"
}

main() {
    local resources bundle bundled app_dir url
    resources="$(cd "$(dirname "$0")" && pwd -P)" || exit 1
    bundle="$(cd "$resources/../.." && pwd -P)"
    bundled="$resources/app"
    app_dir="${CV_APP_DIR:-$HOME/Library/Application Support/Catasto Visualizer/App}"
    url="${CV_SERVER_URL:-http://127.0.0.1:8000/index.html}"

    # Opened straight from the disk image (or from Downloads, where macOS runs it from a
    # temporary read-only copy): it would work once, then be gone when the disk is ejected.
    case "$bundle" in
        /Volumes/*|*/AppTranslocation/*)
            fail "Drag Catasto Visualizer into your Applications folder first, then open it from there."
            ;;
    esac

    if curl --silent --output /dev/null --max-time 2 "$url"; then
        open_target "$url"
        exit 0
    fi

    [ -f "$bundled/VERSION" ] && [ -f "$bundled/$START_FILE" ] \
        || fail "This copy of the Catasto Visualizer is damaged. Download it again from GitHub."

    if needs_install "$app_dir" "$bundled"; then
        local parent
        parent="$(dirname "$app_dir")"
        INSTALL_LOCK="$app_dir.install-lock"
        mkdir -p "$parent" || fail "The folder $parent couldn't be created."
        take_lock "$INSTALL_LOCK" || fail "Another copy of the Catasto Visualizer is still being installed. Try again in a minute."
        trap 'rm -rf "$INSTALL_LOCK" ${INSTALL_STAGING:+"$INSTALL_STAGING"}' EXIT
        # Another launch may have installed this version while this one waited.
        if needs_install "$app_dir" "$bundled"; then
            # This launch's own staging folder, so no other launch can use or remove it.
            INSTALL_STAGING="$(mktemp -d "$app_dir.staging.XXXXXX")" || fail "The folder $parent couldn't be written to."
            /usr/bin/ditto --noqtn "$bundled" "$INSTALL_STAGING/new" \
                || fail "The Catasto Visualizer couldn't be installed. Is your disk full?"
            /usr/bin/xattr -dr com.apple.quarantine "$INSTALL_STAGING/new" 2>/dev/null
            chmod +x "$INSTALL_STAGING/new/$START_FILE"
            if [ -d "$app_dir" ]; then
                mv "$app_dir" "$INSTALL_STAGING/old" || fail "The installed copy couldn't be replaced."
            fi
            mv "$INSTALL_STAGING/new" "$app_dir" || { [ -d "$INSTALL_STAGING/old" ] && mv "$INSTALL_STAGING/old" "$app_dir"; fail "The Catasto Visualizer couldn't be installed."; }
        fi
        rm -rf "$INSTALL_LOCK" ${INSTALL_STAGING:+"$INSTALL_STAGING"}
        trap - EXIT
    fi

    open_target -a Terminal "$app_dir/$START_FILE"
}

main "$@"
