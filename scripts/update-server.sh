#!/usr/bin/env bash
# Applies an update: git reset --hard origin/main + docker compose rebuild.
# Triggered by easylab-update.path (see ops/systemd/) when ops/update/apply.trigger appears.
# Never add `git clean` here: untracked paths (.env, backend/data, backend/backups,
# ops/update) must survive an update.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
STATUS_DIR="$REPO_ROOT/ops/update"
STATUS_FILE="$STATUS_DIR/status.json"
APPLY_TRIGGER="$STATUS_DIR/apply.trigger"
LOG_FILE="$(mktemp)"
# Keys allowed to sign the commits this script installs (see docs/OPERATIONS.md). Read from the
# version that is *already installed*, before the reset: a commit that is not signed by one of
# these keys cannot add its own key to the list, because the list it would change is not the one
# it is checked against. The update that first brings this file in has nothing to be checked
# against yet and goes through; from then on origin/main must carry a valid signature.
ALLOWED_SIGNERS="$REPO_ROOT/ops/allowed_signers"
FAILURE_MESSAGE=""

mkdir -p "$STATUS_DIR"
rm -f "$APPLY_TRIGGER"
cd "$REPO_ROOT"

write_status() {
    local state="$1"
    local last_status="$2"
    local error_msg="$3"
    local now current_commit log_tail existing tmp_file

    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    current_commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
    log_tail="$(tail -c 4000 "$LOG_FILE" 2>/dev/null || true)"
    existing="{}"
    [ -f "$STATUS_FILE" ] && existing="$(cat "$STATUS_FILE")"
    tmp_file="$(mktemp "$STATUS_DIR/.status.XXXXXX")"

    echo "$existing" | jq \
        --arg state "$state" \
        --arg currentCommit "$current_commit" \
        --arg now "$now" \
        --arg lastUpdateStatus "$last_status" \
        --arg lastError "$error_msg" \
        --arg log "$log_tail" \
        '. + {
            state: $state,
            currentCommit: $currentCommit,
            lastUpdateAt: $now,
            lastUpdateStatus: (if $lastUpdateStatus == "" then (.lastUpdateStatus // null) else $lastUpdateStatus end),
            lastError: (if $lastError == "" then null else $lastError end),
            log: $log
        }
        # After a successful apply, HEAD now matches the commit we just fetched
        # from origin/main, so clear the stale "update available" flag left
        # over from the last check instead of waiting for the next timer run.
        + (if $lastUpdateStatus == "success" then { remoteCommit: $currentCommit, updateAvailable: false } else {} end)' > "$tmp_file"
    mv "$tmp_file" "$STATUS_FILE"
    chmod 666 "$STATUS_FILE" 2>/dev/null || true
}

on_exit() {
    local exit_code=$?
    if [ "$exit_code" -ne 0 ]; then
        write_status "failed" "failed" "${FAILURE_MESSAGE:-Aggiornamento fallito (exit $exit_code). Dettagli: journalctl -u easylab-update.service}"
    fi
    rm -f "$LOG_FILE"
}
trap on_exit EXIT

write_status "running" "" ""

set -euo pipefail

{
    echo "=== git fetch ==="
    git fetch --all --prune
    # Whoever can push to main would otherwise run code as root on this VM: `docker compose up
    # --build` executes whatever the new Dockerfiles say. The signature ties the update to the
    # owner's signing key, not just to the GitHub account.
    if [ -f "$ALLOWED_SIGNERS" ]; then
        echo "=== git verify-commit origin/main ==="
        if ! command -v ssh-keygen >/dev/null 2>&1; then
            FAILURE_MESSAGE="ssh-keygen non è installato sulla VM, quindi la firma dei commit non si può verificare: aggiornamento annullato, non è stato cambiato nulla. Installa openssh-client (apt-get install -y openssh-client) e riprova."
            exit 1
        fi
        # SSH signatures arrived in git 2.34: an older git (Debian 11 ships 2.30) would report every
        # commit as badly signed, which reads like an attack instead of an outdated package.
        git_version="$(git --version | awk '{print $3}')"
        if [ "$(printf '%s\n' 2.34 "$git_version" | sort -V | head -n1)" != "2.34" ]; then
            FAILURE_MESSAGE="La versione di git sulla VM ($git_version) non sa verificare le firme SSH dei commit (serve la 2.34 o successiva): aggiornamento annullato, non è stato cambiato nulla. Aggiorna git (apt-get install -y git da una distribuzione recente) e riprova."
            exit 1
        fi
        if ! git -c gpg.format=ssh -c gpg.ssh.allowedSignersFile="$ALLOWED_SIGNERS" verify-commit origin/main; then
            FAILURE_MESSAGE="L'ultimo commit su origin/main non ha una firma valida di una chiave ammessa (ops/allowed_signers): aggiornamento annullato, non è stato cambiato nulla. Vedi docs/DEPLOY.md, \"Firma dei commit\"."
            exit 1
        fi
    else
        echo "=== ops/allowed_signers not installed yet: signature check skipped this once ==="
    fi
    echo "=== git reset --hard origin/main ==="
    git reset --hard origin/main
    echo "=== docker compose up --build -d --remove-orphans ==="
    docker compose up --build -d --remove-orphans
    echo "=== docker image prune -f ==="
    docker image prune -f
    echo "=== docker builder prune -f --filter until=24h ==="
    docker builder prune -f --filter until=24h
} >>"$LOG_FILE" 2>&1

write_status "success" "success" ""
