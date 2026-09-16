#!/usr/bin/env bash
# One-time setup on the Proxmox VM: installs the systemd units that let the
# Settings > Aggiornamenti page trigger updates. Run once with sudo after the
# first `docker compose up --build -d`.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
    echo "Esegui questo script con sudo/root." >&2
    exit 1
fi

read -r -p "Vuoi attivare gli aggiornamenti automatici? [S/n] " answer
case "${answer,,}" in
    n|no)
        echo "Aggiornamenti automatici non attivati. Rilancia questo script in qualsiasi momento per attivarli."
        exit 0
        ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
UNIT_SRC_DIR="$REPO_ROOT/ops/systemd"
UNIT_DEST_DIR="/etc/systemd/system"

echo "Repo: $REPO_ROOT"

# ops/update receives the trigger files from the backend container, whose entrypoint makes it the
# owner: nobody else needs to write there, so no 777. ops/update-status is root's alone and is
# mounted read-only into the container (see scripts/update-status-lib.sh).
mkdir -p "$REPO_ROOT/ops/update" "$REPO_ROOT/ops/update-status"
chmod 755 "$REPO_ROOT/ops/update"
chown root:root "$REPO_ROOT/ops/update-status"
chmod 755 "$REPO_ROOT/ops/update-status"

if ! command -v jq >/dev/null 2>&1; then
    echo "jq non trovato, installazione..."
    apt-get update -y
    apt-get install -y jq
fi

# update-server.sh verifies the signature of origin/main with `git verify-commit`, which checks
# SSH signatures through ssh-keygen (see docs/DEPLOY.md, "Firma dei commit").
if ! command -v ssh-keygen >/dev/null 2>&1; then
    echo "ssh-keygen non trovato, installazione..."
    apt-get update -y
    apt-get install -y openssh-client
fi

command -v git >/dev/null 2>&1 || { echo "git non trovato. Installalo (apt-get install -y git) e riprova." >&2; exit 1; }
command -v docker >/dev/null 2>&1 || { echo "docker non trovato. Installa Docker Engine e riprova." >&2; exit 1; }

chmod +x "$REPO_ROOT/scripts/update-server.sh" "$REPO_ROOT/scripts/check-updates.sh"

for unit in easylab-update.path easylab-update.service easylab-check-updates.path easylab-check-updates.service easylab-check-updates.timer; do
    sed "s#__REPO_ROOT__#$REPO_ROOT#g" "$UNIT_SRC_DIR/$unit" > "$UNIT_DEST_DIR/$unit"
done

systemctl daemon-reload
systemctl enable --now easylab-update.path easylab-check-updates.path easylab-check-updates.timer

echo ""
echo "Updater installato."
systemctl status easylab-update.path easylab-check-updates.path easylab-check-updates.timer --no-pager || true
