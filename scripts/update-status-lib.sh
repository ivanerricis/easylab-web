# Shared by check-updates.sh and update-server.sh (sourced, not executed). Both run as root on
# the VM host; this file is where the rule separating them from the backend container lives.
#
# Two directories, one per direction:
# - ops/update/ (TRIGGER_DIR) is bind-mounted into the backend as /app/update-signal and owned
#   by the container user, which drops apply.trigger / check.trigger there. Code running in the
#   backend controls everything inside it, symlinks included. Root therefore only ever creates
#   the directory and deletes fixed names in it (`rm` removes a symlink, not its target): it never
#   reads, writes or chmods anything there.
# - ops/update-status/ (STATUS_DIR) belongs to root and is mounted read-only as
#   /app/update-status. Only root writes status.json, so nothing in it can point elsewhere.
#
# Before this split status.json lived in ops/update/: root read it with `cat` and chmodded it,
# following whatever link the backend had put there — the tunnel credentials copied into a file
# the backend reads, or a system file made world-writable (EL-01, docs/CHANGELOG.md).

# shellcheck disable=SC2034 # used by the scripts that source this file
TRIGGER_DIR="$REPO_ROOT/ops/update"
STATUS_DIR="$REPO_ROOT/ops/update-status"
STATUS_FILE="$STATUS_DIR/status.json"

prepare_update_dirs() {
    mkdir -p "$TRIGGER_DIR"
    # Left behind by the versions that kept the status next to the triggers. Removed, never read:
    # reading it is exactly what must not happen.
    rm -f -- "$TRIGGER_DIR/status.json" "$TRIGGER_DIR"/.status.*

    if [ -L "$STATUS_DIR" ]; then
        echo "$STATUS_DIR is a symlink: refusing to write the update status through it." >&2
        return 1
    fi

    # Docker creates the directory as root on first `up` if it is missing; `chown`/`chmod` also fix
    # one created by hand with other permissions. Readable by the container, writable only by root.
    mkdir -p "$STATUS_DIR" &&
        chown root:root "$STATUS_DIR" &&
        chmod 0755 "$STATUS_DIR"
}

# Applies a jq program to the current status (or `{}`) and replaces status.json atomically.
# Arguments are passed to jq as they are: options first, the program last.
update_status() {
    local existing="{}" tmp_file

    if [ -f "$STATUS_FILE" ]; then
        existing="$(cat "$STATUS_FILE")"
    fi

    # A truncated or hand-edited file must not block every future write.
    if ! printf '%s' "$existing" | jq -e 'type == "object"' >/dev/null 2>&1; then
        existing="{}"
    fi

    tmp_file="$(mktemp "$STATUS_DIR/.status.XXXXXX")" || return 1

    if ! printf '%s' "$existing" | jq "$@" >"$tmp_file"; then
        rm -f "$tmp_file"
        return 1
    fi

    # mktemp creates the file 0600: the container reads it as a different user. The mode is set on
    # the temporary file, which only root can reach, never on the final path.
    chmod 0644 "$tmp_file"
    mv -f "$tmp_file" "$STATUS_FILE"
}
