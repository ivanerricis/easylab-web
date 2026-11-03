#!/usr/bin/env bash
# Checks whether an update is available: git fetch + look for a newer signed release tag (vX.Y.Z).
# Never touches the working tree. Triggered by easylab-check-updates.path (on-demand from
# the UI) and easylab-check-updates.timer (every 30 min) — see ops/systemd/.

#
# This runs as root, next to a directory the backend container owns (see update-status-lib.sh
# for the rule that keeps the two apart): trigger files come in through ops/update/, the
# status goes out through ops/update-status/.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source=scripts/update-status-lib.sh
. "$SCRIPT_DIR/update-status-lib.sh"
CHECK_TRIGGER="$TRIGGER_DIR/check.trigger"

prepare_update_dirs || exit 1
rm -f "$CHECK_TRIGGER"
cd "$REPO_ROOT" || exit 1

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

    update_status \
        --arg now "$now" \
        --arg lastError "$stale_error" \
        '. + { state: "failed", lastUpdateAt: $now, lastUpdateStatus: "failed", lastError: $lastError }'
fi

git fetch --all --prune --tags --force >/dev/null 2>&1 || exit 0

local_commit="$(git rev-parse --short HEAD)"
now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# What is offered is the newest release tag signed by an allowed key, read from the installed
# version of ops/allowed_signers (same rule as update-server.sh). It is an update only if the tag's
# commit is not already part of what is installed: a merge into main without a tag offers nothing,
# and a server ahead of the latest tag is not asked to go back.
remote_commit="$local_commit"
remote_version=""
update_available="false"
if release_tag="$(latest_signed_release_tag "$REPO_ROOT/ops/allowed_signers")" &&
    ! git merge-base --is-ancestor "refs/tags/$release_tag^{commit}" HEAD; then
    remote_commit="$(git rev-parse --short "refs/tags/$release_tag^{commit}")"
    remote_version="$release_tag"
    update_available="true"
fi

update_status \
    --arg currentCommit "$local_commit" \
    --arg currentVersion "$(current_version)" \
    --arg remoteCommit "$remote_commit" \
    --arg remoteVersion "$remote_version" \
    --arg now "$now" \
    --argjson updateAvailable "$update_available" \
    '. + {
        currentCommit: $currentCommit,
        currentVersion: $currentVersion,
        remoteCommit: $remoteCommit,
        remoteVersion: (if $remoteVersion == "" then null else $remoteVersion end),
        updateAvailable: $updateAvailable,
        lastCheckedAt: $now,
        state: (if (.state // "idle") == "running" then .state else "idle" end)
    }'
