#!/usr/bin/env bash
# Applies an update: git reset --hard to the newest signed release tag (vX.Y.Z) + docker compose
# rebuild. What lands on main is not installed until a tag is published on it.
# Triggered by easylab-update.path (see ops/systemd/) when ops/update/apply.trigger appears.
# Never add `git clean` here: untracked paths (.env, backend/data, backend/backups,
# ops/update, ops/update-status) must survive an update.
#
# Runs as root next to a directory the backend container owns: see update-status-lib.sh for the
# rule that keeps the two apart.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
# shellcheck source=scripts/update-status-lib.sh
. "$SCRIPT_DIR/update-status-lib.sh"
APPLY_TRIGGER="$TRIGGER_DIR/apply.trigger"
LOG_FILE="$(mktemp)"
# Keys allowed to sign the release tags this script installs (see docs/OPERATIONS.md). Read from
# the version that is *already installed*, before the reset: a tag that is not signed by one of
# these keys cannot add its own key to the list, because the list it would change is not the one
# it is checked against.
ALLOWED_SIGNERS="$REPO_ROOT/ops/allowed_signers"
FAILURE_MESSAGE=""

prepare_update_dirs || {
    rm -f "$LOG_FILE"
    exit 1
}
rm -f "$APPLY_TRIGGER"
cd "$REPO_ROOT"

write_status() {
    local state="$1"
    local last_status="$2"
    local error_msg="$3"
    # Fase corrente mentre state="running" (vedi UpdatePhase in updateManager.ts). Omesso (o
    # vuoto) fuori dai passaggi intermedi: la riga sotto tiene quella già scritta, così il
    # fallimento finale non la cancella e il frontend può ancora dire dove si è fermato.
    local phase="${4:-}"
    local now current_commit version_label log_tail

    now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    current_commit="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
    version_label="$(current_version 2>/dev/null || echo "$current_commit")"
    log_tail="$(tail -c 4000 "$LOG_FILE" 2>/dev/null || true)"

    update_status \
        --arg state "$state" \
        --arg phase "$phase" \
        --arg currentCommit "$current_commit" \
        --arg currentVersion "$version_label" \
        --arg now "$now" \
        --arg lastUpdateStatus "$last_status" \
        --arg lastError "$error_msg" \
        --arg log "$log_tail" \
        '. + {
            state: $state,
            phase: (if $phase == "" then (.phase // null) else $phase end),
            currentCommit: $currentCommit,
            currentVersion: $currentVersion,
            lastUpdateAt: $now,
            lastUpdateStatus: (if $lastUpdateStatus == "" then (.lastUpdateStatus // null) else $lastUpdateStatus end),
            lastError: (if $lastError == "" then null else $lastError end),
            log: $log
        }
        # After a successful apply, HEAD now matches the release we just installed, so clear the
        # stale "update available" flag left over from the last check instead of waiting for the
        # next timer run.
        + (if $lastUpdateStatus == "success" then { remoteCommit: $currentCommit, remoteVersion: null, updateAvailable: false } else {} end)'
}

on_exit() {
    local exit_code=$?
    if [ "$exit_code" -ne 0 ]; then
        write_status "failed" "failed" "${FAILURE_MESSAGE:-Aggiornamento fallito (exit $exit_code). Dettagli: journalctl -u easylab-update.service}"
    fi
    rm -f "$LOG_FILE"
}
trap on_exit EXIT

write_status "running" "" "" "verify"

set -euo pipefail

{
    echo "=== git fetch ==="
    git fetch --all --prune --tags --force
    # Whoever can push to main would otherwise run code as root on this VM: `docker compose up
    # --build` executes whatever the new Dockerfiles say. The signature ties the update to the
    # owner's signing key, not just to the GitHub account. What is installed is a release tag, so
    # it is the tag's signature that is checked, not the last commit of main.
    echo "=== verify the signed release tag ==="
    if [ ! -f "$ALLOWED_SIGNERS" ]; then
        FAILURE_MESSAGE="Manca ops/allowed_signers sulla VM, quindi la firma delle versioni non si può verificare: aggiornamento annullato, non è stato cambiato nulla. Vedi docs/DEPLOY.md, \"Firma dei commit e versioni\"."
        exit 1
    fi
    if ! command -v ssh-keygen >/dev/null 2>&1; then
        FAILURE_MESSAGE="ssh-keygen non è installato sulla VM, quindi la firma delle versioni non si può verificare: aggiornamento annullato, non è stato cambiato nulla. Installa openssh-client (apt-get install -y openssh-client) e riprova."
        exit 1
    fi
    # SSH signatures arrived in git 2.34: an older git (Debian 11 ships 2.30) would report every
    # tag as badly signed, which reads like an attack instead of an outdated package.
    git_version="$(git --version | awk '{print $3}')"
    if [ "$(printf '%s\n' 2.34 "$git_version" | sort -V | head -n1)" != "2.34" ]; then
        FAILURE_MESSAGE="La versione di git sulla VM ($git_version) non sa verificare le firme SSH (serve la 2.34 o successiva): aggiornamento annullato, non è stato cambiato nulla. Aggiorna git (apt-get install -y git da una distribuzione recente) e riprova."
        exit 1
    fi
    if ! TARGET_TAG="$(latest_signed_release_tag "$ALLOWED_SIGNERS")"; then
        FAILURE_MESSAGE="Nessuna versione firmata da installare: non c'è un tag vX.Y.Z con una firma valida di una chiave ammessa (ops/allowed_signers). Aggiornamento annullato, non è stato cambiato nulla. Vedi docs/DEPLOY.md, \"Firma dei commit e versioni\"."
        exit 1
    fi
    echo "release tag: $TARGET_TAG"
    # The newest signed tag older than the installed code would silently take the server back
    # (the database does not go back with it). Going back is the manual rollback, on purpose.
    if ! git merge-base --is-ancestor HEAD "refs/tags/$TARGET_TAG^{commit}"; then
        FAILURE_MESSAGE="L'ultima versione firmata ($TARGET_TAG) non contiene il codice installato (è più vecchia): aggiornamento annullato, non è stato cambiato nulla. Per tornare a una versione precedente serve il rollback manuale (docs/DEPLOY.md)."
        exit 1
    fi
} >>"$LOG_FILE" 2>&1

write_status "running" "" "" "code"

{
    echo "=== git reset --hard $TARGET_TAG ==="
    git reset --hard "refs/tags/$TARGET_TAG^{commit}"
} >>"$LOG_FILE" 2>&1

write_status "running" "" "" "build"

{
    echo "=== docker compose up --build -d --remove-orphans ==="
    docker compose up --build -d --remove-orphans
} >>"$LOG_FILE" 2>&1

write_status "running" "" "" "cleanup"

{
    echo "=== docker image prune -f ==="
    docker image prune -f
    echo "=== docker builder prune -f --filter until=24h ==="
    docker builder prune -f --filter until=24h
} >>"$LOG_FILE" 2>&1

write_status "success" "success" ""
