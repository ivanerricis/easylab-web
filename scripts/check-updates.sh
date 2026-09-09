#!/usr/bin/env bash
# Checks whether an update is available: git fetch + compare local vs origin/main HEAD.
# Never touches the working tree. Triggered by easylab-check-updates.path (on-demand from
# the UI) and easylab-check-updates.timer (every 30 min) — see ops/systemd/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
STATUS_DIR="$REPO_ROOT/ops/update"
STATUS_FILE="$STATUS_DIR/status.json"
CHECK_TRIGGER="$STATUS_DIR/check.trigger"

mkdir -p "$STATUS_DIR"
rm -f "$CHECK_TRIGGER"
cd "$REPO_ROOT"

current_state="idle"
if [ -f "$STATUS_FILE" ]; then
    current_state="$(jq -r '.state // "idle"' "$STATUS_FILE" 2>/dev/null || echo idle)"
fi

# `running` is written by update-server.sh when it starts and overwritten when it ends, so an
# update killed mid-flight (power cut, VM reboot, SIGKILL) leaves it there forever — and from
# then on the app blocks every session behind the update overlay and refuses to start a new
# update. Nothing else ever clears it, so this run does: systemd knows whether the update is
# really going, since a Type=oneshot unit stays `activating` for as long as its script runs.
if [ "$current_state" = "running" ]; then
    update_unit_state="$(systemctl is-active easylab-update.service 2>/dev/null || true)"

    case "$update_unit_state" in
        # Empty means systemd did not answer at all (no systemd, update launched by hand):
        # no evidence the state is stale, so don't race with what might be a real update.
        active | activating | reloading | deactivating | "")
            exit 0
            ;;
    esac

    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    stale_error="Aggiornamento interrotto prima della fine (riavvio del server o processo terminato): nessun esito registrato. Verifica lo stato dell'applicazione e, se serve, riprova."
    tmp_file="$(mktemp "$STATUS_DIR/.status.XXXXXX")"

    jq \
        --arg now "$now" \
        --arg lastError "$stale_error" \
        '. + { state: "failed", lastUpdateAt: $now, lastUpdateStatus: "failed", lastError: $lastError }' \
        "$STATUS_FILE" > "$tmp_file"
    mv "$tmp_file" "$STATUS_FILE"
    chmod 666 "$STATUS_FILE" 2>/dev/null || true
fi

git fetch --all --prune >/dev/null 2>&1 || exit 0

local_commit="$(git rev-parse --short HEAD)"
remote_commit="$(git rev-parse --short origin/main 2>/dev/null || echo "$local_commit")"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

update_available="false"
if [ "$local_commit" != "$remote_commit" ]; then
    update_available="true"
fi

existing="{}"
[ -f "$STATUS_FILE" ] && existing="$(cat "$STATUS_FILE")"
tmp_file="$(mktemp "$STATUS_DIR/.status.XXXXXX")"

echo "$existing" | jq \
    --arg currentCommit "$local_commit" \
    --arg remoteCommit "$remote_commit" \
    --arg now "$now" \
    --argjson updateAvailable "$update_available" \
    '. + {
        currentCommit: $currentCommit,
        remoteCommit: $remoteCommit,
        updateAvailable: $updateAvailable,
        lastCheckedAt: $now,
        state: (if (.state // "idle") == "running" then .state else "idle" end)
    }' > "$tmp_file"
mv "$tmp_file" "$STATUS_FILE"
chmod 666 "$STATUS_FILE" 2>/dev/null || true
